import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileText,
  Pause,
  Play,
  RotateCcw,
  Wrench,
  XCircle,
  Zap,
} from 'lucide-react';
import { ZABBIX_SEVERITIES } from '../data/initialData';
import { Host, AlarmProblem, SimulationSpeed, SeverityLevel } from '../types/noc';

interface TopBarProps {
  hosts: Host[];
  problems: AlarmProblem[];
  simulationSpeed: SimulationSpeed;
  onChangeSpeed: (speed: SimulationSpeed) => void;
  onOpenChaosModal: () => void;
  onRecoverAll: () => void;
  onOpenProblems: () => void;
  onOpenReport: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  hosts,
  problems,
  simulationSpeed,
  onChangeSpeed,
  onOpenChaosModal,
  onRecoverAll,
  onOpenProblems,
  onOpenReport,
}) => {
  const [clock, setClock] = useState<string>(() =>
    new Date().toLocaleTimeString('es-ES', { hour12: false })
  );

  useEffect(() => {
    const id = window.setInterval(() => {
      setClock(new Date().toLocaleTimeString('es-ES', { hour12: false }));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const upCount = hosts.filter((h) => h.status === 'UP').length;
  const warnCount = hosts.filter((h) => h.status === 'WARNING').length;
  const downCount = hosts.filter((h) => h.status === 'DOWN').length;
  const maintCount = hosts.filter((h) => h.status === 'MAINTENANCE').length;

  const activeProblems = problems.filter((p) => !p.resolved);
  const hasAnomalies = activeProblems.length > 0 || hosts.some((h) => h.activeAnomaly !== null);

  const severityCounts = ZABBIX_SEVERITIES.reduce((acc, sev) => {
    acc[sev.key] = activeProblems.filter((p) => p.severity === sev.key).length;
    return acc;
  }, {} as Record<SeverityLevel, number>);

  const speeds: Array<{ value: SimulationSpeed; label: string }> = [
    { value: 0, label: 'Pausa' },
    { value: 1, label: '1x' },
    { value: 2, label: '2x' },
    { value: 5, label: '5x' },
  ];

  return (
    <header className="bg-[#111827] border-b border-[#1f2937] px-5 py-2.5 flex flex-wrap items-center justify-between gap-4">
      {/* Left: Global Host & Alarm Status Counters */}
      <div className="flex flex-wrap items-center gap-5 text-xs">
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-1.5 text-emerald-400 font-medium whitespace-nowrap">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            <span>Up</span>
            <span className="font-mono tabular-nums font-semibold text-slate-100">{upCount}</span>
          </span>

          <span className="text-slate-700" aria-hidden="true">
            /
          </span>

          <span className="inline-flex items-center gap-1.5 text-amber-400 font-medium whitespace-nowrap">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>Warn</span>
            <span className="font-mono tabular-nums font-semibold text-slate-100">{warnCount}</span>
          </span>

          <span className="text-slate-700" aria-hidden="true">
            /
          </span>

          <span className="inline-flex items-center gap-1.5 text-rose-400 font-medium whitespace-nowrap">
            <XCircle className="w-3.5 h-3.5 shrink-0" />
            <span>Down</span>
            <span className="font-mono tabular-nums font-semibold text-slate-100">{downCount}</span>
          </span>

          <span className="text-slate-700" aria-hidden="true">
            /
          </span>

          <span className="inline-flex items-center gap-1.5 text-slate-400 font-medium whitespace-nowrap">
            <Wrench className="w-3.5 h-3.5 shrink-0" />
            <span>Mant.</span>
            <span className="font-mono tabular-nums font-semibold text-slate-100">{maintCount}</span>
          </span>
        </div>

        {/* Global Severity Breakdown */}
        <button
          type="button"
          onClick={onOpenProblems}
          title="Ver alarmas activas por severidad Zabbix"
          className="hidden xl:flex items-center gap-3 pl-5 border-l border-[#1f2937] text-xs hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 rounded"
        >
          <span className="text-slate-400 whitespace-nowrap">Alarmas:</span>
          {ZABBIX_SEVERITIES.filter((s) => s.key !== 'not_classified').map((sev) => (
            <span
              key={sev.key}
              className="inline-flex items-center gap-1.5 font-mono tabular-nums whitespace-nowrap"
            >
              <span
                className="w-2.5 h-2.5 rounded-xs shrink-0"
                style={{ backgroundColor: sev.color }}
                aria-hidden="true"
              />
              <span className="text-slate-400 text-[11px]">{sev.label.slice(0, 4)}</span>
              <span className="text-slate-100 font-semibold">{severityCounts[sev.key]}</span>
            </span>
          ))}
        </button>
      </div>

      {/* Right: Simulation Controls, Chaos Injector, Clock */}
      <div className="flex flex-wrap items-center gap-3 shrink-0 max-w-full">
        {/* Simulation Speed Segmented Control */}
        <div
          className="inline-flex items-center bg-[#0b0f19] border border-[#1f2937] rounded-md p-0.5"
          role="group"
          aria-label="Velocidad de simulación"
        >
          {speeds.map((sp) => {
            const active = simulationSpeed === sp.value;
            return (
              <button
                key={sp.value}
                type="button"
                onClick={() => onChangeSpeed(sp.value)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
                  active
                    ? sp.value === 0
                      ? 'bg-amber-500/20 text-amber-300'
                      : 'bg-sky-500/20 text-sky-300'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {sp.value === 0 ? (
                  <Pause className="w-3 h-3 shrink-0" />
                ) : (
                  <Play className="w-3 h-3 shrink-0" />
                )}
                <span>{sp.label}</span>
              </button>
            );
          })}
        </div>

        {/* Inject Chaos Button */}
        <button
          type="button"
          onClick={onOpenChaosModal}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-rose-600/90 hover:bg-rose-500 text-white transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
        >
          <Zap className="w-3.5 h-3.5 shrink-0" />
          <span>Inyectar Anomalía / Caos</span>
        </button>

        {hasAnomalies && (
          <button
            type="button"
            onClick={onRecoverAll}
            title="Restaurar todos los hosts a estado nominal"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border border-[#1f2937] bg-[#0b0f19] hover:bg-[#1f2937] text-emerald-400 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          >
            <RotateCcw className="w-3.5 h-3.5 shrink-0" />
            <span>Restaurar</span>
          </button>
        )}

        <button
          type="button"
          onClick={onOpenReport}
          title="Exportar Informe de Turno NOC / Auditoría"
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border border-[#1f2937] bg-[#0b0f19] hover:bg-[#1f2937] text-slate-200 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
        >
          <FileText className="w-3.5 h-3.5 text-sky-400 shrink-0" />
          <span className="hidden sm:inline">Informe</span>
        </button>

        {/* Real-Time System Clock */}
        <div className="pl-3 border-l border-[#1f2937] flex items-center gap-1.5 text-xs font-mono tabular-nums text-slate-200 whitespace-nowrap shrink-0">
          <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span>{clock}</span>
        </div>
      </div>
    </header>
  );
};
