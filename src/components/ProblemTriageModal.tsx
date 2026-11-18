import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Check,
  CheckCircle2,
  FileWarning,
  MessageSquarePlus,
  Play,
  RefreshCw,
  ShieldCheck,
  Terminal,
  UserCheck,
  Wrench,
  X,
} from 'lucide-react';
import { SEVERITY_MAP, ZABBIX_SEVERITIES } from '../data/initialData';
import { formatTimeHms } from '../engine/telemetryEngine';
import { TriageProblemPayload } from '../state/useNocStore';
import { AlarmProblem, Host, SeverityLevel, TriggerRule } from '../types/noc';

interface ProblemTriageModalProps {
  problem: AlarmProblem | null;
  host: Host | null;
  trigger: TriggerRule | null;
  onClose: () => void;
  onTriage: (payload: TriageProblemPayload) => void;
  onFixAntiPatternTrigger: (triggerId: string) => void;
  onToggleTrigger: (triggerId: string) => void;
  onRunDiagnosticRecovery: (hostId: string, problemId: string, actionLabel: string) => void;
  onNavigateToTriggers: () => void;
}

const OPERATORS = [
  '',
  'Analista NOC',
  'Equipo BBDD',
  'NetOps L2',
  'Sistemas Linux/Win',
  'Seguridad Perimetral',
];

type DiagCommand = 'ping' | 'traceroute' | 'snmp_check' | 'restart_service';

function formatDuration(startedAt: number, endedAt?: number): string {
  const diffSec = Math.max(0, Math.floor(((endedAt ?? Date.now()) - startedAt) / 1000));
  const h = Math.floor(diffSec / 3600);
  const m = Math.floor((diffSec % 3600) / 60);
  const s = diffSec % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

export const ProblemTriageModal: React.FC<ProblemTriageModalProps> = ({
  problem,
  host,
  trigger,
  onClose,
  onTriage,
  onFixAntiPatternTrigger,
  onToggleTrigger,
  onRunDiagnosticRecovery,
  onNavigateToTriggers,
}) => {
  const [ack, setAck] = useState(false);
  const [operator, setOperator] = useState('');
  const [severity, setSeverity] = useState<SeverityLevel>('warning');
  const [noteText, setNoteText] = useState('');
  const [showFpAssistant, setShowFpAssistant] = useState(false);
  const [terminalLines, setTerminalLines] = useState<string[]>([
    'noc-console@zabbix-srv:~$ Consola de diagnóstico lista. Seleccione un script remoto.',
  ]);
  const [runningCmd, setRunningCmd] = useState<DiagCommand | null>(null);

  useEffect(() => {
    if (!problem) return;
    setAck(problem.acknowledged);
    setOperator(problem.assignedOperator ?? 'Analista NOC');
    setSeverity(problem.severity);
    setNoteText('');
    setShowFpAssistant(Boolean(problem.markedFalsePositive));
    setTerminalLines([
      `noc-console@zabbix-srv:~$ Contexto cargado -> ${problem.hostname} (${problem.hostIp})`,
    ]);
    setRunningCmd(null);
  }, [problem?.id]);

  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!problem) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [Boolean(problem)]);

  if (!problem) return null;

  const sevMeta = SEVERITY_MAP[severity];
  const isAntiPatternTrigger = Boolean(
    trigger &&
      (trigger.antiPatternNote ||
        trigger.id === 'trg-fp-db-cpu-last' ||
        trigger.id === 'trg-fp-nas-backup-net' ||
        trigger.id === 'trg-flap-wan-latency')
  );

  const handleSaveTriage = (closeManually = false) => {
    onTriage({
      problemId: problem.id,
      acknowledged: ack,
      assignedOperator: operator,
      severity,
      noteText: noteText.trim() || undefined,
      noteAuthor: operator || 'Analista NOC',
      closeManually,
    });
    setNoteText('');
    if (closeManually) onClose();
  };

  const handleMarkFalsePositive = () => {
    setShowFpAssistant(true);
    onTriage({
      problemId: problem.id,
      acknowledged: true,
      assignedOperator: operator || 'Analista NOC',
      markedFalsePositive: true,
      noteText:
        noteText.trim() ||
        'Marcado como posible Falso Positivo durante el triaje para revisión de umbral/histéresis.',
      noteAuthor: operator || 'Analista NOC',
    });
    setNoteText('');
  };

  const runDiagnosticScript = (cmd: DiagCommand) => {
    const targetIp = host?.ip ?? problem.hostIp;
    const targetName = host?.hostname ?? problem.hostname;
    const isDown = host?.status === 'DOWN' || host?.activeAnomaly === 'host_down';
    const rtt = host ? host.metrics.icmpLatencyMs : 2.1;
    const loss = host ? host.metrics.packetLossPct : 0;

    setRunningCmd(cmd);

    let output: string[] = [];
    if (cmd === 'ping') {
      output = isDown
        ? [
            `noc-console@zabbix-srv:~$ ping -c 4 -W 1 ${targetIp}`,
            `PING ${targetIp} (${targetIp}) 56(84) bytes of data.`,
            `From 10.0.1.1 icmp_seq=1 Destination Host Unreachable`,
            `From 10.0.1.1 icmp_seq=2 Destination Host Unreachable`,
            `--- ${targetIp} ping statistics ---`,
            `4 packets transmitted, 0 received, 100% packet loss, time 3054ms`,
          ]
        : [
            `noc-console@zabbix-srv:~$ ping -c 4 ${targetIp}`,
            `PING ${targetIp} (${targetIp}) 56(84) bytes of data.`,
            `64 bytes from ${targetIp}: icmp_seq=1 ttl=63 time=${rtt.toFixed(2)} ms`,
            `64 bytes from ${targetIp}: icmp_seq=2 ttl=63 time=${(rtt + 0.3).toFixed(2)} ms`,
            `64 bytes from ${targetIp}: icmp_seq=3 ttl=63 time=${Math.max(0.4, rtt - 0.2).toFixed(2)} ms`,
            `--- ${targetIp} ping statistics ---`,
            `4 packets transmitted, 4 received, ${loss}% packet loss, rtt avg=${rtt.toFixed(2)} ms`,
          ];
    } else if (cmd === 'traceroute') {
      const parentHost = host?.parentId;
      output = [
        `noc-console@zabbix-srv:~$ traceroute -n -m 6 ${targetIp}`,
        `traceroute to ${targetIp} (${targetIp}), 6 hops max, 60 byte packets`,
        ` 1  10.0.1.2  0.482 ms  0.451 ms  0.440 ms  [SW-CORE-01]`,
        ...(parentHost === 'fw-perimetral-01'
          ? [` 2  10.0.0.1  0.912 ms  0.895 ms  0.901 ms  [FW-PERIMETRAL-01]`]
          : []),
        isDown
          ? ` 3  * * *  [Request timed out - ${targetName}]`
          : ` 3  ${targetIp}  ${rtt.toFixed(2)} ms  ${(rtt + 0.2).toFixed(2)} ms  ${rtt.toFixed(2)} ms  [${targetName}]`,
      ];
    } else if (cmd === 'snmp_check') {
      const hasSnmp = host?.interfaces.some((i) => i.protocol === 'SNMP') ?? true;
      const comm = host?.snmpMeta.communityRo ?? 'public';
      if (!hasSnmp) {
        output = [
          `noc-console@zabbix-srv:~$ snmpget -v2c -c ${comm} ${targetIp} 1.3.6.1.2.1.1.3.0`,
          `Timeout: No Response from ${targetIp}:161 (Este host utiliza Agente Zabbix sin demonio snmpd).`,
        ];
      } else if (isDown) {
        output = [
          `noc-console@zabbix-srv:~$ snmpget -v2c -c ${comm} ${targetIp} 1.3.6.1.2.1.1.3.0`,
          `Timeout: No Response from ${targetIp}:161`,
        ];
      } else {
        output = [
          `noc-console@zabbix-srv:~$ snmpget -v2c -c ${comm} ${targetIp} 1.3.6.1.2.1.1.1.0 1.3.6.1.2.1.1.3.0`,
          `SNMPv2-MIB::sysDescr.0 = STRING: "${host?.vendorOs ?? 'Network OS'}"`,
          `DISMAN-EVENT-MIB::sysUpTimeInstance = Timeticks: (${(host?.metrics.sysUpTimeSec ?? 120) * 100})`,
          `SNMPv2-SMI::mib-2.25.3.3.1.2.1 = INTEGER: ${Math.round(host?.metrics.cpu ?? 25)} (hrProcessorLoad)`,
        ];
      }
    } else if (cmd === 'restart_service') {
      const isWin = host?.vendorOs.toLowerCase().includes('windows');
      const isNetwork = host?.group === 'Networking' || host?.group === 'Seguridad';
      const serviceCmd = isWin
        ? `winrm /remote:${targetIp} "Restart-Service -Name NTDS,DNS -Force"`
        : isNetwork
        ? `ssh admin@${targetIp} "clear bgp soft && restart snmpd"`
        : `ssh nocadmin@${targetIp} "sudo systemctl restart postgresql nginx zabbix-agent2"`;

      output = [
        `noc-console@zabbix-srv:~$ ${serviceCmd}`,
        `[SSH/Agent] Autenticando con clave Ed25519 contra ${targetName} (${targetIp})...`,
        `[OK] Servicio reiniciado correctamente (Exit code 0).`,
        `[ZABBIX] Esperando confirmación de telemetría -> Estado normalizado a UP.`,
      ];

      if (host) {
        onRunDiagnosticRecovery(
          host.id,
          problem.id,
          `Script remoto ejecutado (${serviceCmd}) · Servicio reiniciado y alarma resuelta.`
        );
      }
    }

    setTerminalLines((prev) => [...prev.slice(-14), ...output]);
    window.setTimeout(() => setRunningCmd(null), 300);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Gestión de incidente ${problem.hostname}`}
    >
      <div className="bg-[#111827] border border-[#1f2937] rounded-lg w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#1f2937] bg-[#0b0f19] flex items-start justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2.5 text-xs">
              <span
                className="px-2 py-0.5 rounded font-bold"
                style={{ backgroundColor: sevMeta.color, color: sevMeta.textColor }}
              >
                {sevMeta.label}
              </span>
              <span className="font-mono font-semibold text-sky-300">
                {problem.hostname} ({problem.hostIp})
              </span>
              <span className="text-slate-600">·</span>
              <span className="font-mono text-slate-400">{problem.sourceCheck}</span>
              {problem.suppressedInMaintenance && (
                <>
                  <span className="text-slate-600">·</span>
                  <span className="inline-flex items-center gap-1 text-amber-400 font-medium">
                    <Wrench className="w-3.5 h-3.5" />
                    Suppressed (Mantenimiento)
                  </span>
                </>
              )}
            </div>
            <h3 className="text-base font-semibold text-slate-100 truncate">{problem.title}</h3>
            <p className="text-[11px] font-mono text-slate-400 truncate">
              Expresión: {problem.expression} · Inicio: {formatTimeHms(problem.startedAt)} ·
              Duración: {formatDuration(problem.startedAt, problem.resolvedAt)}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar modal de triaje"
            className="p-1.5 rounded border border-[#1f2937] text-slate-400 hover:text-slate-100 hover:bg-[#1f2937]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left: Ack, Bitácora, Severity, False Positive */}
          <div className="lg:col-span-7 space-y-4">
            <div className="bg-[#0b0f19] border border-[#1f2937] rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5 text-sky-400" />
                  <span>Triaje y Reconocimiento (Acknowledge)</span>
                </h4>
                <button
                  type="button"
                  onClick={() => setAck((v) => !v)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold border transition-colors ${
                    ack
                      ? 'bg-sky-500/20 border-sky-500/40 text-sky-300'
                      : 'bg-[#111827] border-[#1f2937] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{ack ? 'Reconocida (Ack)' : 'Marcar como Ack'}</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Operador asignado</label>
                  <select
                    value={operator}
                    onChange={(e) => setOperator(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded bg-[#111827] border border-[#1f2937] text-xs text-slate-200"
                  >
                    {OPERATORS.map((op) => (
                      <option key={op || 'none'} value={op}>
                        {op || 'Sin asignar'}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    Ajustar severidad manualmente
                  </label>
                  <select
                    value={severity}
                    onChange={(e) => setSeverity(e.target.value as SeverityLevel)}
                    className="w-full px-2.5 py-1.5 rounded bg-[#111827] border border-[#1f2937] text-xs text-slate-200"
                  >
                    {ZABBIX_SEVERITIES.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Añadir nota a la bitácora técnica
                </label>
                <textarea
                  rows={2}
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Ej: Escalado al equipo de BBDD, revisando bloqueo de tablas..."
                  className="w-full px-3 py-2 rounded bg-[#111827] border border-[#1f2937] text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleSaveTriage(false)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition-colors"
                  >
                    <MessageSquarePlus className="w-3.5 h-3.5" />
                    <span>Guardar Triaje / Nota</span>
                  </button>

                  {!problem.resolved && (
                    <button
                      type="button"
                      onClick={() => handleSaveTriage(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-600/30 text-xs font-semibold transition-colors"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Cerrar Manualmente</span>
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleMarkFalsePositive}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-amber-500/15 border border-amber-500/40 text-amber-300 hover:bg-amber-500/25 text-xs font-semibold transition-colors"
                >
                  <FileWarning className="w-3.5 h-3.5" />
                  <span>Marcar Falso Positivo</span>
                </button>
              </div>
            </div>

            {/* False Positive Quick Fix Assistant */}
            {showFpAssistant && (
              <div className="bg-[#0b0f19] border border-amber-500/40 rounded-lg p-4 space-y-2.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Asistente de Calibración — Falso Positivo Detectado</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {trigger ? (
                    <>
                      El trigger <span className="font-mono text-slate-100">{trigger.name}</span>{' '}
                      evalúa con <span className="font-mono text-amber-300">{trigger.evalFunc}()</span>{' '}
                      y{' '}
                      {trigger.useHysteresis
                        ? 'ya utiliza histéresis.'
                        : 'no tiene Expresión de Recuperación (Histéresis), lo que favorece oscilar (flapping) alrededor del umbral.'}
                    </>
                  ) : (
                    'Esta alarma proviene de un evento puntual o Trap. Si es ruido recurrente, ajusta la ventana de evaluación (avg 5m) o añade histéresis en el Motor de Triggers.'
                  )}
                </p>
                {trigger?.antiPatternNote && (
                  <p className="text-[11px] text-amber-200/90 bg-amber-500/10 border border-amber-500/20 rounded p-2">
                    {trigger.antiPatternNote}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {trigger && isAntiPatternTrigger && (
                    <button
                      type="button"
                      onClick={() => {
                        onFixAntiPatternTrigger(trigger.id);
                        handleSaveTriage(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Aplicar avg(5m) + Histéresis y Cerrar</span>
                    </button>
                  )}
                  {trigger && trigger.enabled && (
                    <button
                      type="button"
                      onClick={() => {
                        onToggleTrigger(trigger.id);
                        handleSaveTriage(true);
                      }}
                      className="px-3 py-1.5 rounded border border-[#1f2937] bg-[#111827] hover:bg-[#1f2937] text-xs text-slate-200"
                    >
                      Deshabilitar Trigger
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onNavigateToTriggers();
                    }}
                    className="px-3 py-1.5 rounded border border-sky-500/40 bg-sky-500/10 hover:bg-sky-500/20 text-xs text-sky-300 font-medium"
                  >
                    Abrir Motor de Triggers
                  </button>
                </div>
              </div>
            )}

            {/* Technical Logbook History */}
            <div className="bg-[#0b0f19] border border-[#1f2937] rounded-lg p-4 space-y-2.5">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Bitácora del Incidente ({problem.notes.length})
              </h4>
              {problem.notes.length === 0 ? (
                <p className="text-xs text-slate-500">
                  Sin entradas registradas todavía. Añade una nota técnica arriba para documentar el
                  triaje.
                </p>
              ) : (
                <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                  {problem.notes.map((n) => (
                    <div
                      key={n.id}
                      className="p-2.5 rounded bg-[#111827] border border-[#1f2937] text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span className="font-semibold text-sky-300">{n.author}</span>
                        <span className="font-mono tabular-nums">{formatTimeHms(n.ts)}</span>
                      </div>
                      <p className="text-slate-200">{n.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right: Remote Diagnostic Terminal */}
          <div className="lg:col-span-5 flex flex-col bg-[#0b0f19] border border-[#1f2937] rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-[#1f2937] flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                <Terminal className="w-4 h-4 text-emerald-400" />
                <span>Scripts Remotos de Diagnóstico</span>
              </div>
              <span className="text-[11px] font-mono text-slate-400">{problem.hostIp}</span>
            </div>

            <div className="p-3 border-b border-[#1f2937] grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={runningCmd !== null}
                onClick={() => runDiagnosticScript('ping')}
                className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 rounded bg-[#111827] border border-[#1f2937] hover:border-sky-500/50 text-xs text-slate-200 font-medium"
              >
                <Activity className="w-3.5 h-3.5 text-sky-400" />
                <span>Ping ICMP</span>
              </button>

              <button
                type="button"
                disabled={runningCmd !== null}
                onClick={() => runDiagnosticScript('traceroute')}
                className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 rounded bg-[#111827] border border-[#1f2937] hover:border-sky-500/50 text-xs text-slate-200 font-medium"
              >
                <Play className="w-3.5 h-3.5 text-sky-400" />
                <span>Traceroute</span>
              </button>

              <button
                type="button"
                disabled={runningCmd !== null}
                onClick={() => runDiagnosticScript('snmp_check')}
                className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 rounded bg-[#111827] border border-[#1f2937] hover:border-amber-500/50 text-xs text-slate-200 font-medium"
              >
                <Wrench className="w-3.5 h-3.5 text-amber-400" />
                <span>SNMP Check</span>
              </button>

              <button
                type="button"
                disabled={runningCmd !== null}
                onClick={() => runDiagnosticScript('restart_service')}
                className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 rounded bg-emerald-600/20 border border-emerald-500/40 hover:bg-emerald-600/30 text-xs text-emerald-300 font-semibold"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Restart Service (SSH)</span>
              </button>
            </div>

            <div className="flex-1 p-3.5 bg-[#060911] font-mono text-[11px] leading-relaxed text-emerald-300/95 overflow-y-auto min-h-[240px] space-y-1">
              {terminalLines.map((line, idx) => (
                <div
                  key={`${idx}-${line.slice(0, 12)}`}
                  className={
                    line.includes('Timeout') || line.includes('Unreachable') || line.includes('100%')
                      ? 'text-rose-400'
                      : line.startsWith('noc-console')
                      ? 'text-sky-300 font-semibold mt-1.5 first:mt-0'
                      : 'text-slate-300'
                  }
                >
                  {line}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
