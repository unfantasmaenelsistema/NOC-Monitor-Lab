import React, { useMemo } from 'react';
import {
  Award,
  CheckCircle2,
  Download,
  FileCode2,
  FileJson,
  Printer,
  ShieldCheck,
  X,
} from 'lucide-react';
import { formatTimeHms } from '../engine/telemetryEngine';
import { AppState } from '../types/noc';

interface ShiftReportModalProps {
  open: boolean;
  state: AppState;
  onClose: () => void;
}

function triggerDownload(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const ShiftReportModal: React.FC<ShiftReportModalProps> = ({ open, state, onClose }) => {
  const report = useMemo(() => {
    const totalProblems = state.problems.length;
    const resolvedProblems = state.problems.filter((p) => p.resolved).length;
    const activeProblems = totalProblems - resolvedProblems;
    const suppressedProblems = state.problems.filter((p) => p.suppressedInMaintenance).length;
    const falsePositivesMarked = state.problems.filter((p) => p.markedFalsePositive).length;

    const ackedWithTimes = state.problems.filter(
      (p) => p.acknowledged && p.acknowledgedAt !== undefined
    );
    const mttaSeconds =
      ackedWithTimes.length > 0
        ? Math.round(
            ackedWithTimes.reduce(
              (acc, p) => acc + Math.max(0, (p.acknowledgedAt! - p.startedAt) / 1000),
              0
            ) / ackedWithTimes.length
          )
        : null;

    const completedMissions = state.challenges.filter((c) => c.completed);

    return {
      generatedAt: new Date().toISOString(),
      shiftStartedAt: new Date(state.shiftStartedAt).toISOString(),
      slaScorePct: state.slaScore,
      nocXp: state.nocXp,
      hostsTotal: state.hosts.length,
      hostsUp: state.hosts.filter((h) => h.status === 'UP').length,
      hostsMaintenance: state.hosts.filter((h) => h.status === 'MAINTENANCE').length,
      incidents: {
        total: totalProblems,
        active: activeProblems,
        resolved: resolvedProblems,
        suppressedInMaintenance: suppressedProblems,
        falsePositivesMarked,
        acknowledgedCount: state.problems.filter((p) => p.acknowledged).length,
      },
      mttaSeconds,
      maintenanceWindowsCount: state.maintenanceWindows.length,
      triggersEnabled: state.triggers.filter((t) => t.enabled).length,
      missionsCompleted: completedMissions.map((m) => ({
        id: m.id,
        title: m.title,
        xpReward: m.xpReward,
        flagCode: m.flagCode,
      })),
      recentProblems: state.problems.slice(0, 25).map((p) => ({
        hostname: p.hostname,
        severity: p.severity,
        title: p.title,
        startedAt: new Date(p.startedAt).toISOString(),
        acknowledged: p.acknowledged,
        resolved: p.resolved,
        suppressedInMaintenance: Boolean(p.suppressedInMaintenance),
        assignedOperator: p.assignedOperator ?? null,
        notesCount: p.notes.length,
      })),
    };
  }, [state]);

  if (!open) return null;

  const handleDownloadJson = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    triggerDownload(
      `noc-audit-report-${stamp}.json`,
      JSON.stringify(report, null, 2),
      'application/json'
    );
  };

  const handleDownloadHtml = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Informe de Turno NOC - ${stamp}</title>
<style>
  body { font-family: system-ui, -apple-system, sans-serif; color: #0f172a; max-width: 860px; margin: 32px auto; padding: 0 20px; line-height: 1.5; }
  h1 { font-size: 22px; margin-bottom: 4px; }
  .meta { color: #475569; font-size: 13px; margin-bottom: 20px; }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
  .card { border: 1px solid #cbd5e1; border-radius: 6px; padding: 12px; }
  .card .lbl { font-size: 11px; color: #64748b; text-transform: uppercase; }
  .card .val { font-size: 20px; font-weight: 700; font-family: ui-monospace, monospace; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 12px; }
  th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; }
  th { background: #f8fafc; }
</style>
</head>
<body>
  <h1>NOC Monitor Lab — Informe de Auditoría y Turno</h1>
  <div class="meta">Generado: ${report.generatedAt} · Inicio de turno: ${report.shiftStartedAt}</div>
  <div class="grid">
    <div class="card"><div class="lbl">SLA del Turno</div><div class="val">${report.slaScorePct.toFixed(2)}%</div></div>
    <div class="card"><div class="lbl">Incidentes Gestionados</div><div class="val">${report.incidents.total}</div></div>
    <div class="card"><div class="lbl">MTTA Medio</div><div class="val">${report.mttaSeconds !== null ? `${report.mttaSeconds}s` : 'N/A'}</div></div>
    <div class="card"><div class="lbl">Misiones / XP NOC</div><div class="val">${report.missionsCompleted.length}/5 (${report.nocXp} XP)</div></div>
  </div>
  <h2>Misiones CTF Superadas</h2>
  ${
    report.missionsCompleted.length === 0
      ? '<p>Sin misiones completadas en este turno.</p>'
      : `<ul>${report.missionsCompleted
          .map((m) => `<li><strong>${m.title}</strong> — +${m.xpReward} XP — Flag: <code>${m.flagCode}</code></li>`)
          .join('')}</ul>`
  }
  <h2>Registro Reciente de Problemas (${report.recentProblems.length})</h2>
  <table>
    <thead><tr><th>Host</th><th>Severidad</th><th>Problema</th><th>Ack</th><th>Estado</th><th>Operador</th></tr></thead>
    <tbody>
      ${report.recentProblems
        .map(
          (p) =>
            `<tr><td>${p.hostname}</td><td>${p.severity}</td><td>${p.title}</td><td>${
              p.acknowledged ? 'Sí' : 'No'
            }</td><td>${p.resolved ? 'RESOLVED' : p.suppressedInMaintenance ? 'SUPPRESSED' : 'PROBLEM'}</td><td>${
              p.assignedOperator ?? '—'
            }</td></tr>`
        )
        .join('')}
    </tbody>
  </table>
</body>
</html>`;
    triggerDownload(`noc-shift-report-${stamp}.html`, html, 'text/html');
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Informe de Turno NOC y Auditoría"
    >
      <div className="bg-[#111827] border border-[#1f2937] rounded-lg w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-[#1f2937] bg-[#0b0f19] flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <div>
              <h3 className="text-sm font-semibold text-slate-100">
                Informe de Turno NOC & Auditoría Operativa
              </h3>
              <p className="text-[11px] text-slate-400 font-mono">
                Inicio de sesión: {formatTimeHms(state.shiftStartedAt)} · SLA:{' '}
                {report.slaScorePct.toFixed(2)}%
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar informe de turno"
            className="p-1.5 rounded border border-[#1f2937] text-slate-400 hover:text-slate-100 hover:bg-[#1f2937]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5">
          {/* KPI Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-[#0b0f19] border border-[#1f2937] rounded-lg p-3.5">
              <div className="text-[11px] text-slate-400">SLA Alcanzado</div>
              <div className="text-xl font-mono font-bold tabular-nums text-emerald-400 mt-1">
                {report.slaScorePct.toFixed(2)}%
              </div>
            </div>

            <div className="bg-[#0b0f19] border border-[#1f2937] rounded-lg p-3.5">
              <div className="text-[11px] text-slate-400">Incidentes Gestionados</div>
              <div className="text-xl font-mono font-bold tabular-nums text-slate-100 mt-1">
                {report.incidents.total}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                {report.incidents.resolved} resueltos · {report.incidents.suppressedInMaintenance}{' '}
                suprimidos
              </div>
            </div>

            <div className="bg-[#0b0f19] border border-[#1f2937] rounded-lg p-3.5">
              <div className="text-[11px] text-slate-400">MTTA (Tiempo Reconoc.)</div>
              <div className="text-xl font-mono font-bold tabular-nums text-sky-300 mt-1">
                {report.mttaSeconds !== null ? `${report.mttaSeconds}s` : '—'}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                {report.incidents.acknowledgedCount} alarmas con Ack
              </div>
            </div>

            <div className="bg-[#0b0f19] border border-[#1f2937] rounded-lg p-3.5">
              <div className="text-[11px] text-slate-400">Misiones & XP NOC</div>
              <div className="text-xl font-mono font-bold tabular-nums text-amber-300 mt-1">
                {report.missionsCompleted.length}/5
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5 font-mono">
                {report.nocXp} XP acumulados
              </div>
            </div>
          </div>

          {/* Unlocked CTF Flags */}
          <div className="bg-[#0b0f19] border border-[#1f2937] rounded-lg p-4 space-y-2.5">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <Award className="w-3.5 h-3.5 text-amber-400" />
              <span>Misiones y Códigos de Verificación (Flags)</span>
            </h4>
            {report.missionsCompleted.length === 0 ? (
              <p className="text-xs text-slate-500">
                Aún no has completado misiones en el Modo Laboratorio.
              </p>
            ) : (
              <div className="space-y-1.5">
                {report.missionsCompleted.map((m) => (
                  <div
                    key={m.id}
                    className="flex flex-wrap items-center justify-between gap-2 text-xs py-1.5 border-b border-[#1f2937] last:border-b-0"
                  >
                    <span className="inline-flex items-center gap-1.5 text-slate-200 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      {m.title}
                    </span>
                    <span className="font-mono text-emerald-300 text-[11px]">{m.flagCode}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* JSON Preview */}
          <div className="bg-[#0b0f19] border border-[#1f2937] rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="inline-flex items-center gap-1.5 font-medium text-slate-300">
                <FileCode2 className="w-3.5 h-3.5 text-sky-400" />
                Vista previa de métricas exportables
              </span>
              <span className="font-mono text-[11px]">
                Triggers activos: {report.triggersEnabled} · Ventanas mant.:{' '}
                {report.maintenanceWindowsCount}
              </span>
            </div>
            <pre className="text-[11px] font-mono text-slate-300 bg-[#060911] border border-[#1f2937] rounded p-3 max-h-40 overflow-y-auto">
              {JSON.stringify(
                {
                  slaScorePct: report.slaScorePct,
                  nocXp: report.nocXp,
                  mttaSeconds: report.mttaSeconds,
                  incidents: report.incidents,
                  missionsCompleted: report.missionsCompleted,
                },
                null,
                2
              )}
            </pre>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 border-t border-[#1f2937] bg-[#0b0f19] flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadJson}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold"
            >
              <FileJson className="w-3.5 h-3.5" />
              <span>Exportar JSON</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadHtml}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded bg-[#111827] border border-[#1f2937] hover:border-sky-500/50 text-slate-200 text-xs font-medium"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span>Descargar HTML Imprimible</span>
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded bg-[#111827] border border-[#1f2937] hover:border-slate-500 text-slate-200 text-xs font-medium"
            >
              <Printer className="w-3.5 h-3.5 text-slate-400" />
              <span>Imprimir</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 rounded border border-[#1f2937] text-xs text-slate-300 hover:bg-[#1f2937]"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
