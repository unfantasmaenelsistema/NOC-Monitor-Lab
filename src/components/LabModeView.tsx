import React, { useEffect, useMemo, useState } from 'react';
import {
  Award,
  Check,
  CheckCircle2,
  Circle,
  Clock,
  Copy,
  FileText,
  Flag,
  FlaskConical,
  Play,
  RotateCcw,
  ShieldCheck,
  Wrench,
} from 'lucide-react';
import { evaluateMissions } from '../engine/telemetryEngine';
import { AppState } from '../types/noc';

interface LabModeViewProps {
  state: AppState;
  onLaunchMission: (missionId: string) => void;
  onRunMission4Upgrade: () => void;
  onResetFactory: () => void;
  onOpenShiftReport: () => void;
}

function getOperatorRank(xp: number): string {
  if (xp >= 1000) return 'Arquitecto NOC & Incident Commander';
  if (xp >= 600) return 'Especialista SRE / Triaje L3';
  if (xp >= 300) return 'Analista NOC L2';
  if (xp >= 150) return 'Operador de Monitorización L1';
  return 'Aprendiz de Operaciones NOC';
}

export const LabModeView: React.FC<LabModeViewProps> = ({
  state,
  onLaunchMission,
  onRunMission4Upgrade,
  onResetFactory,
  onOpenShiftReport,
}) => {
  const [confirmReset, setConfirmReset] = useState(false);
  const [copiedFlagId, setCopiedFlagId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (state.labProgress.mission5StartedAt === null) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [state.labProgress.mission5StartedAt]);

  const missionEvals = useMemo(() => evaluateMissions(state), [state]);
  const completedCount = state.challenges.filter((c) => c.completed).length;
  const maxXp = state.challenges.reduce((s, c) => s + c.xpReward, 0);
  const rank = getOperatorRank(state.nocXp);

  const m5RemainingSec = useMemo(() => {
    const start = state.labProgress.mission5StartedAt;
    if (start === null) return null;
    const elapsed = Math.floor((now - start) / 1000);
    return Math.max(0, state.labProgress.mission5TimeLimitSec - elapsed);
  }, [now, state.labProgress.mission5StartedAt, state.labProgress.mission5TimeLimitSec]);

  const handleCopyFlag = (id: string, flag: string) => {
    try {
      void navigator.clipboard.writeText(flag);
      setCopiedFlagId(id);
      window.setTimeout(() => setCopiedFlagId(null), 1800);
    } catch {
      // Ignore clipboard errors
    }
  };

  return (
    <div className="space-y-5">
      {/* Header & NOC Progression Strip */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">
            Modo Laboratorio — Misiones Guiadas & CTF NOC
          </h2>
          <p className="text-xs text-slate-400">
            Validación automática en tiempo real · Resuelve incidentes reales, domina SNMP/MIB,
            calibra triggers y desbloquea banderas de verificación
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={onOpenShiftReport}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition-colors"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Exportar Informe de Turno</span>
          </button>

          {!confirmReset ? (
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-[#1f2937] bg-[#111827] hover:border-rose-500/50 text-slate-300 hover:text-rose-300 text-xs font-medium"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Resetear Fábrica</span>
            </button>
          ) : (
            <div className="inline-flex items-center gap-1.5 bg-rose-500/10 border border-rose-500/40 rounded px-2.5 py-1 text-xs">
              <span className="text-rose-200">¿Borrar progreso?</span>
              <button
                type="button"
                onClick={() => {
                  onResetFactory();
                  setConfirmReset(false);
                }}
                className="px-2 py-0.5 rounded bg-rose-600 text-white font-semibold"
              >
                Confirmar
              </button>
              <button
                type="button"
                onClick={() => setConfirmReset(false)}
                className="px-2 py-0.5 rounded bg-[#0b0f19] text-slate-300"
              >
                Cancelar
              </button>
            </div>
          )}
        </div>
      </div>

      {/* XP & Progress Summary Banner */}
      <div className="bg-[#111827] border border-[#1f2937] rounded-lg p-4 grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
        <div className="md:col-span-2 space-y-1.5">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Award className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Rango Actual:</span>
            <strong className="text-slate-100">{rank}</strong>
          </div>
          <div className="w-full h-2 rounded-full bg-[#0b0f19] border border-[#1f2937] overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all duration-300"
              style={{ width: `${Math.min(100, Math.round((state.nocXp / maxXp) * 100))}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
            <span>
              Experiencia NOC: <strong className="text-amber-300">{state.nocXp}</strong> / {maxXp}{' '}
              XP
            </span>
            <span>Guardado automático en localStorage</span>
          </div>
        </div>

        <div className="bg-[#0b0f19] border border-[#1f2937] rounded-md px-3.5 py-2.5">
          <div className="text-[11px] text-slate-400">Misiones Superadas</div>
          <div className="text-lg font-mono font-bold tabular-nums text-emerald-400">
            {completedCount} / {state.challenges.length}
          </div>
        </div>

        <div className="bg-[#0b0f19] border border-[#1f2937] rounded-md px-3.5 py-2.5">
          <div className="text-[11px] text-slate-400">SLA del Turno</div>
          <div
            className={`text-lg font-mono font-bold tabular-nums ${
              state.slaScore >= 99 ? 'text-emerald-400' : 'text-amber-300'
            }`}
          >
            {state.slaScore.toFixed(2)}%
          </div>
        </div>
      </div>

      {/* 5 CTF Missions Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {state.challenges.map((ch) => {
          const ev = missionEvals[ch.id];
          const steps = ev?.steps ?? [];
          const doneSteps = steps.filter((s) => s.done).length;
          const isMission4 = ch.id === 'mission-4';
          const isMission5 = ch.id === 'mission-5';

          return (
            <div
              key={ch.id}
              className={`bg-[#111827] border rounded-lg p-5 flex flex-col justify-between gap-4 ${
                ch.completed ? 'border-emerald-500/40' : 'border-[#1f2937]'
              }`}
            >
              <div className="space-y-3">
                {/* Card Header */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs">
                    <FlaskConical className="w-4 h-4 text-sky-400 shrink-0" />
                    <span className="font-mono font-semibold text-sky-300">{ch.difficulty}</span>
                    <span className="text-slate-600">·</span>
                    <span className="font-mono font-semibold text-amber-300">
                      +{ch.xpReward} XP
                    </span>
                  </div>

                  {ch.completed ? (
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-400 font-semibold">
                      <CheckCircle2 className="w-4 h-4" />
                      Completada
                    </span>
                  ) : (
                    <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                      {doneSteps}/{steps.length} objetivos
                    </span>
                  )}
                </div>

                <h3 className="text-base font-semibold text-slate-100">{ch.title}</h3>
                <p className="text-xs text-slate-300 leading-relaxed">{ch.description}</p>

                {/* Timed Crisis Banner for Mission 5 */}
                {isMission5 && state.labProgress.mission5StartedAt !== null && !ch.completed && (
                  <div
                    className={`flex items-center justify-between px-3 py-2 rounded border text-xs font-mono ${
                      m5RemainingSec === 0
                        ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                        : 'bg-amber-500/10 border-amber-500/40 text-amber-300'
                    }`}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      {m5RemainingSec === 0
                        ? 'Tiempo agotado (180s) · Pulsa Reiniciar Turno en Crisis'
                        : 'Contrarreloj activo'}
                    </span>
                    <span className="font-bold tabular-nums">{m5RemainingSec}s</span>
                  </div>
                )}

                {/* Real-time Automatic Objectives Checklist */}
                <div className="bg-[#0b0f19] border border-[#1f2937] rounded-md p-3 space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Validación Automática en Tiempo Real
                  </div>
                  {steps.map((st) => (
                    <div key={st.label} className="flex items-start gap-2 text-xs">
                      {st.done ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                      ) : (
                        <Circle className="w-3.5 h-3.5 text-slate-600 shrink-0 mt-0.5" />
                      )}
                      <span className={st.done ? 'text-emerald-200' : 'text-slate-300'}>
                        {st.label}
                      </span>
                    </div>
                  ))}
                </div>

                <p className="text-[11px] text-slate-400">
                  <strong className="text-slate-300">Pista operativa:</strong> {ch.hint}
                </p>

                {/* Verification Flag when completed */}
                {ch.completed && (
                  <div className="flex items-center justify-between gap-2 px-3 py-2 rounded bg-emerald-500/10 border border-emerald-500/30">
                    <div className="flex items-center gap-2 text-xs font-mono text-emerald-300 truncate">
                      <Flag className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{ch.flagCode}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopyFlag(ch.id, ch.flagCode)}
                      className="inline-flex items-center gap-1 text-[11px] text-emerald-200 hover:text-white shrink-0"
                    >
                      {copiedFlagId === ch.id ? (
                        <>
                          <Check className="w-3 h-3" />
                          <span>Copiado</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copiar Flag</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-[#1f2937]">
                <button
                  type="button"
                  onClick={() => onLaunchMission(ch.id)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition-colors"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>
                    {isMission5 && state.labProgress.mission5StartedAt !== null && !ch.completed
                      ? 'Reiniciar Turno en Crisis'
                      : 'Iniciar / Ir al Módulo'}
                  </span>
                </button>

                {isMission4 && (
                  <button
                    type="button"
                    onClick={onRunMission4Upgrade}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded bg-amber-600/20 border border-amber-500/40 hover:bg-amber-600/30 text-amber-300 text-xs font-semibold transition-colors"
                  >
                    <Wrench className="w-3.5 h-3.5" />
                    <span>Ejecutar Actualización Simulada</span>
                  </button>
                )}

                {ch.completed && (
                  <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-mono text-emerald-400">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Verificado
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
