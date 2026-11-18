import React, { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { buildTriggerExpressions } from '../data/initialData';
import {
  Host,
  SeverityLevel,
  TriggerCategory,
  TriggerEvalFunc,
  TriggerMetric,
  TriggerOperator,
  TriggerRule,
} from '../types/noc';

interface TriggerBuilderModalProps {
  initialTrigger: TriggerRule | null;
  hosts: Host[];
  allTriggers: TriggerRule[];
  onSave: (trigger: TriggerRule) => void;
  onClose: () => void;
}

const METRIC_UNIT: Record<TriggerMetric, string> = {
  cpu: '%',
  ramPct: '%',
  diskPct: '%',
  packetLossPct: '%',
  icmpLatencyMs: 'ms',
  netTotalMbps: 'Mbps',
  netInMbps: 'Mbps',
  netOutMbps: 'Mbps',
};

export const TriggerBuilderModal: React.FC<TriggerBuilderModalProps> = ({
  initialTrigger,
  hosts,
  allTriggers,
  onSave,
  onClose,
}) => {
  const isEdit = Boolean(initialTrigger);

  const [name, setName] = useState(initialTrigger?.name ?? '');
  const [hostId, setHostId] = useState(initialTrigger?.hostId ?? 'ALL');
  const [category, setCategory] = useState<TriggerCategory>(initialTrigger?.category ?? 'CPU');
  const [severity, setSeverity] = useState<SeverityLevel>(initialTrigger?.severity ?? 'high');
  const [metric, setMetric] = useState<TriggerMetric>(initialTrigger?.metric ?? 'cpu');
  const [evalFunc, setEvalFunc] = useState<TriggerEvalFunc>(initialTrigger?.evalFunc ?? 'avg5m');
  const [operator, setOperator] = useState<TriggerOperator>(initialTrigger?.operator ?? '>');
  const [threshold, setThreshold] = useState<number>(initialTrigger?.threshold ?? 85);
  const [useHysteresis, setUseHysteresis] = useState<boolean>(
    initialTrigger?.useHysteresis ?? true
  );
  const [recoveryOperator, setRecoveryOperator] = useState<TriggerOperator>(
    initialTrigger?.recoveryOperator ?? '<'
  );
  const [recoveryThreshold, setRecoveryThreshold] = useState<number>(
    initialTrigger?.recoveryThreshold ?? 70
  );
  const [dependsOnTriggerId, setDependsOnTriggerId] = useState<string>(
    initialTrigger?.dependsOnTriggerId ?? ''
  );
  const [enabled, setEnabled] = useState<boolean>(initialTrigger?.enabled ?? true);
  const [error, setError] = useState('');

  const hostnameLabel = useMemo(() => {
    if (hostId === 'ALL') return 'HOST';
    return hosts.find((h) => h.id === hostId)?.hostname ?? 'HOST';
  }, [hostId, hosts]);

  const preview = useMemo(
    () =>
      buildTriggerExpressions({
        hostnameLabel,
        metric,
        evalFunc,
        operator,
        threshold,
        useHysteresis,
        recoveryOperator,
        recoveryThreshold,
      }),
    [
      hostnameLabel,
      metric,
      evalFunc,
      operator,
      threshold,
      useHysteresis,
      recoveryOperator,
      recoveryThreshold,
    ]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('El nombre del trigger es obligatorio.');
      return;
    }

    const rule: TriggerRule = {
      id: initialTrigger?.id ?? `trg-custom-${Date.now().toString(36)}`,
      name: name.trim(),
      hostId,
      category,
      metric,
      evalFunc,
      operator,
      threshold: Number(threshold),
      unit: METRIC_UNIT[metric],
      severity,
      useHysteresis,
      recoveryOperator,
      recoveryThreshold: Number(recoveryThreshold),
      dependsOnTriggerId: dependsOnTriggerId || null,
      expressionTemplate: preview.problemExpr,
      recoveryExpressionTemplate: preview.recoveryExpr,
      enabled,
      transitionCount: initialTrigger?.transitionCount ?? 0,
      lastStateByHost: initialTrigger?.lastStateByHost ?? {},
      antiPatternNote: undefined,
    };

    onSave(rule);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={isEdit ? 'Editar Trigger' : 'Constructor de Trigger'}
    >
      <div className="w-full max-w-2xl bg-[#111827] border border-[#1f2937] rounded-lg shadow-2xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#1f2937] flex items-center justify-between bg-[#0b0f19]">
          <h3 className="text-sm font-semibold text-slate-100">
            {isEdit ? `Editar Trigger: ${initialTrigger?.name}` : 'Constructor Visual de Trigger'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar constructor de trigger"
            className="p-1 rounded text-slate-400 hover:text-slate-100 hover:bg-[#1f2937]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs max-h-[85vh] overflow-y-auto">
          {error && (
            <div className="p-2.5 rounded bg-rose-950/40 border border-rose-500/40 text-rose-200">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="sm:col-span-2">
              <label className="block text-slate-300 font-medium mb-1">Nombre del Trigger</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej. Latencia WAN sostenida con histéresis"
                className="w-full px-3 py-2 rounded bg-[#0b0f19] border border-[#1f2937] text-slate-100 focus:outline-none focus:border-sky-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">Host Objetivo</label>
              <select
                value={hostId}
                onChange={(e) => setHostId(e.target.value)}
                className="w-full px-3 py-2 rounded bg-[#0b0f19] border border-[#1f2937] text-slate-100 font-mono"
              >
                <option value="ALL">Todos los Hosts (Template Global)</option>
                {hosts.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.hostname} ({h.ip})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">Severidad Zabbix</label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value as SeverityLevel)}
                className="w-full px-3 py-2 rounded bg-[#0b0f19] border border-[#1f2937] text-slate-100"
              >
                <option value="information">Information</option>
                <option value="warning">Warning</option>
                <option value="average">Average</option>
                <option value="high">High</option>
                <option value="disaster">Disaster</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">Categoría</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as TriggerCategory)}
                className="w-full px-3 py-2 rounded bg-[#0b0f19] border border-[#1f2937] text-slate-100"
              >
                <option value="CPU">CPU</option>
                <option value="Memoria">Memoria</option>
                <option value="Disco">Disco</option>
                <option value="Red">Red</option>
                <option value="Disponibilidad">Disponibilidad</option>
                <option value="Falso Positivo / Lab">Falso Positivo / Lab</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">Métrica / Ítem</label>
              <select
                value={metric}
                onChange={(e) => setMetric(e.target.value as TriggerMetric)}
                className="w-full px-3 py-2 rounded bg-[#0b0f19] border border-[#1f2937] text-slate-100 font-mono"
              >
                <option value="cpu">system.cpu.util (%)</option>
                <option value="ramPct">vm.memory.util (%)</option>
                <option value="diskPct">vfs.fs.size[/,pused] (%)</option>
                <option value="icmpLatencyMs">icmppingsec (ms)</option>
                <option value="packetLossPct">icmppingloss (%)</option>
                <option value="netInMbps">net.if.in (Mbps)</option>
                <option value="netOutMbps">net.if.out (Mbps)</option>
                <option value="netTotalMbps">net.if.total (Mbps)</option>
              </select>
            </div>
          </div>

          {/* Problem Expression Builder */}
          <div className="p-3.5 rounded bg-[#0b0f19] border border-[#1f2937] space-y-3">
            <div className="font-semibold text-rose-300">Expresión de Problema</div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-slate-400 mb-1">Función</label>
                <select
                  value={evalFunc}
                  onChange={(e) => setEvalFunc(e.target.value as TriggerEvalFunc)}
                  className="w-full px-2.5 py-1.5 rounded bg-[#111827] border border-[#1f2937] text-slate-100 font-mono"
                >
                  <option value="last">last()</option>
                  <option value="avg5m">avg(5m)</option>
                  <option value="min3m">min(3m)</option>
                  <option value="max">max(3m)</option>
                  <option value="diff">diff()</option>
                  <option value="nodata60s">nodata(60s)</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Operador</label>
                <select
                  value={operator}
                  disabled={evalFunc === 'nodata60s'}
                  onChange={(e) => setOperator(e.target.value as TriggerOperator)}
                  className="w-full px-2.5 py-1.5 rounded bg-[#111827] border border-[#1f2937] text-slate-100 font-mono"
                >
                  <option value=">">&gt;</option>
                  <option value=">=">&gt;=</option>
                  <option value="<">&lt;</option>
                  <option value="<=">&lt;=</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-400 mb-1">
                  Umbral ({METRIC_UNIT[metric]})
                </label>
                <input
                  type="number"
                  disabled={evalFunc === 'nodata60s'}
                  value={threshold}
                  onChange={(e) => setThreshold(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 rounded bg-[#111827] border border-[#1f2937] text-rose-300 font-mono"
                />
              </div>
            </div>
            <div className="font-mono text-[11px] text-sky-300 break-all">
              Problem: {preview.problemExpr}
            </div>
          </div>

          {/* Hysteresis Recovery Builder */}
          <div className="p-3.5 rounded bg-[#0b0f19] border border-[#1f2937] space-y-3">
            <label className="flex items-center gap-2 font-semibold text-emerald-300 cursor-pointer">
              <input
                type="checkbox"
                checked={useHysteresis}
                onChange={(e) => setUseHysteresis(e.target.checked)}
                className="accent-emerald-500"
              />
              <span>Activar Expresión de Recuperación (Histéresis anti-flapping)</span>
            </label>

            {useHysteresis && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Operador Recuperación</label>
                  <select
                    value={recoveryOperator}
                    onChange={(e) => setRecoveryOperator(e.target.value as TriggerOperator)}
                    className="w-full px-2.5 py-1.5 rounded bg-[#111827] border border-[#1f2937] text-slate-100 font-mono"
                  >
                    <option value="<">&lt;</option>
                    <option value="<=">&lt;=</option>
                    <option value=">">&gt;</option>
                    <option value=">=">&gt;=</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">
                    Umbral Recuperación ({METRIC_UNIT[metric]})
                  </label>
                  <input
                    type="number"
                    value={recoveryThreshold}
                    onChange={(e) => setRecoveryThreshold(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 rounded bg-[#111827] border border-[#1f2937] text-emerald-300 font-mono"
                  />
                </div>
              </div>
            )}
            <div className="font-mono text-[11px] text-emerald-300 break-all">
              Recovery: {preview.recoveryExpr}
            </div>
          </div>

          {/* Dependency Selector */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 items-center">
            <div>
              <label className="block text-slate-300 font-medium mb-1">
                Dependencia (Supresión de tormenta)
              </label>
              <select
                value={dependsOnTriggerId}
                onChange={(e) => setDependsOnTriggerId(e.target.value)}
                className="w-full px-3 py-2 rounded bg-[#0b0f19] border border-[#1f2937] text-slate-100"
              >
                <option value="">Sin dependencia</option>
                {allTriggers
                  .filter((t) => t.id !== initialTrigger?.id)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      Depende de: {t.name}
                    </option>
                  ))}
              </select>
            </div>

            <label className="flex items-center gap-2 text-slate-200 font-medium cursor-pointer pt-5">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="accent-sky-500"
              />
              <span>Trigger habilitado en el motor</span>
            </label>
          </div>

          <div className="pt-3 border-t border-[#1f2937] flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded border border-[#1f2937] text-slate-300 hover:bg-[#1f2937]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded bg-sky-600 hover:bg-sky-500 text-white font-semibold"
            >
              {isEdit ? 'Guardar Trigger' : 'Crear Trigger'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
