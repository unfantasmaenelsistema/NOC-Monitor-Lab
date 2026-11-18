import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Sliders } from 'lucide-react';
import { compareOperator, extractSeriesValue } from '../engine/telemetryEngine';
import { Host, TriggerEvalFunc, TriggerMetric, TriggerOperator } from '../types/noc';

interface TriggerSandboxCanvasProps {
  hosts: Host[];
  wanFlapSimulation: boolean;
  onToggleWanFlap: () => void;
  onInjectHostAnomaly: (hostId: string, kind: 'cpu_spike' | 'host_down') => void;
  onRecoverHost: (hostId: string) => void;
}

const METRIC_LABELS: Record<TriggerMetric, { label: string; unit: string; defaultMax: number }> = {
  cpu: { label: 'CPU Utilization (%)', unit: '%', defaultMax: 100 },
  icmpLatencyMs: { label: 'Latencia ICMP (ms)', unit: 'ms', defaultMax: 130 },
  netInMbps: { label: 'Tráfico Entrada (Mbps)', unit: 'Mbps', defaultMax: 700 },
  netOutMbps: { label: 'Tráfico Salida (Mbps)', unit: 'Mbps', defaultMax: 700 },
  netTotalMbps: { label: 'Tráfico Total (Mbps)', unit: 'Mbps', defaultMax: 1100 },
  ramPct: { label: 'Uso de RAM (%)', unit: '%', defaultMax: 100 },
  diskPct: { label: 'Uso de Disco (%)', unit: '%', defaultMax: 100 },
  packetLossPct: { label: 'Pérdida Paquetes (%)', unit: '%', defaultMax: 100 },
};

export const TriggerSandboxCanvas: React.FC<TriggerSandboxCanvasProps> = ({
  hosts,
  wanFlapSimulation,
  onToggleWanFlap,
  onInjectHostAnomaly,
  onRecoverHost,
}) => {
  const [hostId, setHostId] = useState<string>(
    hosts.find((h) => h.id === 'rtr-borde-isp')?.id ?? hosts[0]?.id ?? ''
  );
  const [metric, setMetric] = useState<TriggerMetric>('icmpLatencyMs');
  const [evalFunc, setEvalFunc] = useState<TriggerEvalFunc>('last');
  const [operator, setOperator] = useState<TriggerOperator>('>');
  const [problemThreshold, setProblemThreshold] = useState<number>(100);
  const [useHysteresis, setUseHysteresis] = useState<boolean>(false);
  const [recoveryThreshold, setRecoveryThreshold] = useState<number>(85);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const selectedHost = useMemo(
    () => hosts.find((h) => h.id === hostId) ?? hosts[0],
    [hosts, hostId]
  );

  const applyPreset = (preset: 'sql_fp' | 'wan_flap' | 'nas_backup') => {
    if (preset === 'sql_fp') {
      setHostId('srv-db-prod');
      setMetric('cpu');
      setEvalFunc('last');
      setOperator('>');
      setProblemThreshold(85);
      setUseHysteresis(false);
      setRecoveryThreshold(70);
    } else if (preset === 'wan_flap') {
      setHostId('rtr-borde-isp');
      setMetric('icmpLatencyMs');
      setEvalFunc('last');
      setOperator('>');
      setProblemThreshold(100);
      setUseHysteresis(false);
      setRecoveryThreshold(85);
    } else {
      setHostId('nas-backup-01');
      setMetric('netInMbps');
      setEvalFunc('last');
      setOperator('>');
      setProblemThreshold(315);
      setUseHysteresis(true);
      setRecoveryThreshold(270);
    }
  };

  // Compute simulated evaluation trace across the host's history window
  const simulation = useMemo(() => {
    const history = selectedHost?.history ?? [];
    const rawValues = history.map((pt) => extractSeriesValue(pt, metric));
    const evalValues: number[] = [];
    const states: Array<'OK' | 'PROBLEM'> = [];
    let isFiring = false;
    let transitions = 0;

    for (let i = 0; i < rawValues.length; i++) {
      let ev = rawValues[i];
      if (evalFunc === 'avg5m') {
        const start = Math.max(0, i - 9);
        const slice = rawValues.slice(start, i + 1);
        ev = slice.reduce((a, b) => a + b, 0) / slice.length;
      } else if (evalFunc === 'min3m') {
        const start = Math.max(0, i - 5);
        ev = Math.min(...rawValues.slice(start, i + 1));
      } else if (evalFunc === 'max') {
        const start = Math.max(0, i - 5);
        ev = Math.max(...rawValues.slice(start, i + 1));
      } else if (evalFunc === 'diff') {
        ev = i > 0 ? Math.abs(rawValues[i] - rawValues[i - 1]) : 0;
      }
      evalValues.push(Number(ev.toFixed(2)));

      const problemMet = compareOperator(ev, operator, problemThreshold);
      if (!isFiring) {
        if (problemMet) {
          isFiring = true;
          transitions += 1;
        }
      } else {
        if (useHysteresis) {
          if (ev < recoveryThreshold) {
            isFiring = false;
            transitions += 1;
          }
        } else if (!problemMet) {
          isFiring = false;
          transitions += 1;
        }
      }
      states.push(isFiring ? 'PROBLEM' : 'OK');
    }

    return {
      rawValues,
      evalValues,
      states,
      transitions,
      currentState: states[states.length - 1] ?? 'OK',
      latestRaw: rawValues[rawValues.length - 1] ?? 0,
      latestEval: evalValues[evalValues.length - 1] ?? 0,
    };
  }, [selectedHost, metric, evalFunc, operator, problemThreshold, useHysteresis, recoveryThreshold]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const width = parent.clientWidth || 640;
    const height = 210;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const { rawValues, evalValues, states } = simulation;
    if (rawValues.length < 2) return;

    const meta = METRIC_LABELS[metric];
    const maxData = Math.max(
      ...rawValues,
      ...evalValues,
      problemThreshold * 1.15,
      useHysteresis ? recoveryThreshold * 1.15 : 0
    );
    const yMax = Math.max(10, Math.min(meta.defaultMax * 1.5, Math.ceil(maxData)));
    const yMin = 0;

    const padLeft = 46;
    const padRight = 14;
    const padTop = 14;
    const padBottom = 20;
    const plotW = Math.max(20, width - padLeft - padRight);
    const plotH = Math.max(20, height - padTop - padBottom);

    const toX = (idx: number) => padLeft + (idx / (rawValues.length - 1)) * plotW;
    const toY = (val: number) =>
      padTop + plotH - Math.max(0, Math.min(1, (val - yMin) / (yMax - yMin))) * plotH;

    // Shaded problem intervals
    const stepW = plotW / Math.max(1, rawValues.length - 1);
    states.forEach((st, idx) => {
      if (st === 'PROBLEM') {
        ctx.fillStyle = 'rgba(239, 68, 68, 0.14)';
        ctx.fillRect(toX(idx) - stepW / 2, padTop, stepW, plotH);
      }
    });

    // Grid lines
    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = 1;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillStyle = '#6b7280';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    for (let i = 0; i <= 4; i++) {
      const y = padTop + (plotH * i) / 4;
      const val = yMax - ((yMax - yMin) * i) / 4;
      ctx.beginPath();
      ctx.moveTo(padLeft, Math.round(y) + 0.5);
      ctx.lineTo(width - padRight, Math.round(y) + 0.5);
      ctx.stroke();
      ctx.fillText(`${Math.round(val)}`, padLeft - 6, y);
    }

    // Recovery Threshold (Green dashed line)
    if (useHysteresis) {
      const recY = toY(recoveryThreshold);
      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(padLeft, recY);
      ctx.lineTo(width - padRight, recY);
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = '#34d399';
      ctx.textAlign = 'left';
      ctx.fillText(`Recuperación < ${recoveryThreshold}${meta.unit}`, padLeft + 6, recY - 8);
    }

    // Problem Threshold (Red dashed line)
    const probY = toY(problemThreshold);
    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 1.75;
    ctx.beginPath();
    ctx.moveTo(padLeft, probY);
    ctx.lineTo(width - padRight, probY);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = '#f87171';
    ctx.textAlign = 'right';
    ctx.fillText(
      `Disparo ${operator} ${problemThreshold}${meta.unit}`,
      width - padRight - 4,
      probY - 8
    );

    // Raw Metric Curve (Sky blue)
    ctx.beginPath();
    rawValues.forEach((v, idx) => {
      const x = toX(idx);
      const y = toY(v);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.75;
    ctx.stroke();

    // Evaluated Function Curve (Violet) when different from raw last()
    if (evalFunc !== 'last') {
      ctx.beginPath();
      evalValues.forEach((v, idx) => {
        const x = toX(idx);
        const y = toY(v);
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = '#a78bfa';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }, [simulation, metric, operator, problemThreshold, useHysteresis, recoveryThreshold, evalFunc]);

  const meta = METRIC_LABELS[metric];

  return (
    <div className="bg-[#111827] border border-[#1f2937] rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-[#1f2937] flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
            <Sliders className="w-4 h-4 text-sky-400 shrink-0" />
            <span>Simulador Visual de Umbrales (&quot;Trigger Sandbox&quot;)</span>
          </h3>
          <p className="text-[11px] text-slate-400">
            Compara en vivo last() vs avg(5m) y el efecto de la histéresis sobre curvas reales
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <button
            type="button"
            onClick={() => applyPreset('sql_fp')}
            className="px-2.5 py-1 rounded bg-[#0b0f19] border border-[#1f2937] hover:border-sky-500/50 text-sky-300"
          >
            Caso 1: Pico SQL 1s
          </button>
          <button
            type="button"
            onClick={() => applyPreset('nas_backup')}
            className="px-2.5 py-1 rounded bg-[#0b0f19] border border-[#1f2937] hover:border-sky-500/50 text-sky-300"
          >
            Caso 2: Backup NAS
          </button>
          <button
            type="button"
            onClick={() => applyPreset('wan_flap')}
            className="px-2.5 py-1 rounded bg-[#0b0f19] border border-[#1f2937] hover:border-amber-500/50 text-amber-300"
          >
            Caso 3: Flapping WAN
          </button>
        </div>
      </div>

      {/* Controls Row */}
      <div className="p-4 border-b border-[#1f2937] grid grid-cols-2 md:grid-cols-6 gap-3 text-xs items-end">
        <div>
          <label className="block text-slate-400 mb-1">Host</label>
          <select
            aria-label="Host del Sandbox"
            value={hostId}
            onChange={(e) => setHostId(e.target.value)}
            className="w-full px-2.5 py-1.5 rounded bg-[#0b0f19] border border-[#1f2937] text-slate-100 font-mono"
          >
            {hosts.map((h) => (
              <option key={h.id} value={h.id}>
                {h.hostname}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-slate-400 mb-1">Métrica</label>
          <select
            aria-label="Métrica del Sandbox"
            value={metric}
            onChange={(e) => setMetric(e.target.value as TriggerMetric)}
            className="w-full px-2.5 py-1.5 rounded bg-[#0b0f19] border border-[#1f2937] text-slate-100"
          >
            {Object.entries(METRIC_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-slate-400 mb-1">Función</label>
          <select
            aria-label="Función de evaluación"
            value={evalFunc}
            onChange={(e) => setEvalFunc(e.target.value as TriggerEvalFunc)}
            className="w-full px-2.5 py-1.5 rounded bg-[#0b0f19] border border-[#1f2937] text-violet-300 font-mono"
          >
            <option value="last">last() — Instantáneo</option>
            <option value="avg5m">avg(5m) — Promedio</option>
            <option value="min3m">min(3m) — Mínimo</option>
            <option value="max">max(3m) — Máximo</option>
            <option value="diff">diff() — Delta</option>
          </select>
        </div>

        <div>
          <label className="block text-slate-400 mb-1">Umbral Disparo ({meta.unit})</label>
          <input
            type="number"
            value={problemThreshold}
            onChange={(e) => setProblemThreshold(Number(e.target.value))}
            className="w-full px-2.5 py-1.5 rounded bg-[#0b0f19] border border-rose-500/40 text-rose-300 font-mono"
          />
        </div>

        <div>
          <label className="flex items-center gap-1.5 text-slate-400 mb-1 cursor-pointer">
            <input
              type="checkbox"
              checked={useHysteresis}
              onChange={(e) => setUseHysteresis(e.target.checked)}
              className="accent-emerald-500"
            />
            <span>Histéresis (&lt; {meta.unit})</span>
          </label>
          <input
            type="number"
            disabled={!useHysteresis}
            value={recoveryThreshold}
            onChange={(e) => setRecoveryThreshold(Number(e.target.value))}
            className={`w-full px-2.5 py-1.5 rounded bg-[#0b0f19] border font-mono ${
              useHysteresis
                ? 'border-emerald-500/40 text-emerald-300'
                : 'border-[#1f2937] text-slate-600'
            }`}
          />
        </div>

        <div className="flex items-center justify-end gap-2">
          {hostId === 'rtr-borde-isp' ? (
            <button
              type="button"
              onClick={onToggleWanFlap}
              className={`w-full px-2.5 py-1.5 rounded border text-xs font-medium transition-colors ${
                wanFlapSimulation
                  ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                  : 'bg-[#0b0f19] border-[#1f2937] text-slate-300'
              }`}
            >
              {wanFlapSimulation ? 'Pausar Ruido WAN' : 'Activar Ruido WAN'}
            </button>
          ) : selectedHost?.activeAnomaly ? (
            <button
              type="button"
              onClick={() => selectedHost && onRecoverHost(selectedHost.id)}
              className="w-full px-2.5 py-1.5 rounded bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 text-xs font-medium"
            >
              Normalizar Host
            </button>
          ) : (
            <button
              type="button"
              onClick={() => selectedHost && onInjectHostAnomaly(selectedHost.id, 'cpu_spike')}
              className="w-full px-2.5 py-1.5 rounded bg-rose-600/20 border border-rose-500/40 text-rose-300 text-xs font-medium"
            >
              Inyectar Pico
            </button>
          )}
        </div>
      </div>

      {/* Canvas & Live Readout */}
      <div className="p-4 bg-[#0b0f19]">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-2 text-xs font-mono tabular-nums">
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-sky-300">
              Valor crudo: <strong>{simulation.latestRaw.toFixed(1)}{meta.unit}</strong>
            </span>
            {evalFunc !== 'last' && (
              <span className="text-violet-300">
                Evaluado ({evalFunc}):{' '}
                <strong>{simulation.latestEval.toFixed(1)}{meta.unit}</strong>
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <span className="text-slate-400">
              Transiciones (Flaps) en ventana:{' '}
              <strong className={simulation.transitions >= 4 ? 'text-amber-300' : 'text-slate-100'}>
                {simulation.transitions}
              </strong>
            </span>
            <span
              className={`font-bold ${
                simulation.currentState === 'PROBLEM' ? 'text-rose-400' : 'text-emerald-400'
              }`}
            >
              Estado Sandbox: {simulation.currentState}
            </span>
          </div>
        </div>

        <canvas ref={canvasRef} className="block w-full" />
      </div>
    </div>
  );
};
