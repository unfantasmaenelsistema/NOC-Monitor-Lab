import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertOctagon,
  Check,
  Filter,
  MessageSquareText,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Wrench,
} from 'lucide-react';
import { SEVERITY_MAP, ZABBIX_SEVERITIES } from '../data/initialData';
import { formatTimeHms } from '../engine/telemetryEngine';
import { TriageProblemPayload } from '../state/useNocStore';
import {
  AlarmProblem,
  Host,
  HostGroup,
  SeverityLevel,
  TriggerRule,
} from '../types/noc';
import { ProblemTriageModal } from './ProblemTriageModal';

interface ProblemsConsoleViewProps {
  hosts: Host[];
  problems: AlarmProblem[];
  triggers: TriggerRule[];
  onSelectHost: (hostId: string) => void;
  onAckProblem: (problemId: string) => void;
  onResolveProblem: (problemId: string) => void;
  onTriageProblem: (payload: TriageProblemPayload) => void;
  onFixAntiPatternTrigger: (triggerId: string) => void;
  onToggleTrigger: (triggerId: string) => void;
  onRunDiagnosticRecovery: (hostId: string, problemId: string, actionLabel: string) => void;
  onNavigateToTriggers: () => void;
}

const HOST_GROUPS: Array<'ALL' | HostGroup> = [
  'ALL',
  'Seguridad',
  'Networking',
  'Servidores',
  'Almacenamiento',
];

function formatDurationLive(startedAt: number, now: number, resolvedAt?: number): string {
  const end = resolvedAt ?? now;
  const sec = Math.max(0, Math.floor((end - startedAt) / 1000));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

function formatOriginLabel(source: AlarmProblem['sourceCheck']): {
  label: string;
  colorClass: string;
} {
  if (source === 'Activo (Agente)') {
    return { label: 'ACTIVE AGENT', colorClass: 'text-emerald-300' };
  }
  if (source === 'SNMP Trap') {
    return { label: 'SNMP TRAP', colorClass: 'text-amber-300' };
  }
  return { label: 'PASSIVE POLL', colorClass: 'text-sky-300' };
}

export const ProblemsConsoleView: React.FC<ProblemsConsoleViewProps> = ({
  hosts,
  problems,
  triggers,
  onSelectHost,
  onAckProblem,
  onResolveProblem,
  onTriageProblem,
  onFixAntiPatternTrigger,
  onToggleTrigger,
  onRunDiagnosticRecovery,
  onNavigateToTriggers,
}) => {
  const [minSeverity, setMinSeverity] = useState<'ALL' | SeverityLevel>('ALL');
  const [groupFilter, setGroupFilter] = useState<'ALL' | HostGroup>('ALL');
  const [showResolved, setShowResolved] = useState(false);
  const [showSuppressed, setShowSuppressed] = useState(true);
  const [onlyFlappingOrFp, setOnlyFlappingOrFp] = useState(false);
  const [blinkNewAlarms, setBlinkNewAlarms] = useState(true);
  const [activeTriageId, setActiveTriageId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const triggerMap = useMemo(() => {
    const map = new Map<string, TriggerRule>();
    for (const t of triggers) map.set(t.id, t);
    return map;
  }, [triggers]);

  const hostMap = useMemo(() => {
    const map = new Map<string, Host>();
    for (const h of hosts) map.set(h.id, h);
    return map;
  }, [hosts]);

  const isFlappingOrFp = (p: AlarmProblem): boolean => {
    if (p.markedFalsePositive) return true;
    const trg = p.triggerId ? triggerMap.get(p.triggerId) : undefined;
    if (!trg) return false;
    return trg.transitionCount > 3 || Boolean(trg.antiPatternNote);
  };

  const filteredProblems = useMemo(() => {
    const minOrder = minSeverity === 'ALL' ? -1 : SEVERITY_MAP[minSeverity].order;
    return problems.filter((p) => {
      if (!showResolved && p.resolved) return false;
      if (!showSuppressed && p.suppressedInMaintenance) return false;
      if (groupFilter !== 'ALL' && p.hostGroup !== groupFilter) return false;
      if (minOrder >= 0 && SEVERITY_MAP[p.severity].order < minOrder) return false;
      if (onlyFlappingOrFp && !isFlappingOrFp(p)) return false;
      return true;
    });
  }, [
    problems,
    showResolved,
    showSuppressed,
    groupFilter,
    minSeverity,
    onlyFlappingOrFp,
    triggerMap,
  ]);

  const stats = useMemo(() => {
    const active = problems.filter((p) => !p.resolved);
    const suppressed = active.filter((p) => p.suppressedInMaintenance).length;
    const unack = active.filter((p) => !p.acknowledged && !p.suppressedInMaintenance).length;
    const flapping = active.filter((p) => isFlappingOrFp(p)).length;
    return { activeTotal: active.length, suppressed, unack, flapping };
  }, [problems, triggerMap]);

  const triageProblem = useMemo(
    () => problems.find((p) => p.id === activeTriageId) ?? null,
    [problems, activeTriageId]
  );

  return (
    <div className="space-y-4">
      {/* Header & Counters */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">
            Consola de Problemas — Monitoring &rarr; Problems
          </h2>
          <p className="text-xs text-slate-400">
            Triaje en vivo estilo Zabbix · Reconocimiento (Ack), bitácora técnica, detección de
            flapping y scripts remotos de diagnóstico
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs bg-[#111827] border border-[#1f2937] rounded-md px-3.5 py-2">
          <span className="text-slate-400">
            Activos:{' '}
            <strong className="font-mono tabular-nums text-slate-100">{stats.activeTotal}</strong>
          </span>
          <span className="text-slate-700">·</span>
          <span className="text-rose-300">
            Sin Ack:{' '}
            <strong className="font-mono tabular-nums text-rose-400">{stats.unack}</strong>
          </span>
          <span className="text-slate-700">·</span>
          <span className="text-amber-300 inline-flex items-center gap-1">
            <Wrench className="w-3 h-3" />
            Suppressed:{' '}
            <strong className="font-mono tabular-nums">{stats.suppressed}</strong>
          </span>
          <span className="text-slate-700">·</span>
          <span className="text-sky-300">
            Flapping / FP:{' '}
            <strong className="font-mono tabular-nums">{stats.flapping}</strong>
          </span>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="bg-[#111827] border border-[#1f2937] rounded-lg p-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5 text-slate-400 font-medium">
            <Filter className="w-3.5 h-3.5 text-sky-400" />
            <span>Filtros:</span>
          </div>

          <select
            aria-label="Severidad mínima"
            value={minSeverity}
            onChange={(e) => setMinSeverity(e.target.value as 'ALL' | SeverityLevel)}
            className="px-2.5 py-1.5 rounded bg-[#0b0f19] border border-[#1f2937] text-xs text-slate-200"
          >
            <option value="ALL">Severidad: Todas</option>
            {ZABBIX_SEVERITIES.filter((s) => s.key !== 'not_classified').map((s) => (
              <option key={s.key} value={s.key}>
                Mínimo: {s.label}
              </option>
            ))}
          </select>

          <select
            aria-label="Grupo de hosts"
            value={groupFilter}
            onChange={(e) => setGroupFilter(e.target.value as 'ALL' | HostGroup)}
            className="px-2.5 py-1.5 rounded bg-[#0b0f19] border border-[#1f2937] text-xs text-slate-200"
          >
            {HOST_GROUPS.map((g) => (
              <option key={g} value={g}>
                {g === 'ALL' ? 'Grupo: Todos' : `Grupo: ${g}`}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setOnlyFlappingOrFp((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-xs font-medium transition-colors ${
              onlyFlappingOrFp
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                : 'bg-[#0b0f19] border-[#1f2937] text-slate-300 hover:bg-[#1f2937]'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Posibles Falsos Positivos / Flapping</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          <label className="inline-flex items-center gap-1.5 text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showSuppressed}
              onChange={(e) => setShowSuppressed(e.target.checked)}
              className="rounded border-[#1f2937] bg-[#0b0f19] text-amber-500"
            />
            <span>Mostrar Suppressed (Mant.)</span>
          </label>

          <label className="inline-flex items-center gap-1.5 text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showResolved}
              onChange={(e) => setShowResolved(e.target.checked)}
              className="rounded border-[#1f2937] bg-[#0b0f19] text-sky-500"
            />
            <span>Mostrar Resueltos</span>
          </label>

          <label className="inline-flex items-center gap-1.5 text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={blinkNewAlarms}
              onChange={(e) => setBlinkNewAlarms(e.target.checked)}
              className="rounded border-[#1f2937] bg-[#0b0f19] text-rose-500"
            />
            <Sparkles className="w-3.5 h-3.5 text-rose-400" />
            <span>Parpadeo nuevas alarmas</span>
          </label>
        </div>
      </div>

      {/* Live Problems Table */}
      <div className="bg-[#111827] border border-[#1f2937] rounded-lg overflow-x-auto">
        <table className="w-full text-xs border-collapse min-w-[1040px]">
          <thead>
            <tr className="border-b border-[#1f2937] bg-[#0b0f19] text-slate-400">
              <th className="text-left px-3 py-2.5 font-medium">Hora inicio</th>
              <th className="text-left px-3 py-2.5 font-medium">Severidad</th>
              <th className="text-left px-3 py-2.5 font-medium">Duración</th>
              <th className="text-left px-3 py-2.5 font-medium">Host</th>
              <th className="text-left px-3 py-2.5 font-medium">Problema</th>
              <th className="text-left px-3 py-2.5 font-medium">Origen</th>
              <th className="text-left px-3 py-2.5 font-medium">Estado</th>
              <th className="text-left px-3 py-2.5 font-medium">Ack</th>
              <th className="text-left px-3 py-2.5 font-medium">Operador</th>
              <th className="text-right px-3 py-2.5 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1f2937]">
            {filteredProblems.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center text-slate-400">
                  <div className="flex flex-col items-center gap-1.5">
                    <AlertOctagon className="w-5 h-5 text-slate-500" />
                    <span>No hay incidencias que coincidan con los filtros actuales.</span>
                  </div>
                </td>
              </tr>
            ) : (
              filteredProblems.map((p) => {
                const sev = SEVERITY_MAP[p.severity];
                const origin = formatOriginLabel(p.sourceCheck);
                const trg = p.triggerId ? triggerMap.get(p.triggerId) : undefined;
                const flapping = isFlappingOrFp(p);
                const isFreshNew =
                  blinkNewAlarms &&
                  !p.resolved &&
                  !p.acknowledged &&
                  !p.suppressedInMaintenance &&
                  now - p.startedAt < 25000;

                return (
                  <tr
                    key={p.id}
                    className={`hover:bg-[#1f2937]/35 transition-colors ${
                      p.resolved ? 'opacity-65' : ''
                    }`}
                  >
                    <td className="px-3 py-2.5 font-mono tabular-nums text-slate-400 whitespace-nowrap">
                      {formatTimeHms(p.startedAt)}
                    </td>

                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${
                          isFreshNew ? 'animate-pulse' : ''
                        }`}
                        style={{ backgroundColor: sev.color, color: sev.textColor }}
                      >
                        {sev.label}
                      </span>
                    </td>

                    <td className="px-3 py-2.5 font-mono tabular-nums text-slate-300 whitespace-nowrap">
                      {formatDurationLive(p.startedAt, now, p.resolvedAt)}
                    </td>

                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => onSelectHost(p.hostId)}
                        className="font-mono font-semibold text-sky-300 hover:underline text-left"
                      >
                        {p.hostname}
                      </button>
                      <div className="font-mono text-[10px] text-slate-500">
                        {p.hostIp} · {p.hostGroup}
                      </div>
                    </td>

                    <td className="px-3 py-2.5 max-w-md">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setActiveTriageId(p.id)}
                          className="text-slate-100 font-medium hover:text-sky-300 text-left"
                        >
                          {p.title}
                        </button>
                        {p.suppressedInMaintenance && (
                          <span
                            title="Alarma suprimida por ventana de mantenimiento activa"
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-400"
                          >
                            <Wrench className="w-3 h-3" />
                            <span>Suppressed</span>
                          </span>
                        )}
                        {flapping && (
                          <span
                            title="Trigger con múltiples transiciones rápidas o marcado como Falso Positivo"
                            className="text-[11px] font-mono text-amber-300"
                          >
                            · {p.markedFalsePositive ? 'Falso Positivo' : `Flapping (${trg?.transitionCount ?? 0}x)`}
                          </span>
                        )}
                      </div>
                      <div className="font-mono text-[10px] text-slate-500 truncate">
                        {p.expression}
                      </div>
                    </td>

                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className={`font-mono text-[11px] font-semibold ${origin.colorClass}`}>
                        {origin.label}
                      </span>
                    </td>

                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span
                        className={`font-mono text-[11px] font-bold ${
                          p.resolved
                            ? 'text-emerald-400'
                            : p.suppressedInMaintenance
                            ? 'text-amber-300'
                            : 'text-rose-400'
                        }`}
                      >
                        {p.resolved ? 'RESOLVED' : 'PROBLEM'}
                      </span>
                    </td>

                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => onAckProblem(p.id)}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border ${
                          p.acknowledged
                            ? 'bg-sky-500/20 border-sky-500/40 text-sky-300'
                            : 'bg-[#0b0f19] border-[#1f2937] text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {p.acknowledged && <Check className="w-3 h-3" />}
                        <span>{p.acknowledged ? 'Sí' : 'No'}</span>
                        {p.notes.length > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-slate-300 ml-1">
                            <MessageSquareText className="w-3 h-3" />
                            {p.notes.length}
                          </span>
                        )}
                      </button>
                    </td>

                    <td className="px-3 py-2.5 whitespace-nowrap text-slate-300">
                      {p.assignedOperator || <span className="text-slate-500">—</span>}
                    </td>

                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setActiveTriageId(p.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#0b0f19] border border-[#1f2937] hover:border-sky-500/50 text-sky-300 text-[11px] font-medium"
                        >
                          <SlidersHorizontal className="w-3 h-3" />
                          <span>Triaje</span>
                        </button>

                        {!p.resolved && (
                          <button
                            type="button"
                            onClick={() => onResolveProblem(p.id)}
                            title="Recuperar host y resolver alarma"
                            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-600/30 text-[11px] font-semibold"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Recuperar</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Incident Triage & Remote Diagnostics Modal */}
      <ProblemTriageModal
        problem={triageProblem}
        host={triageProblem ? hostMap.get(triageProblem.hostId) ?? null : null}
        trigger={
          triageProblem?.triggerId ? triggerMap.get(triageProblem.triggerId) ?? null : null
        }
        onClose={() => setActiveTriageId(null)}
        onTriage={onTriageProblem}
        onFixAntiPatternTrigger={onFixAntiPatternTrigger}
        onToggleTrigger={onToggleTrigger}
        onRunDiagnosticRecovery={onRunDiagnosticRecovery}
        onNavigateToTriggers={onNavigateToTriggers}
      />
    </div>
  );
};
