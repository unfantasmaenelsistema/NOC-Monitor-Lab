import React, { useState } from 'react';
import {
  Activity,
  Cpu,
  HardDrive,
  Network,
  Radio,
  RotateCcw,
  ServerCrash,
  X,
  Zap,
} from 'lucide-react';
import { ChaosScenarioKind } from '../state/useNocStore';
import { Host } from '../types/noc';

interface ChaosInjectorModalProps {
  open: boolean;
  hosts: Host[];
  chaosCount: number;
  onClose: () => void;
  onInjectScenario: (scenario: ChaosScenarioKind, hostId?: string) => void;
  onRecoverAll: () => void;
}

export const ChaosInjectorModal: React.FC<ChaosInjectorModalProps> = ({
  open,
  hosts,
  chaosCount,
  onClose,
  onInjectScenario,
  onRecoverAll,
}) => {
  const [selectedHostId, setSelectedHostId] = useState<string>('AUTO');
  const [lastTriggered, setLastTriggered] = useState<string | null>(null);

  if (!open) return null;

  const targetHostId = selectedHostId === 'AUTO' ? undefined : selectedHostId;
  const affectedCount = hosts.filter((h) => h.activeAnomaly !== null || h.status === 'DOWN').length;

  const trigger = (scenario: ChaosScenarioKind, label: string) => {
    onInjectScenario(scenario, targetHostId);
    setLastTriggered(label);
  };

  const scenarios: Array<{
    kind: ChaosScenarioKind;
    title: string;
    subtitle: string;
    icon: React.ComponentType<{ className?: string }>;
    accent: string;
  }> = [
    {
      kind: 'cpu_spike',
      title: 'Pico de CPU (> 90%)',
      subtitle: 'Satura núcleos y activa triggers avg(5m) / last() en el equipo destino.',
      icon: Cpu,
      accent: 'text-amber-400',
    },
    {
      kind: 'memory_leak',
      title: 'Fuga de Memoria (Memory Leak)',
      subtitle: 'Incremento progresivo de RAM hasta superar el umbral crítico del 88%.',
      icon: Activity,
      accent: 'text-orange-400',
    },
    {
      kind: 'fiber_cut_core',
      title: 'Corte de Fibra en Switch Core',
      subtitle: 'Emite Trap linkDown y cae SW-CORE-01 para demostrar dependencias RCA.',
      icon: Network,
      accent: 'text-rose-400',
    },
    {
      kind: 'snmp_trap_storm',
      title: 'Tormenta de Traps SNMP',
      subtitle: 'Ráfaga UDP/162 (authenticationFailure, PSU caída, linkDown, sesiones FW).',
      icon: Radio,
      accent: 'text-sky-400',
    },
    {
      kind: 'zabbix_agent_timeout',
      title: 'Fallo de Agente Zabbix (Timeout)',
      subtitle: 'Detiene reportes activos (puerto 10051) y dispara trigger nodata(60s).',
      icon: ServerCrash,
      accent: 'text-rose-400',
    },
    {
      kind: 'disk_critical',
      title: 'Saturación de Disco (98%)',
      subtitle: 'Llena el almacenamiento para probar alertas de capacidad y triaje SSH.',
      icon: HardDrive,
      accent: 'text-amber-300',
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Panel Inyector de Caos"
    >
      <div className="bg-[#111827] border border-[#1f2937] rounded-lg w-full max-w-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#1f2937] bg-[#0b0f19] flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Zap className="w-4 h-4 text-rose-400 shrink-0" />
            <div>
              <h3 className="text-sm font-semibold text-slate-100">
                Inyector de Caos — Modo Profesor / Sandbox Libre
              </h3>
              <p className="text-[11px] text-slate-400">
                Dispara fallos controlados en clase · Eventos inyectados: {chaosCount} · Hosts
                afectados ahora: {affectedCount}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar Inyector de Caos"
            className="p-1.5 rounded border border-[#1f2937] text-slate-400 hover:text-slate-100 hover:bg-[#1f2937]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Host Selector */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-[#0b0f19] border border-[#1f2937] rounded-md p-3">
            <label htmlFor="chaos-host-select" className="text-xs font-medium text-slate-300">
              Host objetivo para fallos unitarios:
            </label>
            <select
              id="chaos-host-select"
              value={selectedHostId}
              onChange={(e) => setSelectedHostId(e.target.value)}
              className="px-3 py-1.5 rounded bg-[#111827] border border-[#1f2937] text-xs font-mono text-slate-200"
            >
              <option value="AUTO">Automático (Equipo recomendado por escenario)</option>
              {hosts.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.hostname} ({h.ip}) — {h.status}
                </option>
              ))}
            </select>
          </div>

          {/* Scenarios Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {scenarios.map((sc) => {
              const Icon = sc.icon;
              return (
                <button
                  key={sc.kind}
                  type="button"
                  onClick={() => trigger(sc.kind, sc.title)}
                  className="p-3.5 rounded-lg bg-[#0b0f19] border border-[#1f2937] hover:border-rose-500/50 text-left transition-colors space-y-1.5"
                >
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-100">
                    <Icon className={`w-4 h-4 shrink-0 ${sc.accent}`} />
                    <span>{sc.title}</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-snug">{sc.subtitle}</p>
                </button>
              );
            })}
          </div>

          {lastTriggered && (
            <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded px-3 py-2">
              Anomalía inyectada: <strong className="font-semibold">{lastTriggered}</strong>. Observa
              la reacción en Dashboard NOC o Consola de Problemas.
            </div>
          )}

          {/* Footer: Restore All */}
          <div className="pt-3 border-t border-[#1f2937] flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => {
                onRecoverAll();
                setLastTriggered(null);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-600/30 text-xs font-semibold"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restaurar Todos los Sistemas a Verde</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded border border-[#1f2937] bg-[#0b0f19] text-xs text-slate-300 hover:bg-[#1f2937]"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
