import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Database,
  Play,
  Plus,
  Power,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Wrench,
} from 'lucide-react';
import { formatTimeHms, getActiveMaintenanceWindow } from '../engine/telemetryEngine';
import { CreateMaintenancePayload } from '../state/useNocStore';
import {
  Host,
  HostGroup,
  MaintenanceMode,
  MaintenanceStatus,
  MaintenanceWindow,
} from '../types/noc';

interface MaintenanceViewProps {
  hosts: Host[];
  windows: MaintenanceWindow[];
  slaScore: number;
  onCreateWindow: (payload: CreateMaintenancePayload) => void;
  onSetWindowStatus: (windowId: string, status: MaintenanceStatus) => void;
  onDeleteWindow: (windowId: string) => void;
  onSimulateCriticalReboot: (hostId?: string) => void;
  onRecoverHost: (hostId: string) => void;
  onSelectHost: (hostId: string) => void;
  onOpenProblems: () => void;
}

const HOST_GROUPS: HostGroup[] = ['Seguridad', 'Networking', 'Servidores', 'Almacenamiento'];

interface RebootFeedback {
  ts: number;
  protected: boolean;
  mode: MaintenanceMode | null;
  windowName: string | null;
}

export const MaintenanceView: React.FC<MaintenanceViewProps> = ({
  hosts,
  windows,
  slaScore,
  onCreateWindow,
  onSetWindowStatus,
  onDeleteWindow,
  onSimulateCriticalReboot,
  onRecoverHost,
  onSelectHost,
  onOpenProblems,
}) => {
  const [name, setName] = useState('Parcheo Mensual Windows Server');
  const [targetType, setTargetType] = useState<'hosts' | 'group'>('hosts');
  const [selectedHostIds, setSelectedHostIds] = useState<string[]>(['srv-ad-dc01']);
  const [selectedGroup, setSelectedGroup] = useState<HostGroup>('Servidores');
  const [mode, setMode] = useState<MaintenanceMode>('with_data');
  const [status, setStatus] = useState<'active' | 'scheduled'>('active');
  const [durationMin, setDurationMin] = useState<number>(60);
  const [reason, setReason] = useState('CHG-2026-0412 · Ventana de cambio aprobada por CAB');
  const [rebootFeedback, setRebootFeedback] = useState<RebootFeedback | null>(null);

  const dbHost = useMemo(
    () => hosts.find((h) => h.id === 'srv-db-prod') ?? hosts[0],
    [hosts]
  );

  const dbActiveWin = useMemo(
    () => (dbHost ? getActiveMaintenanceWindow(dbHost, windows) : undefined),
    [dbHost, windows]
  );

  const stats = useMemo(() => {
    const activeWins = windows.filter((w) => w.status === 'active').length;
    const scheduledWins = windows.filter((w) => w.status === 'scheduled').length;
    const hostsInMaint = hosts.filter(
      (h) => h.status === 'MAINTENANCE' || Boolean(getActiveMaintenanceWindow(h, windows))
    ).length;
    return { activeWins, scheduledWins, hostsInMaint };
  }, [hosts, windows]);

  const toggleHostSelection = (hostId: string) => {
    setSelectedHostIds((prev) =>
      prev.includes(hostId) ? prev.filter((id) => id !== hostId) : [...prev, hostId]
    );
  };

  const applyPreset = (preset: 'windows' | 'switch' | 'db') => {
    if (preset === 'windows') {
      setName('Parcheo Mensual Windows Server');
      setTargetType('hosts');
      setSelectedHostIds(['srv-ad-dc01']);
      setMode('with_data');
      setStatus('active');
      setDurationMin(60);
      setReason('Actualización acumulativa KB5041585 en Controlador de Dominio');
    } else if (preset === 'switch') {
      setName('Upgrade Firmware Switch Core');
      setTargetType('hosts');
      setSelectedHostIds(['sw-core-01']);
      setMode('no_data');
      setStatus('scheduled');
      setDurationMin(45);
      setReason('Upgrade Cisco IOS-XE · Reinicio completo de plano de control');
    } else {
      setName('Ventana Crítica BBDD Producción');
      setTargetType('hosts');
      setSelectedHostIds(['srv-db-prod']);
      setMode('with_data');
      setStatus('active');
      setDurationMin(30);
      setReason('Reinicio planificado PostgreSQL Cluster para ampliación de RAM');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (targetType === 'hosts' && selectedHostIds.length === 0) return;
    onCreateWindow({
      name,
      targetType,
      hostIds: selectedHostIds,
      hostGroup: targetType === 'group' ? selectedGroup : null,
      mode,
      status,
      durationMin,
      reason,
    });
  };

  const handleSimulateReboot = () => {
    if (!dbHost) return;
    const win = getActiveMaintenanceWindow(dbHost, windows);
    const isProtected = Boolean(win) || dbHost.status === 'MAINTENANCE';
    onSimulateCriticalReboot(dbHost.id);
    setRebootFeedback({
      ts: Date.now(),
      protected: isProtected,
      mode: win?.mode ?? (isProtected ? 'with_data' : null),
      windowName: win?.name ?? null,
    });
  };

  return (
    <div className="space-y-5">
      {/* Header & KPI Strip */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">
            Ventanas de Mantenimiento — Maintenance Periods
          </h2>
          <p className="text-xs text-slate-400">
            Programa intervenciones con o sin recolección de métricas para evitar falsas caídas y
            proteger el SLA del servicio
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs bg-[#111827] border border-[#1f2937] rounded-md px-4 py-2">
          <div>
            <span className="text-slate-400 mr-1.5">SLA del Turno:</span>
            <span
              className={`font-mono tabular-nums font-bold ${
                slaScore >= 99
                  ? 'text-emerald-400'
                  : slaScore >= 95
                  ? 'text-amber-300'
                  : 'text-rose-400'
              }`}
            >
              {slaScore.toFixed(2)}%
            </span>
          </div>
          <span className="text-slate-700">·</span>
          <div>
            <span className="text-slate-400 mr-1.5">Activas:</span>
            <strong className="font-mono tabular-nums text-amber-300">{stats.activeWins}</strong>
          </div>
          <span className="text-slate-700">·</span>
          <div>
            <span className="text-slate-400 mr-1.5">Programadas:</span>
            <strong className="font-mono tabular-nums text-sky-300">{stats.scheduledWins}</strong>
          </div>
          <span className="text-slate-700">·</span>
          <div>
            <span className="text-slate-400 mr-1.5">Hosts cubiertos:</span>
            <strong className="font-mono tabular-nums text-slate-100">{stats.hostsInMaint}</strong>
          </div>
        </div>
      </div>

      {/* Critical Reboot Simulation Banner */}
      <div className="bg-[#111827] border border-[#1f2937] rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
              <Power className="w-4 h-4 text-rose-400 shrink-0" />
              <span>Simulador de Impacto SLA — Reinicio de Servidor Crítico (SRV-DB-PROD)</span>
            </div>
            <p className="text-xs text-slate-400">
              Estado actual de protección para{' '}
              <span className="font-mono text-slate-200">{dbHost?.hostname}</span>:{' '}
              {dbActiveWin || dbHost?.status === 'MAINTENANCE' ? (
                <span className="text-emerald-400 font-medium">
                  Protegido por ventana activa (
                  {dbActiveWin ? `${dbActiveWin.name} · ${dbActiveWin.mode}` : 'with_data'})
                </span>
              ) : (
                <span className="text-rose-400 font-medium">
                  Sin mantenimiento activo (Exposición directa a Disaster + penalización SLA)
                </span>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleSimulateReboot}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded bg-rose-600/90 hover:bg-rose-500 text-white text-xs font-semibold transition-colors"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Simular Reinicio de Servidor Crítico</span>
            </button>

            {dbHost && (dbHost.status === 'DOWN' || dbHost.activeAnomaly !== null) && (
              <button
                type="button"
                onClick={() => onRecoverHost(dbHost.id)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-600/30 text-xs font-semibold"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restaurar SRV-DB-PROD</span>
              </button>
            )}
          </div>
        </div>

        {rebootFeedback && (
          <div
            className={`p-3 rounded border text-xs flex flex-wrap items-center justify-between gap-3 ${
              rebootFeedback.protected
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                : 'bg-rose-500/10 border-rose-500/40 text-rose-200'
            }`}
          >
            <div className="flex items-start gap-2">
              {rebootFeedback.protected ? (
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              )}
              <div>
                <div className="font-semibold">
                  {rebootFeedback.protected
                    ? `Reinicio contenido sin penalización SLA (${formatTimeHms(rebootFeedback.ts)})`
                    : `Tormenta de Alertas DISASTER — SLA Penalizado -2.50% (${formatTimeHms(rebootFeedback.ts)})`}
                </div>
                <p className="text-[11px] opacity-90 mt-0.5">
                  {rebootFeedback.protected
                    ? rebootFeedback.mode === 'no_data'
                      ? 'Modo "No data collection": se detuvo el polling durante el reinicio. 0 alarmas generadas.'
                      : `Modo "With data collection": métricas registradas y alarma marcada como Suppressed bajo "${rebootFeedback.windowName ?? 'Ventana activa'}".`
                    : 'No existía una ventana de mantenimiento cubriendo SRV-DB-PROD. Se disparó SNMP Trap coldStart, alarma Disaster activa y caída en el SLA del turno.'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onOpenProblems}
              className="px-2.5 py-1 rounded bg-[#0b0f19] border border-[#1f2937] text-slate-200 hover:text-sky-300 text-[11px] font-medium shrink-0"
            >
              Ver en Consola de Problemas
            </button>
          </div>
        )}
      </div>

      {/* Main Split: Create Form + Active/Scheduled Windows */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* Form: Create / Schedule Maintenance Period */}
        <form
          onSubmit={handleSubmit}
          className="xl:col-span-5 bg-[#111827] border border-[#1f2937] rounded-lg p-4 space-y-4"
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <Wrench className="w-4 h-4 text-amber-400" />
              <span>Configurar Periodo de Mantenimiento</span>
            </h3>
          </div>

          {/* Quick Realistic Presets */}
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="text-slate-400 mr-1">Plantillas:</span>
            <button
              type="button"
              onClick={() => applyPreset('windows')}
              className="px-2 py-1 rounded bg-[#0b0f19] border border-[#1f2937] hover:border-sky-500/50 text-slate-300"
            >
              Parcheo Windows
            </button>
            <button
              type="button"
              onClick={() => applyPreset('switch')}
              className="px-2 py-1 rounded bg-[#0b0f19] border border-[#1f2937] hover:border-sky-500/50 text-slate-300"
            >
              Firmware Switch Core
            </button>
            <button
              type="button"
              onClick={() => applyPreset('db')}
              className="px-2 py-1 rounded bg-[#0b0f19] border border-[#1f2937] hover:border-amber-500/50 text-amber-300"
            >
              Proteger SRV-DB-PROD
            </button>
          </div>

          <div>
            <label className="block text-[11px] text-slate-400 mb-1">
              Nombre del mantenimiento
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Parcheo Mensual Windows Server"
              className="w-full px-3 py-1.5 rounded bg-[#0b0f19] border border-[#1f2937] text-xs text-slate-100 focus:outline-none focus:border-sky-500"
            />
          </div>

          {/* Target Type */}
          <div className="space-y-2">
            <label className="block text-[11px] text-slate-400">Equipos o Grupos afectados</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setTargetType('hosts')}
                className={`px-3 py-1.5 rounded text-xs font-medium border ${
                  targetType === 'hosts'
                    ? 'bg-sky-500/20 border-sky-500/40 text-sky-300'
                    : 'bg-[#0b0f19] border-[#1f2937] text-slate-400'
                }`}
              >
                Hosts específicos
              </button>
              <button
                type="button"
                onClick={() => setTargetType('group')}
                className={`px-3 py-1.5 rounded text-xs font-medium border ${
                  targetType === 'group'
                    ? 'bg-sky-500/20 border-sky-500/40 text-sky-300'
                    : 'bg-[#0b0f19] border-[#1f2937] text-slate-400'
                }`}
              >
                Grupo de Hosts
              </button>
            </div>

            {targetType === 'hosts' ? (
              <div className="grid grid-cols-2 gap-1.5 p-2.5 rounded bg-[#0b0f19] border border-[#1f2937] max-h-36 overflow-y-auto">
                {hosts.map((h) => {
                  const checked = selectedHostIds.includes(h.id);
                  return (
                    <label
                      key={h.id}
                      className="flex items-center gap-2 text-[11px] text-slate-300 cursor-pointer py-0.5"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleHostSelection(h.id)}
                        className="rounded border-[#1f2937] bg-[#111827] text-sky-500"
                      />
                      <span className="font-mono truncate">{h.hostname}</span>
                    </label>
                  );
                })}
              </div>
            ) : (
              <select
                value={selectedGroup}
                onChange={(e) => setSelectedGroup(e.target.value as HostGroup)}
                className="w-full px-3 py-1.5 rounded bg-[#0b0f19] border border-[#1f2937] text-xs text-slate-200"
              >
                {HOST_GROUPS.map((g) => (
                  <option key={g} value={g}>
                    Grupo: {g}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Maintenance Type */}
          <div className="space-y-2">
            <label className="block text-[11px] text-slate-400">
              Tipo de Mantenimiento (Comportamiento Zabbix)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode('with_data')}
                className={`p-2.5 rounded border text-left transition-colors ${
                  mode === 'with_data'
                    ? 'bg-amber-500/15 border-amber-500/50 text-amber-200'
                    : 'bg-[#0b0f19] border-[#1f2937] text-slate-400'
                }`}
              >
                <div className="text-xs font-semibold flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-amber-400" />
                  <span>With data collection</span>
                </div>
                <p className="text-[10px] opacity-85 mt-1 leading-snug">
                  Sigue recolectando métricas y gráficas, pero suprime alertas (Suppressed).
                </p>
              </button>

              <button
                type="button"
                onClick={() => setMode('no_data')}
                className={`p-2.5 rounded border text-left transition-colors ${
                  mode === 'no_data'
                    ? 'bg-sky-500/15 border-sky-500/50 text-sky-200'
                    : 'bg-[#0b0f19] border-[#1f2937] text-slate-400'
                }`}
              >
                <div className="text-xs font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-sky-400" />
                  <span>No data collection</span>
                </div>
                <p className="text-[10px] opacity-85 mt-1 leading-snug">
                  Detiene por completo el polling y la evaluación de triggers durante la ventana.
                </p>
              </button>
            </div>
          </div>

          {/* Status & Duration */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Estado</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as 'active' | 'scheduled')}
                className="w-full px-2.5 py-1.5 rounded bg-[#0b0f19] border border-[#1f2937] text-xs text-slate-200"
              >
                <option value="active">Activo ahora</option>
                <option value="scheduled">Programado (En espera)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Duración (minutos)</label>
              <select
                value={durationMin}
                onChange={(e) => setDurationMin(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 rounded bg-[#0b0f19] border border-[#1f2937] text-xs text-slate-200 font-mono"
              >
                <option value={15}>15 min</option>
                <option value={30}>30 min</option>
                <option value={60}>60 min</option>
                <option value={120}>120 min</option>
                <option value={240}>240 min</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-slate-400 mb-1">Motivo / Cambio</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-1.5 rounded bg-[#0b0f19] border border-[#1f2937] text-xs text-slate-200"
            />
          </div>

          <button
            type="submit"
            disabled={targetType === 'hosts' && selectedHostIds.length === 0}
            className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white text-xs font-semibold transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>
              {status === 'active'
                ? 'Crear y Activar Mantenimiento Ahora'
                : 'Programar Ventana de Mantenimiento'}
            </span>
          </button>
        </form>

        {/* Right: Configured Windows List */}
        <div className="xl:col-span-7 bg-[#111827] border border-[#1f2937] rounded-lg overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-[#1f2937] bg-[#0b0f19] flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-sky-400" />
              <span>Periodos Configurados ({windows.length})</span>
            </h3>
            <span className="text-[11px] text-slate-400">
              Activa o finaliza ventanas en caliente
            </span>
          </div>

          {windows.length === 0 ? (
            <div className="p-10 text-center text-xs text-slate-400">
              No hay ventanas de mantenimiento creadas todavía. Usa el formulario o una plantilla
              para crear una.
            </div>
          ) : (
            <div className="divide-y divide-[#1f2937] overflow-y-auto max-h-[520px]">
              {windows.map((w) => {
                const targetDesc =
                  w.targetType === 'group'
                    ? `Grupo: ${w.hostGroup}`
                    : w.hostIds
                        .map((id) => hosts.find((h) => h.id === id)?.hostname ?? id)
                        .join(', ');

                return (
                  <div
                    key={w.id}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[#1f2937]/25"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-slate-100">{w.name}</span>
                        <span
                          className={`font-mono text-[11px] font-bold ${
                            w.status === 'active'
                              ? 'text-amber-400'
                              : w.status === 'scheduled'
                              ? 'text-sky-400'
                              : 'text-slate-500'
                          }`}
                        >
                          · {w.status === 'active' ? 'ACTIVA' : w.status === 'scheduled' ? 'PROGRAMADA' : 'FINALIZADA'}
                        </span>
                      </div>

                      <div className="text-xs font-mono text-sky-300 truncate">
                        Objetivo: {targetDesc}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                        <span className="text-slate-200 font-medium">
                          {w.mode === 'with_data'
                            ? 'With data collection (Suprime alertas)'
                            : 'No data collection (Pausa polling)'}
                        </span>
                        <span>·</span>
                        <span className="font-mono tabular-nums">
                          {formatTimeHms(w.startedAt)} ({w.durationMin}m)
                        </span>
                      </div>

                      <p className="text-[11px] text-slate-500 truncate">{w.reason}</p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {w.status !== 'active' ? (
                        <button
                          type="button"
                          onClick={() => onSetWindowStatus(w.id, 'active')}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:bg-amber-500/30 text-xs font-semibold"
                        >
                          <Play className="w-3 h-3" />
                          <span>Activar</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onSetWindowStatus(w.id, 'completed')}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-600/30 text-xs font-semibold"
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Finalizar</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => onDeleteWindow(w.id)}
                        aria-label={`Eliminar ventana ${w.name}`}
                        className="p-1.5 rounded border border-[#1f2937] bg-[#0b0f19] text-slate-400 hover:text-rose-400 hover:border-rose-500/40"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Live Host Maintenance State Grid */}
      <div className="space-y-2.5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Estado en Vivo de Recolección por Host
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {hosts.map((host) => {
            const win = getActiveMaintenanceWindow(host, windows);
            const inMaint = Boolean(win) || host.status === 'MAINTENANCE';
            return (
              <button
                key={host.id}
                type="button"
                onClick={() => onSelectHost(host.id)}
                className="bg-[#111827] border border-[#1f2937] hover:border-sky-500/40 rounded-lg p-3.5 text-left transition-colors space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono font-semibold text-xs text-slate-100 truncate">
                    {host.hostname}
                  </span>
                  <span
                    className={`font-mono text-[10px] font-bold ${
                      inMaint
                        ? 'text-amber-300'
                        : host.status === 'DOWN'
                        ? 'text-rose-400'
                        : host.status === 'WARNING'
                        ? 'text-amber-400'
                        : 'text-emerald-400'
                    }`}
                  >
                    {host.status}
                  </span>
                </div>
                <div className="text-[11px] font-mono text-slate-400">
                  {host.ip} · {host.group}
                </div>
                <div className="text-[11px] text-slate-400 pt-1 border-t border-[#1f2937] truncate">
                  {win ? (
                    <span className="text-amber-300">
                      {win.mode === 'no_data'
                        ? 'Polling pausado (no_data)'
                        : 'Polling activo + alertas suprimidas'}
                    </span>
                  ) : (
                    <span>Monitorización nominal activa</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
