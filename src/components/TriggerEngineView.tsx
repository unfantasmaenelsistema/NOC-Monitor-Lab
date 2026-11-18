import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Edit3,
  GitBranch,
  Plus,
  RotateCcw,
  ShieldOff,
  Trash2,
  Wand2,
  Zap,
} from 'lucide-react';
import { SEVERITY_MAP } from '../data/initialData';
import { AnomalyKind, Host, TriggerRule } from '../types/noc';
import { TriggerBuilderModal } from './TriggerBuilderModal';
import { TriggerSandboxCanvas } from './TriggerSandboxCanvas';

interface TriggerEngineViewProps {
  hosts: Host[];
  triggers: TriggerRule[];
  wanFlapSimulation: boolean;
  onToggleTrigger: (triggerId: string) => void;
  onUpsertTrigger: (trigger: TriggerRule) => void;
  onDeleteTrigger: (triggerId: string) => void;
  onFixAntiPattern: (triggerId: string) => void;
  onToggleWanFlap: () => void;
  onInjectHostAnomaly: (hostId: string, kind: AnomalyKind) => void;
  onRecoverHost: (hostId: string) => void;
}

export const TriggerEngineView: React.FC<TriggerEngineViewProps> = ({
  hosts,
  triggers,
  wanFlapSimulation,
  onToggleTrigger,
  onUpsertTrigger,
  onDeleteTrigger,
  onFixAntiPattern,
  onToggleWanFlap,
  onInjectHostAnomaly,
  onRecoverHost,
}) => {
  const [filter, setFilter] = useState<'all' | 'antipattern' | 'firing' | 'suppressed'>('all');
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingTrigger, setEditingTrigger] = useState<TriggerRule | null>(null);

  const swCoreDown = useMemo(
    () => hosts.find((h) => h.id === 'sw-core-01')?.status === 'DOWN',
    [hosts]
  );

  const summary = useMemo(() => {
    let firingCount = 0;
    let suppressedCount = 0;
    let totalFlaps = 0;
    let antiPatternCount = 0;

    for (const t of triggers) {
      totalFlaps += t.transitionCount;
      if (t.antiPatternNote) antiPatternCount += 1;
      const states = Object.values(t.lastStateByHost);
      if (states.includes('PROBLEM')) firingCount += 1;
      if (states.includes('SUPPRESSED')) suppressedCount += 1;
    }

    return { firingCount, suppressedCount, totalFlaps, antiPatternCount };
  }, [triggers]);

  const filteredTriggers = useMemo(() => {
    return triggers.filter((t) => {
      const states = Object.values(t.lastStateByHost);
      if (filter === 'antipattern') return Boolean(t.antiPatternNote);
      if (filter === 'firing') return states.includes('PROBLEM');
      if (filter === 'suppressed') return states.includes('SUPPRESSED');
      return true;
    });
  }, [triggers, filter]);

  const resolveHostName = (hostId: string) => {
    if (hostId === 'ALL') return 'Todos (*)';
    return hosts.find((h) => h.id === hostId)?.hostname ?? hostId;
  };

  const resolveTriggerState = (t: TriggerRule): 'OK' | 'PROBLEM' | 'SUPPRESSED' => {
    const states = Object.values(t.lastStateByHost);
    if (states.includes('PROBLEM')) return 'PROBLEM';
    if (states.includes('SUPPRESSED')) return 'SUPPRESSED';
    return 'OK';
  };

  return (
    <div className="space-y-5">
      {/* Header & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-100 tracking-tight">
            Motor de Triggers, Umbrales e Histéresis
          </h2>
          <p className="text-xs text-slate-400">
            Evalúa expresiones en cada tick · Combate Falsos Positivos y Flapping con avg(5m),
            Histéresis y Dependencias
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {swCoreDown ? (
            <button
              type="button"
              onClick={() => onRecoverHost('sw-core-01')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 text-xs font-semibold hover:bg-emerald-600/30 whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restaurar SW-CORE-01</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                onInjectHostAnomaly('sw-core-01', 'host_down');
                onInjectHostAnomaly('srv-db-prod', 'host_down');
              }}
              title="Simula la caída de SW-CORE-01 y de un servidor detrás de él para ver cómo las dependencias suprimen la tormenta de alertas"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-[#1f2937] bg-[#111827] hover:border-amber-500/50 text-amber-300 text-xs font-medium whitespace-nowrap"
            >
              <GitBranch className="w-3.5 h-3.5" />
              <span>Probar Dependencia (Caída SW-CORE-01)</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setEditingTrigger(null);
              setBuilderOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition-colors whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Nuevo Trigger</span>
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
        <div className="bg-[#111827] border border-[#1f2937] rounded-lg p-3.5">
          <div className="text-slate-400">Reglas Configuradas</div>
          <div className="text-xl font-semibold font-mono tabular-nums text-slate-100 mt-1">
            {triggers.filter((t) => t.enabled).length} / {triggers.length}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Habilitadas en el motor</div>
        </div>

        <div className="bg-[#111827] border border-[#1f2937] rounded-lg p-3.5">
          <div className="text-slate-400">Casos Anti-Patrón Activos</div>
          <div className="text-xl font-semibold font-mono tabular-nums text-amber-300 mt-1">
            {summary.antiPatternCount}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Falsos positivos / Flapping sin histéresis
          </div>
        </div>

        <div className="bg-[#111827] border border-[#1f2937] rounded-lg p-3.5">
          <div className="text-slate-400">Suprimidos por Dependencia</div>
          <div className="text-xl font-semibold font-mono tabular-nums text-sky-300 mt-1">
            {summary.suppressedCount}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {swCoreDown ? 'SW-CORE-01 caído: hijos silenciados' : 'Sin supresiones activas'}
          </div>
        </div>

        <div className="bg-[#111827] border border-[#1f2937] rounded-lg p-3.5">
          <div className="text-slate-400">Transiciones Totales (Flaps)</div>
          <div className="text-xl font-semibold font-mono tabular-nums text-rose-300 mt-1">
            {summary.totalFlaps}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Disparos activos ahora: {summary.firingCount}
          </div>
        </div>
      </div>

      {/* Interactive Visual Threshold Sandbox */}
      <TriggerSandboxCanvas
        hosts={hosts}
        wanFlapSimulation={wanFlapSimulation}
        onToggleWanFlap={onToggleWanFlap}
        onInjectHostAnomaly={(id, kind) => onInjectHostAnomaly(id, kind)}
        onRecoverHost={onRecoverHost}
      />

      {/* Triggers Catalog Table */}
      <div className="bg-[#111827] border border-[#1f2937] rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1f2937] flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-100">
            Catálogo de Triggers y Expresiones ({filteredTriggers.length})
          </h3>

          <div className="inline-flex bg-[#0b0f19] border border-[#1f2937] rounded p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`px-2.5 py-1 rounded transition-colors ${
                filter === 'all' ? 'bg-[#1f2937] text-slate-100' : 'text-slate-400'
              }`}
            >
              Todos
            </button>
            <button
              type="button"
              onClick={() => setFilter('antipattern')}
              className={`px-2.5 py-1 rounded transition-colors ${
                filter === 'antipattern' ? 'bg-amber-500/20 text-amber-300' : 'text-slate-400'
              }`}
            >
              Falsos Positivos / Lab
            </button>
            <button
              type="button"
              onClick={() => setFilter('firing')}
              className={`px-2.5 py-1 rounded transition-colors ${
                filter === 'firing' ? 'bg-rose-500/20 text-rose-300' : 'text-slate-400'
              }`}
            >
              Disparados
            </button>
            <button
              type="button"
              onClick={() => setFilter('suppressed')}
              className={`px-2.5 py-1 rounded transition-colors ${
                filter === 'suppressed' ? 'bg-sky-500/20 text-sky-300' : 'text-slate-400'
              }`}
            >
              Suprimidos
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#1f2937] bg-[#0b0f19] text-slate-400">
                <th className="text-left px-3.5 py-2.5 font-medium">Trigger & Diseño</th>
                <th className="text-left px-3 py-2.5 font-medium">Host</th>
                <th className="text-left px-3 py-2.5 font-medium">Severidad</th>
                <th className="text-left px-3 py-2.5 font-medium">Expresión Problema / Histéresis</th>
                <th className="text-left px-3 py-2.5 font-medium">Dependencia</th>
                <th className="text-right px-3 py-2.5 font-medium">Flaps</th>
                <th className="text-left px-3 py-2.5 font-medium">Estado</th>
                <th className="text-right px-3.5 py-2.5 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1f2937]">
              {filteredTriggers.map((trg) => {
                const sev = SEVERITY_MAP[trg.severity];
                const liveState = resolveTriggerState(trg);
                const depTrigger = trg.dependsOnTriggerId
                  ? triggers.find((x) => x.id === trg.dependsOnTriggerId)
                  : null;

                return (
                  <tr key={trg.id} className="hover:bg-[#1f2937]/30 transition-colors">
                    <td className="px-3.5 py-2.5 max-w-xs">
                      <div className="font-medium text-slate-100">{trg.name}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {trg.category} · {trg.evalFunc}
                      </div>
                      {trg.antiPatternNote && (
                        <div className="mt-1.5 text-[11px] text-amber-300/90 flex items-start gap-1">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          <span>{trg.antiPatternNote}</span>
                        </div>
                      )}
                    </td>

                    <td className="px-3 py-2.5 font-mono text-slate-300 whitespace-nowrap">
                      {resolveHostName(trg.hostId)}
                    </td>

                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span
                        className="inline-block px-2 py-0.5 rounded text-[11px] font-bold"
                        style={{ backgroundColor: sev.color, color: sev.textColor }}
                      >
                        {sev.label}
                      </span>
                    </td>

                    <td className="px-3 py-2.5 font-mono text-[11px]">
                      <div className="text-sky-300">{trg.expressionTemplate}</div>
                      <div
                        className={`mt-0.5 ${
                          trg.useHysteresis ? 'text-emerald-300' : 'text-slate-500'
                        }`}
                      >
                        Rec: {trg.recoveryExpressionTemplate}
                      </div>
                    </td>

                    <td className="px-3 py-2.5 text-[11px] text-slate-400 max-w-[170px]">
                      {depTrigger ? (
                        <span className="inline-flex items-center gap-1 text-slate-300">
                          <GitBranch className="w-3 h-3 text-sky-400 shrink-0" />
                          <span className="truncate" title={depTrigger.name}>
                            {depTrigger.name}
                          </span>
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>

                    <td
                      className={`px-3 py-2.5 text-right font-mono tabular-nums font-semibold whitespace-nowrap ${
                        trg.transitionCount >= 4 ? 'text-amber-300' : 'text-slate-300'
                      }`}
                    >
                      {trg.transitionCount}
                    </td>

                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {!trg.enabled ? (
                        <span className="text-slate-500 font-mono text-[11px]">DISABLED</span>
                      ) : liveState === 'PROBLEM' ? (
                        <span className="inline-flex items-center gap-1 text-rose-400 font-mono font-bold text-[11px]">
                          <Zap className="w-3 h-3" />
                          <span>PROBLEM</span>
                        </span>
                      ) : liveState === 'SUPPRESSED' ? (
                        <span className="inline-flex items-center gap-1 text-sky-300 font-mono font-semibold text-[11px]">
                          <ShieldOff className="w-3 h-3" />
                          <span>SUPPRESSED</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-emerald-400 font-mono text-[11px]">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>OK</span>
                        </span>
                      )}
                    </td>

                    <td className="px-3.5 py-2.5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        {trg.antiPatternNote && (
                          <button
                            type="button"
                            onClick={() => onFixAntiPattern(trg.id)}
                            title="Aplicar buena práctica (avg 5m + Histéresis)"
                            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-600/30 text-[11px] font-semibold"
                          >
                            <Wand2 className="w-3 h-3" />
                            <span>Corregir</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => onToggleTrigger(trg.id)}
                          className={`px-2 py-1 rounded border text-[11px] font-medium ${
                            trg.enabled
                              ? 'bg-[#0b0f19] border-[#1f2937] text-slate-300 hover:border-amber-500/40'
                              : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                          }`}
                        >
                          {trg.enabled ? 'Pausar' : 'Activar'}
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setEditingTrigger(trg);
                            setBuilderOpen(true);
                          }}
                          title="Editar Trigger"
                          className="p-1.5 rounded border border-[#1f2937] bg-[#0b0f19] hover:bg-[#1f2937] text-slate-300"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>

                        {trg.id !== 'trg-sw-core-icmp' && (
                          <button
                            type="button"
                            onClick={() => onDeleteTrigger(trg.id)}
                            title="Eliminar Trigger"
                            className="p-1.5 rounded border border-[#1f2937] bg-[#0b0f19] hover:border-rose-500/50 text-slate-400 hover:text-rose-400"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {builderOpen && (
        <TriggerBuilderModal
          initialTrigger={editingTrigger}
          hosts={hosts}
          allTriggers={triggers}
          onSave={onUpsertTrigger}
          onClose={() => setBuilderOpen(false)}
        />
      )}
    </div>
  );
};
