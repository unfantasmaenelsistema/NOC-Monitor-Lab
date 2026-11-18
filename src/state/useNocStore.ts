import { useCallback, useEffect, useReducer } from 'react';
import { createInitialAppState } from '../data/initialData';
import { createSnmpTrapPacket } from '../engine/snmpSimulator';
import {
  fixAntiPatternTriggerRule,
  getActiveMaintenanceWindow,
  injectAnomalyIntoState,
  recoverAllInState,
  recoverHostInState,
  stepTelemetry,
  syncMissionsAndXp,
} from '../engine/telemetryEngine';
import {
  AlarmProblem,
  AnomalyKind,
  AppState,
  CustomSnmpItem,
  Host,
  HostGroup,
  MaintenanceMode,
  MaintenanceStatus,
  MaintenanceWindow,
  NavSection,
  ProblemNote,
  SeverityLevel,
  SimulationSpeed,
  TelemetryEvent,
  TrapKind,
  TriggerRule,
} from '../types/noc';
import { sanitizeSavedState } from './sanitizeState';

export const NOC_STORAGE_KEY = 'noc_monitor_lab_state_v1';

export interface TriageProblemPayload {
  problemId: string;
  acknowledged?: boolean;
  assignedOperator?: string;
  severity?: SeverityLevel;
  noteText?: string;
  noteAuthor?: string;
  markedFalsePositive?: boolean;
  closeManually?: boolean;
}

export interface CreateMaintenancePayload {
  name: string;
  targetType: 'hosts' | 'group';
  hostIds: string[];
  hostGroup: HostGroup | null;
  mode: MaintenanceMode;
  status: 'active' | 'scheduled';
  durationMin: number;
  reason: string;
}

export type ChaosScenarioKind =
  | 'cpu_spike'
  | 'memory_leak'
  | 'fiber_cut_core'
  | 'snmp_trap_storm'
  | 'zabbix_agent_timeout'
  | 'disk_critical';

type Action =
  | { type: 'SET_TAB'; tab: NavSection }
  | { type: 'SET_SPEED'; speed: SimulationSpeed }
  | { type: 'TICK'; manualHostId?: string }
  | { type: 'INJECT_CHAOS'; hostId?: string; kind?: AnomalyKind }
  | { type: 'INJECT_CHAOS_SCENARIO'; scenario: ChaosScenarioKind; hostId?: string }
  | { type: 'RECOVER_HOST'; hostId: string }
  | { type: 'RECOVER_ALL' }
  | { type: 'SELECT_HOST'; hostId: string | null }
  | { type: 'UPSERT_HOST'; host: Host }
  | { type: 'DELETE_HOST'; hostId: string }
  | { type: 'TOGGLE_MAINTENANCE'; hostId: string; reason?: string; durationMin?: number }
  | { type: 'ADD_MAINTENANCE_WINDOW'; payload: CreateMaintenancePayload }
  | { type: 'SET_MAINTENANCE_STATUS'; windowId: string; status: MaintenanceStatus }
  | { type: 'DELETE_MAINTENANCE_WINDOW'; windowId: string }
  | { type: 'SIMULATE_CRITICAL_REBOOT'; hostId?: string }
  | { type: 'ACK_PROBLEM'; problemId: string }
  | { type: 'RESOLVE_PROBLEM'; problemId: string }
  | { type: 'TRIAGE_PROBLEM'; payload: TriageProblemPayload }
  | { type: 'RUN_DIAGNOSTIC_RECOVERY'; hostId: string; problemId?: string; actionLabel?: string }
  | { type: 'TOGGLE_TRIGGER'; triggerId: string }
  | { type: 'COMPLETE_CHALLENGE'; challengeId: string }
  | { type: 'LAUNCH_MISSION'; missionId: string }
  | { type: 'RUN_MISSION4_UPGRADE' }
  | { type: 'RECORD_SNMP_ACTIVITY'; hostId: string; ok: boolean }
  | { type: 'RESET_FACTORY' }
  | { type: 'ADD_CUSTOM_SNMP_ITEM'; hostId: string; item: CustomSnmpItem }
  | { type: 'REMOVE_CUSTOM_SNMP_ITEM'; hostId: string; itemId: string }
  | {
      type: 'APPLY_SNMP_SET';
      hostId: string;
      field: 'sysContact' | 'sysLocation' | 'hostname';
      value: string;
    }
  | { type: 'EMIT_SNMP_TRAP'; hostId: string; trapKind: TrapKind; version: 'v2c' | 'v3' }
  | { type: 'CLEAR_TRAP_LOG' }
  | { type: 'UPSERT_TRIGGER'; trigger: TriggerRule }
  | { type: 'DELETE_TRIGGER'; triggerId: string }
  | { type: 'FIX_ANTI_PATTERN_TRIGGER'; triggerId: string }
  | { type: 'TOGGLE_WAN_FLAP' };

function loadInitialState(): AppState {
  const base = createInitialAppState();
  try {
    const raw = window.localStorage.getItem(NOC_STORAGE_KEY);
    if (!raw) return base;
    // Cada campo se valida contra su forma esperada (ver sanitizeState.ts): un estado guardado roto
    // ya no deja la página en blanco en cada recarga.
    const saved = sanitizeSavedState(JSON.parse(raw), base);
    if (!saved) return base;
    // Prueba de humo: si el motor no puede avanzar un ciclo con este estado, se descarta.
    stepTelemetry(saved);
    return saved;
  } catch {
    return base;
  }
}

function syncHostsWithActiveMaintenance(
  hosts: Host[],
  windows: MaintenanceWindow[]
): Host[] {
  return hosts.map((h) => {
    const activeWin = getActiveMaintenanceWindow(h, windows);
    if (activeWin) {
      return {
        ...h,
        status: 'MAINTENANCE',
        interfaces: h.interfaces.map((iface) => ({
          ...iface,
          availability: activeWin.mode === 'no_data' ? 'disabled' : 'available',
        })),
      };
    }
    if (h.status === 'MAINTENANCE') {
      return {
        ...h,
        status: h.activeAnomaly === 'host_down' ? 'DOWN' : 'UP',
        interfaces: h.interfaces.map((iface) => ({
          ...iface,
          availability: 'available',
        })),
      };
    }
    return h;
  });
}

function appendTrapToState(
  state: AppState,
  hostId: string,
  trapKind: TrapKind,
  version: 'v2c' | 'v3',
  customTitle?: string
): AppState {
  const target = state.hosts.find((h) => h.id === hostId);
  if (!target) return state;

  const activeWin = getActiveMaintenanceWindow(target, state.maintenanceWindows);
  if (activeWin?.mode === 'no_data') {
    const skippedEv: TelemetryEvent = {
      id: `ev-trap-suppressed-${Date.now()}-${target.id}`,
      ts: Date.now(),
      hostId: target.id,
      hostname: target.hostname,
      direction: 'HOST → NOC',
      mechanism: 'SNMP Trap',
      protocol: 'SNMP',
      itemKeyOrOid: `snmptrap[${trapKind}]`,
      summary: `Trap ignorado · ${target.hostname} en mantenimiento sin recolección`,
      rttMs: 1,
      success: true,
    };
    return {
      ...state,
      telemetryFeed: [skippedEv, ...state.telemetryFeed].slice(0, 60),
    };
  }

  const packet = createSnmpTrapPacket(target, trapKind, version);
  const isSuppressed =
    Boolean(activeWin && activeWin.mode === 'with_data') || target.status === 'MAINTENANCE';

  const feedEvent: TelemetryEvent = {
    id: `ev-trap-${packet.ts}-${target.id}-${Math.random().toString(36).slice(2, 5)}`,
    ts: packet.ts,
    hostId: target.id,
    hostname: target.hostname,
    direction: 'HOST → NOC',
    mechanism: 'SNMP Trap',
    protocol: 'SNMP',
    itemKeyOrOid: `${packet.trapOid} (${trapKind})`,
    summary: isSuppressed ? `[SUPPRESSED] ${packet.summary}` : packet.summary,
    rttMs: 1,
    success: true,
  };

  const trapProblem: AlarmProblem = {
    id: `prob-trap-${packet.ts}-${target.id}-${Math.random().toString(36).slice(2, 5)}`,
    hostId: target.id,
    hostname: target.hostname,
    hostIp: target.ip,
    hostGroup: target.group,
    severity: packet.severity,
    title: customTitle ?? packet.summary,
    expression: `snmptrap[${trapKind}]`,
    sourceCheck: 'SNMP Trap',
    startedAt: packet.ts,
    acknowledged: false,
    resolved: false,
    suppressedInMaintenance: isSuppressed,
    notes: [],
  };

  const nextHosts = state.hosts.map((h) => {
    if (h.id !== target.id) return h;
    const nextStatus =
      h.status === 'MAINTENANCE' || h.status === 'DOWN' ? h.status : ('WARNING' as const);
    return {
      ...h,
      status: nextStatus,
      metrics:
        trapKind === 'coldStart' ? { ...h.metrics, sysUpTimeSec: 4 } : h.metrics,
    };
  });

  return {
    ...state,
    hosts: nextHosts,
    trapLog: [packet, ...state.trapLog].slice(0, 30),
    telemetryFeed: [feedEvent, ...state.telemetryFeed].slice(0, 60),
    problems: [trapProblem, ...state.problems].slice(0, 80),
  };
}

function baseReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_TAB':
      return { ...state, activeTab: action.tab };

    case 'SET_SPEED':
      return { ...state, simulationSpeed: action.speed };

    case 'TICK':
      return stepTelemetry(state, action.manualHostId);

    case 'INJECT_CHAOS':
      return injectAnomalyIntoState(state, action.hostId, action.kind);

    case 'INJECT_CHAOS_SCENARIO': {
      const targetId = action.hostId;
      switch (action.scenario) {
        case 'cpu_spike':
          return injectAnomalyIntoState(state, targetId ?? 'srv-web-front', 'cpu_spike');
        case 'memory_leak':
          return injectAnomalyIntoState(state, targetId ?? 'srv-db-prod', 'memory_pressure');
        case 'disk_critical':
          return injectAnomalyIntoState(state, targetId ?? 'nas-backup-01', 'disk_critical');
        case 'fiber_cut_core': {
          const withTrap = appendTrapToState(
            state,
            'sw-core-01',
            'linkDown',
            'v2c',
            'Corte de enlace troncal fibra óptica en SW-CORE-01 (Gi0/1 DOWN)'
          );
          return injectAnomalyIntoState(withTrap, 'sw-core-01', 'host_down');
        }
        case 'snmp_trap_storm': {
          let next = appendTrapToState(state, 'fw-perimetral-01', 'authenticationFailure', 'v3');
          next = appendTrapToState(next, 'sw-core-01', 'psuRedundantDown', 'v2c');
          next = appendTrapToState(next, 'rtr-borde-isp', 'linkDown', 'v3');
          next = appendTrapToState(next, 'fw-perimetral-01', 'fwSessionThreshold', 'v3');
          return { ...next, chaosCount: next.chaosCount + 1 };
        }
        case 'zabbix_agent_timeout': {
          const agentTarget =
            targetId ??
            state.hosts.find((h) => h.checkMode === 'active')?.id ??
            'srv-db-prod';
          return injectAnomalyIntoState(state, agentTarget, 'host_down');
        }
      }
      return state;
    }

    case 'RECOVER_HOST':
      return recoverHostInState(state, action.hostId);

    case 'RECOVER_ALL':
      return recoverAllInState(state);

    case 'SELECT_HOST':
      return { ...state, selectedHostId: action.hostId };

    case 'UPSERT_HOST': {
      const exists = state.hosts.some((h) => h.id === action.host.id);
      const hosts = exists
        ? state.hosts.map((h) => (h.id === action.host.id ? action.host : h))
        : [...state.hosts, action.host];
      return stepTelemetry({ ...state, hosts }, action.host.id);
    }

    case 'DELETE_HOST':
      return {
        ...state,
        selectedHostId: state.selectedHostId === action.hostId ? null : state.selectedHostId,
        hosts: state.hosts.filter((h) => h.id !== action.hostId),
        problems: state.problems.filter((p) => p.hostId !== action.hostId),
      };

    case 'TOGGLE_MAINTENANCE': {
      const now = Date.now();
      const target = state.hosts.find((h) => h.id === action.hostId);
      if (!target) return state;

      const existingActive = getActiveMaintenanceWindow(target, state.maintenanceWindows);
      let nextWindows: MaintenanceWindow[];

      if (existingActive) {
        if (existingActive.targetType === 'hosts' && existingActive.hostIds.length <= 1) {
          nextWindows = state.maintenanceWindows.map((w) =>
            w.id === existingActive.id ? { ...w, status: 'completed' as const } : w
          );
        } else if (existingActive.targetType === 'hosts') {
          nextWindows = state.maintenanceWindows.map((w) =>
            w.id === existingActive.id
              ? { ...w, hostIds: w.hostIds.filter((id) => id !== target.id) }
              : w
          );
        } else {
          nextWindows = state.maintenanceWindows.map((w) =>
            w.id === existingActive.id ? { ...w, status: 'completed' as const } : w
          );
        }
      } else {
        const win: MaintenanceWindow = {
          id: `mnt-${now}-${target.id}`,
          name: `Mantenimiento rápido · ${target.hostname}`,
          targetType: 'hosts',
          hostIds: [target.id],
          hostGroup: null,
          mode: 'with_data',
          status: 'active',
          reason: action.reason ?? 'Mantenimiento preventivo activado desde consola',
          startedAt: now,
          durationMin: action.durationMin ?? 60,
          suppressAlerts: true,
        };
        nextWindows = [win, ...state.maintenanceWindows];
      }

      const syncedHosts = syncHostsWithActiveMaintenance(state.hosts, nextWindows);
      return stepTelemetry({
        ...state,
        hosts: syncedHosts,
        maintenanceWindows: nextWindows,
      });
    }

    case 'ADD_MAINTENANCE_WINDOW': {
      const now = Date.now();
      const { payload } = action;
      const win: MaintenanceWindow = {
        id: `mnt-${now}-${Math.random().toString(36).slice(2, 6)}`,
        name: payload.name.trim() || 'Ventana de Mantenimiento Programada',
        targetType: payload.targetType,
        hostIds: payload.targetType === 'hosts' ? payload.hostIds : [],
        hostGroup: payload.targetType === 'group' ? payload.hostGroup : null,
        mode: payload.mode,
        status: payload.status,
        reason: payload.reason.trim() || 'Intervención planificada NOC',
        startedAt: now,
        durationMin: Math.max(5, payload.durationMin),
        suppressAlerts: true,
      };
      const nextWindows = [win, ...state.maintenanceWindows];
      const syncedHosts = syncHostsWithActiveMaintenance(state.hosts, nextWindows);
      const nextState: AppState = {
        ...state,
        hosts: syncedHosts,
        maintenanceWindows: nextWindows,
      };
      return payload.status === 'active' ? stepTelemetry(nextState) : nextState;
    }

    case 'SET_MAINTENANCE_STATUS': {
      const now = Date.now();
      const nextWindows = state.maintenanceWindows.map((w) => {
        if (w.id !== action.windowId) return w;
        return {
          ...w,
          status: action.status,
          startedAt: action.status === 'active' ? now : w.startedAt,
        };
      });
      const syncedHosts = syncHostsWithActiveMaintenance(state.hosts, nextWindows);
      const nextProblems = state.problems.map((p) => {
        if (p.resolved) return p;
        const h = syncedHosts.find((host) => host.id === p.hostId);
        if (!h) return p;
        const activeWin = getActiveMaintenanceWindow(h, nextWindows);
        return {
          ...p,
          suppressedInMaintenance: Boolean(activeWin && activeWin.mode === 'with_data'),
        };
      });
      return stepTelemetry({
        ...state,
        hosts: syncedHosts,
        maintenanceWindows: nextWindows,
        problems: nextProblems,
      });
    }

    case 'DELETE_MAINTENANCE_WINDOW': {
      const nextWindows = state.maintenanceWindows.filter((w) => w.id !== action.windowId);
      const syncedHosts = syncHostsWithActiveMaintenance(state.hosts, nextWindows);
      const nextProblems = state.problems.map((p) => {
        if (p.resolved) return p;
        const h = syncedHosts.find((host) => host.id === p.hostId);
        if (!h) return p;
        const activeWin = getActiveMaintenanceWindow(h, nextWindows);
        return {
          ...p,
          suppressedInMaintenance: Boolean(activeWin && activeWin.mode === 'with_data'),
        };
      });
      return stepTelemetry({
        ...state,
        hosts: syncedHosts,
        maintenanceWindows: nextWindows,
        problems: nextProblems,
      });
    }

    case 'SIMULATE_CRITICAL_REBOOT': {
      const now = Date.now();
      const targetId = action.hostId ?? 'srv-db-prod';
      const target = state.hosts.find((h) => h.id === targetId);
      if (!target) return state;

      const activeWin = getActiveMaintenanceWindow(target, state.maintenanceWindows);
      const isProtected = Boolean(activeWin) || target.status === 'MAINTENANCE';

      if (isProtected) {
        const mode = activeWin?.mode ?? 'with_data';
        const feedEv: TelemetryEvent = {
          id: `ev-reboot-maint-${now}`,
          ts: now,
          hostId: target.id,
          hostname: target.hostname,
          direction: 'HOST → NOC',
          mechanism: mode === 'no_data' ? 'Manual Execute' : 'SNMP Trap',
          protocol: 'ICMP',
          itemKeyOrOid: 'system.uptime (Maintenance Reboot)',
          summary:
            mode === 'no_data'
              ? `Reinicio controlado en ${target.hostname} · Sin recolección de datos (0 alarmas, SLA intacto)`
              : `Reinicio controlado en ${target.hostname} · Alarma suprimida en mantenimiento (${activeWin?.name ?? 'Ventana activa'})`,
          rttMs: 1,
          success: true,
        };

        const suppressedProblem: AlarmProblem | null =
          mode === 'with_data'
            ? {
                id: `prob-maint-reboot-${now}-${target.id}`,
                hostId: target.id,
                hostname: target.hostname,
                hostIp: target.ip,
                hostGroup: target.group,
                severity: 'disaster',
                title: `Reinicio programado en ${target.hostname} (Suprimido por Mantenimiento)`,
                expression: `nodata(/${target.hostname}/agent.ping,60s)=1`,
                sourceCheck: 'Activo (Agente)',
                startedAt: now,
                acknowledged: false,
                resolved: false,
                suppressedInMaintenance: true,
                notes: [
                  {
                    id: `note-maint-${now}`,
                    ts: now,
                    author: 'Motor Zabbix',
                    text: `Evento contenido automáticamente por ventana "${activeWin?.name ?? 'Mantenimiento activo'}". Sin impacto en SLA.`,
                  },
                ],
              }
            : null;

        return {
          ...state,
          hosts: state.hosts.map((h) =>
            h.id === target.id
              ? { ...h, metrics: { ...h.metrics, sysUpTimeSec: 5 } }
              : h
          ),
          telemetryFeed: [feedEv, ...state.telemetryFeed].slice(0, 60),
          problems: suppressedProblem
            ? [suppressedProblem, ...state.problems].slice(0, 80)
            : state.problems,
        };
      }

      const trapPacket = createSnmpTrapPacket(target, 'coldStart', 'v3');
      const disasterProb: AlarmProblem = {
        id: `prob-crit-reboot-${now}-${target.id}`,
        hostId: target.id,
        hostname: target.hostname,
        hostIp: target.ip,
        hostGroup: target.group,
        severity: 'disaster',
        title: `CAÍDA NO PLANIFICADA: ${target.hostname} reiniciado sin ventana de mantenimiento`,
        expression: `last(/${target.hostname}/icmpping)=0 and nodata(/${target.hostname}/agent.ping,60s)=1`,
        sourceCheck: 'Activo (Agente)',
        startedAt: now,
        acknowledged: false,
        resolved: false,
        suppressedInMaintenance: false,
        notes: [],
      };
      const trapEv: TelemetryEvent = {
        id: `ev-reboot-crit-${now}`,
        ts: now,
        hostId: target.id,
        hostname: target.hostname,
        direction: 'HOST → NOC',
        mechanism: 'SNMP Trap',
        protocol: 'SNMP',
        itemKeyOrOid: trapPacket.trapOid,
        summary: `DISASTER · Reinicio inesperado sin mantenimiento en ${target.hostname} (Penalización SLA -2.50%)`,
        rttMs: 0,
        success: false,
      };

      const downState: AppState = {
        ...state,
        chaosCount: state.chaosCount + 1,
        slaScore: Number(Math.max(75.0, state.slaScore - 2.5).toFixed(2)),
        hosts: state.hosts.map((h) =>
          h.id === target.id
            ? {
                ...h,
                activeAnomaly: 'host_down',
                metrics: { ...h.metrics, sysUpTimeSec: 0 },
              }
            : h
        ),
        trapLog: [trapPacket, ...state.trapLog].slice(0, 30),
        telemetryFeed: [trapEv, ...state.telemetryFeed].slice(0, 60),
        problems: [disasterProb, ...state.problems].slice(0, 80),
      };

      return stepTelemetry(downState, target.id);
    }

    case 'ACK_PROBLEM': {
      const now = Date.now();
      return {
        ...state,
        problems: state.problems.map((p) => {
          if (p.id !== action.problemId) return p;
          const nextAck = !p.acknowledged;
          return {
            ...p,
            acknowledged: nextAck,
            acknowledgedAt: nextAck ? p.acknowledgedAt ?? now : p.acknowledgedAt,
            assignedOperator: p.assignedOperator ?? (nextAck ? 'Analista NOC' : undefined),
          };
        }),
      };
    }

    case 'RESOLVE_PROBLEM': {
      const now = Date.now();
      const targetProb = state.problems.find((p) => p.id === action.problemId);
      if (!targetProb) return state;
      const recovered = recoverHostInState(state, targetProb.hostId);
      return {
        ...recovered,
        problems: recovered.problems.map((p) =>
          p.id === action.problemId ? { ...p, resolved: true, resolvedAt: now } : p
        ),
      };
    }

    case 'TRIAGE_PROBLEM': {
      const now = Date.now();
      const { payload } = action;
      const target = state.problems.find((p) => p.id === payload.problemId);
      if (!target) return state;

      const trimmedNote = payload.noteText?.trim();
      const newNote: ProblemNote | null = trimmedNote
        ? {
            id: `note-${now}-${Math.random().toString(36).slice(2, 6)}`,
            ts: now,
            author: payload.noteAuthor?.trim() || payload.assignedOperator || 'Analista NOC',
            text: trimmedNote,
          }
        : null;

      return {
        ...state,
        problems: state.problems.map((p) => {
          if (p.id !== payload.problemId) return p;
          const nextAck =
            payload.acknowledged !== undefined
              ? payload.acknowledged
              : newNote
              ? true
              : p.acknowledged;
          return {
            ...p,
            acknowledged: nextAck,
            acknowledgedAt: nextAck ? p.acknowledgedAt ?? now : p.acknowledgedAt,
            assignedOperator:
              payload.assignedOperator !== undefined
                ? payload.assignedOperator || undefined
                : p.assignedOperator,
            severity: payload.severity ?? p.severity,
            markedFalsePositive:
              payload.markedFalsePositive !== undefined
                ? payload.markedFalsePositive
                : p.markedFalsePositive,
            resolved: payload.closeManually ? true : p.resolved,
            resolvedAt: payload.closeManually ? now : p.resolvedAt,
            notes: newNote ? [newNote, ...p.notes] : p.notes,
          };
        }),
      };
    }

    case 'RUN_DIAGNOSTIC_RECOVERY': {
      const now = Date.now();
      const recovered = recoverHostInState(state, action.hostId);
      const targetHost = recovered.hosts.find((h) => h.id === action.hostId);
      const ev: TelemetryEvent = {
        id: `ev-diag-${now}-${action.hostId}`,
        ts: now,
        hostId: action.hostId,
        hostname: targetHost?.hostname ?? action.hostId,
        direction: 'NOC → HOST',
        mechanism: 'Manual Execute',
        protocol: 'ZBX',
        itemKeyOrOid: 'system.run[systemctl restart service]',
        summary: action.actionLabel ?? `Script remoto ejecutado · Servicio reiniciado y host recuperado`,
        rttMs: 14,
        success: true,
      };
      const nextProblems = action.problemId
        ? recovered.problems.map((p) =>
            p.id === action.problemId
              ? {
                  ...p,
                  acknowledged: true,
                  acknowledgedAt: p.acknowledgedAt ?? now,
                  resolved: true,
                  resolvedAt: now,
                  notes: [
                    {
                      id: `note-diag-${now}`,
                      ts: now,
                      author: 'Script Remoto NOC',
                      text:
                        action.actionLabel ??
                        'Reinicio remoto de servicio ejecutado vía SSH/Agente Zabbix. Estado normalizado.',
                    },
                    ...p.notes,
                  ],
                }
              : p
          )
        : recovered.problems;

      return {
        ...recovered,
        problems: nextProblems,
        telemetryFeed: [ev, ...recovered.telemetryFeed].slice(0, 60),
      };
    }

    case 'TOGGLE_TRIGGER': {
      const nextTriggers = state.triggers.map((t) =>
        t.id === action.triggerId ? { ...t, enabled: !t.enabled } : t
      );
      return stepTelemetry({ ...state, triggers: nextTriggers });
    }

    case 'UPSERT_TRIGGER': {
      const exists = state.triggers.some((t) => t.id === action.trigger.id);
      const nextTriggers = exists
        ? state.triggers.map((t) => (t.id === action.trigger.id ? action.trigger : t))
        : [action.trigger, ...state.triggers];
      return stepTelemetry({ ...state, triggers: nextTriggers });
    }

    case 'DELETE_TRIGGER': {
      const now = Date.now();
      return {
        ...state,
        triggers: state.triggers.filter((t) => t.id !== action.triggerId),
        problems: state.problems.map((p) =>
          p.triggerId === action.triggerId && !p.resolved
            ? { ...p, resolved: true, resolvedAt: now }
            : p
        ),
      };
    }

    case 'FIX_ANTI_PATTERN_TRIGGER': {
      const nextTriggers = state.triggers.map((t) =>
        t.id === action.triggerId ? fixAntiPatternTriggerRule(t) : t
      );
      return stepTelemetry({ ...state, triggers: nextTriggers });
    }

    case 'TOGGLE_WAN_FLAP':
      return { ...state, wanFlapSimulation: !state.wanFlapSimulation };

    case 'COMPLETE_CHALLENGE':
      return {
        ...state,
        challenges: state.challenges.map((c) =>
          c.id === action.challengeId ? { ...c, completed: !c.completed } : c
        ),
      };

    case 'RECORD_SNMP_ACTIVITY':
      return {
        ...state,
        labProgress: {
          ...state.labProgress,
          snmpQueriedFw:
            state.labProgress.snmpQueriedFw || (action.hostId === 'fw-perimetral-01' && action.ok),
          snmpDiagnosedDbFail:
            state.labProgress.snmpDiagnosedDbFail || (action.hostId === 'srv-db-prod' && !action.ok),
        },
      };

    case 'LAUNCH_MISSION': {
      const now = Date.now();
      switch (action.missionId) {
        case 'mission-1':
          return { ...state, activeTab: 'mib_explorer' };

        case 'mission-2': {
          const withFlap: AppState = {
            ...state,
            wanFlapSimulation: true,
            hosts: state.hosts.map((h) =>
              h.id === 'srv-db-prod'
                ? { ...h, metrics: { ...h.metrics, cpu: 88.2 } }
                : h.id === 'rtr-borde-isp'
                ? { ...h, metrics: { ...h.metrics, icmpLatencyMs: 101.4 } }
                : h
            ),
            activeTab: 'problems',
          };
          return stepTelemetry(withFlap);
        }

        case 'mission-3': {
          const withTrap = appendTrapToState(
            {
              ...state,
              labProgress: { ...state.labProgress, mission3Launched: true },
            },
            'sw-core-01',
            'linkDown',
            'v2c',
            'SNMP Trap linkDown · Interfaz troncal SW-CORE-01 Gi0/1 caída (Posible causa raíz)'
          );
          const withCoreDown = injectAnomalyIntoState(withTrap, 'sw-core-01', 'host_down');
          return { ...withCoreDown, activeTab: 'problems' };
        }

        case 'mission-4':
          return { ...state, activeTab: 'maintenance' };

        case 'mission-5': {
          const armed: AppState = {
            ...state,
            activeTab: 'problems',
            triggers: state.triggers.map((t) =>
              t.id === 'trg-fp-nas-backup-net' ? { ...t, enabled: true } : t
            ),
            hosts: state.hosts.map((h) =>
              h.id === 'nas-backup-01'
                ? { ...h, metrics: { ...h.metrics, netInMbps: 342 } }
                : h
            ),
            labProgress: {
              ...state.labProgress,
              mission5StartedAt: now,
              mission5FinishedInTime: false,
            },
          };
          const withAuthTrap = appendTrapToState(
            armed,
            'fw-perimetral-01',
            'authenticationFailure',
            'v3',
            'Ataque fuerza bruta SNMP (authenticationFailure) detectado en FW-PERIMETRAL-01'
          );
          return injectAnomalyIntoState(withAuthTrap, 'srv-db-prod', 'disk_critical');
        }

        default:
          return state;
      }
    }

    case 'RUN_MISSION4_UPGRADE': {
      const now = Date.now();
      const adHost = state.hosts.find((h) => h.id === 'srv-ad-dc01');
      const nasHost = state.hosts.find((h) => h.id === 'nas-backup-01');
      if (!adHost || !nasHost) return state;

      const adWin = getActiveMaintenanceWindow(adHost, state.maintenanceWindows);
      const nasWin = getActiveMaintenanceWindow(nasHost, state.maintenanceWindows);
      const bothProtectedWithData = Boolean(
        adWin && nasWin && adWin.mode === 'with_data' && nasWin.mode === 'with_data'
      );

      if (bothProtectedWithData) {
        const suppAd: AlarmProblem = {
          id: `prob-m4-ad-${now}`,
          hostId: adHost.id,
          hostname: adHost.hostname,
          hostIp: adHost.ip,
          hostGroup: adHost.group,
          severity: 'high',
          title: 'Reinicio por actualización de parches en SRV-AD-DC01 (Suprimido)',
          expression: 'nodata(/SRV-AD-DC01/agent.ping,60s)=1',
          sourceCheck: 'Activo (Agente)',
          startedAt: now,
          acknowledged: false,
          resolved: false,
          suppressedInMaintenance: true,
          notes: [],
        };
        const suppNas: AlarmProblem = {
          id: `prob-m4-nas-${now}`,
          hostId: nasHost.id,
          hostname: nasHost.hostname,
          hostIp: nasHost.ip,
          hostGroup: nasHost.group,
          severity: 'average',
          title: 'Reinicio de servicios DSM en NAS-BACKUP-01 (Suprimido)',
          expression: 'last(/NAS-BACKUP-01/icmppingloss)>=90',
          sourceCheck: 'SNMP Trap',
          startedAt: now,
          acknowledged: false,
          resolved: false,
          suppressedInMaintenance: true,
          notes: [],
        };
        const ev: TelemetryEvent = {
          id: `ev-m4-ok-${now}`,
          ts: now,
          hostId: adHost.id,
          hostname: 'SRV-AD-DC01 + NAS-BACKUP-01',
          direction: 'NOC → HOST',
          mechanism: 'Manual Execute',
          protocol: 'ZBX',
          itemKeyOrOid: 'maintenance.upgrade[with_data]',
          summary:
            'Actualización completada bajo ventana With Data Collection · 0% alertas no suprimidas · SLA 100%',
          rttMs: 2,
          success: true,
        };
        return {
          ...state,
          problems: [suppAd, suppNas, ...state.problems].slice(0, 80),
          telemetryFeed: [ev, ...state.telemetryFeed].slice(0, 60),
          labProgress: {
            ...state.labProgress,
            mission4UpgradeSimulated: true,
            mission4UpgradeClean: true,
          },
        };
      }

      // Unprotected upgrade -> causes real Disaster alerts + SLA penalty!
      let next = injectAnomalyIntoState(state, 'srv-ad-dc01', 'host_down');
      next = injectAnomalyIntoState(next, 'nas-backup-01', 'host_down');
      return {
        ...next,
        slaScore: Number(Math.max(75, next.slaScore - 3.0).toFixed(2)),
        labProgress: {
          ...next.labProgress,
          mission4UpgradeSimulated: true,
          mission4UpgradeClean: false,
        },
      };
    }

    case 'RESET_FACTORY': {
      try {
        window.localStorage.removeItem(NOC_STORAGE_KEY);
      } catch {
        // Ignore storage errors in restricted environments
      }
      return createInitialAppState();
    }

    case 'ADD_CUSTOM_SNMP_ITEM': {
      const now = Date.now();
      const target = state.hosts.find((h) => h.id === action.hostId);
      if (!target) return state;
      const alreadyExists = target.customSnmpItems.some((i) => i.oid === action.item.oid);
      const nextHosts = state.hosts.map((h) => {
        if (h.id !== action.hostId) return h;
        const customSnmpItems = alreadyExists
          ? h.customSnmpItems.map((i) => (i.oid === action.item.oid ? action.item : i))
          : [...h.customSnmpItems, action.item];
        return { ...h, customSnmpItems };
      });
      const ev: TelemetryEvent = {
        id: `ev-item-${now}`,
        ts: now,
        hostId: target.id,
        hostname: target.hostname,
        direction: 'NOC → HOST',
        mechanism: 'Manual Execute',
        protocol: 'SNMP',
        itemKeyOrOid: `${action.item.oid} (${action.item.name})`,
        summary: `Ítem personalizado vinculado y graficado: ${action.item.lastFormattedValue}`,
        rttMs: 2,
        success: true,
      };
      return {
        ...state,
        hosts: nextHosts,
        telemetryFeed: [ev, ...state.telemetryFeed].slice(0, 60),
      };
    }

    case 'REMOVE_CUSTOM_SNMP_ITEM':
      return {
        ...state,
        hosts: state.hosts.map((h) =>
          h.id === action.hostId
            ? { ...h, customSnmpItems: h.customSnmpItems.filter((i) => i.id !== action.itemId) }
            : h
        ),
      };

    case 'APPLY_SNMP_SET': {
      const now = Date.now();
      const target = state.hosts.find((h) => h.id === action.hostId);
      if (!target) return state;
      const nextHosts = state.hosts.map((h) => {
        if (h.id !== action.hostId) return h;
        if (action.field === 'hostname') {
          return { ...h, hostname: action.value };
        }
        return {
          ...h,
          snmpMeta: {
            ...h.snmpMeta,
            [action.field]: action.value,
          },
        };
      });
      const ev: TelemetryEvent = {
        id: `ev-set-${now}`,
        ts: now,
        hostId: target.id,
        hostname: action.field === 'hostname' ? action.value : target.hostname,
        direction: 'NOC → HOST',
        mechanism: 'Manual Execute',
        protocol: 'SNMP',
        itemKeyOrOid: `snmpset (${action.field})`,
        summary: `SNMP SET aplicado · ${action.field} = "${action.value}"`,
        rttMs: 2,
        success: true,
      };
      return {
        ...state,
        hosts: nextHosts,
        telemetryFeed: [ev, ...state.telemetryFeed].slice(0, 60),
      };
    }

    case 'EMIT_SNMP_TRAP':
      return appendTrapToState(state, action.hostId, action.trapKind, action.version);

    case 'CLEAR_TRAP_LOG':
      return { ...state, trapLog: [] };

    default:
      return state;
  }
}

function reducer(state: AppState, action: Action): AppState {
  const next = baseReducer(state, action);
  if (action.type === 'RESET_FACTORY') return next;
  return syncMissionsAndXp(next);
}

export function useNocStore() {
  const [state, dispatch] = useReducer(reducer, undefined, loadInitialState);

  useEffect(() => {
    if (state.simulationSpeed === 0) return;

    const intervalMs =
      state.simulationSpeed === 5 ? 450 : state.simulationSpeed === 2 ? 1000 : 2000;

    const timer = window.setInterval(() => {
      dispatch({ type: 'TICK' });
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [state.simulationSpeed]);

  // Persist key NOC state to localStorage (debounced gently on meaningful changes)
  useEffect(() => {
    const id = window.setTimeout(() => {
      try {
        window.localStorage.setItem(NOC_STORAGE_KEY, JSON.stringify(state));
      } catch {
        // Ignore quota errors
      }
    }, 350);
    return () => window.clearTimeout(id);
  }, [state]);

  const setActiveTab = useCallback((tab: NavSection) => dispatch({ type: 'SET_TAB', tab }), []);
  const setSimulationSpeed = useCallback(
    (speed: SimulationSpeed) => dispatch({ type: 'SET_SPEED', speed }),
    []
  );
  const executeNow = useCallback(
    (hostId: string) => dispatch({ type: 'TICK', manualHostId: hostId }),
    []
  );
  const injectChaos = useCallback(
    (hostId?: string, kind?: AnomalyKind) => dispatch({ type: 'INJECT_CHAOS', hostId, kind }),
    []
  );
  const injectChaosScenario = useCallback(
    (scenario: ChaosScenarioKind, hostId?: string) =>
      dispatch({ type: 'INJECT_CHAOS_SCENARIO', scenario, hostId }),
    []
  );
  const recoverHost = useCallback(
    (hostId: string) => dispatch({ type: 'RECOVER_HOST', hostId }),
    []
  );
  const recoverAll = useCallback(() => dispatch({ type: 'RECOVER_ALL' }), []);
  const selectHost = useCallback(
    (hostId: string | null) => dispatch({ type: 'SELECT_HOST', hostId }),
    []
  );
  const upsertHost = useCallback((host: Host) => dispatch({ type: 'UPSERT_HOST', host }), []);
  const deleteHost = useCallback((hostId: string) => dispatch({ type: 'DELETE_HOST', hostId }), []);
  const toggleMaintenance = useCallback(
    (hostId: string, reason?: string, durationMin?: number) =>
      dispatch({ type: 'TOGGLE_MAINTENANCE', hostId, reason, durationMin }),
    []
  );
  const createMaintenanceWindow = useCallback(
    (payload: CreateMaintenancePayload) =>
      dispatch({ type: 'ADD_MAINTENANCE_WINDOW', payload }),
    []
  );
  const setMaintenanceStatus = useCallback(
    (windowId: string, status: MaintenanceStatus) =>
      dispatch({ type: 'SET_MAINTENANCE_STATUS', windowId, status }),
    []
  );
  const deleteMaintenanceWindow = useCallback(
    (windowId: string) => dispatch({ type: 'DELETE_MAINTENANCE_WINDOW', windowId }),
    []
  );
  const simulateCriticalReboot = useCallback(
    (hostId?: string) => dispatch({ type: 'SIMULATE_CRITICAL_REBOOT', hostId }),
    []
  );
  const acknowledgeProblem = useCallback(
    (problemId: string) => dispatch({ type: 'ACK_PROBLEM', problemId }),
    []
  );
  const resolveProblem = useCallback(
    (problemId: string) => dispatch({ type: 'RESOLVE_PROBLEM', problemId }),
    []
  );
  const triageProblem = useCallback(
    (payload: TriageProblemPayload) => dispatch({ type: 'TRIAGE_PROBLEM', payload }),
    []
  );
  const runDiagnosticRecovery = useCallback(
    (hostId: string, problemId?: string, actionLabel?: string) =>
      dispatch({ type: 'RUN_DIAGNOSTIC_RECOVERY', hostId, problemId, actionLabel }),
    []
  );
  const toggleTrigger = useCallback(
    (triggerId: string) => dispatch({ type: 'TOGGLE_TRIGGER', triggerId }),
    []
  );
  const completeChallenge = useCallback(
    (challengeId: string) => dispatch({ type: 'COMPLETE_CHALLENGE', challengeId }),
    []
  );
  const launchMission = useCallback(
    (missionId: string) => dispatch({ type: 'LAUNCH_MISSION', missionId }),
    []
  );
  const runMission4Upgrade = useCallback(
    () => dispatch({ type: 'RUN_MISSION4_UPGRADE' }),
    []
  );
  const recordSnmpActivity = useCallback(
    (hostId: string, ok: boolean) => dispatch({ type: 'RECORD_SNMP_ACTIVITY', hostId, ok }),
    []
  );
  const resetFactory = useCallback(() => dispatch({ type: 'RESET_FACTORY' }), []);
  const addCustomSnmpItem = useCallback(
    (hostId: string, item: CustomSnmpItem) =>
      dispatch({ type: 'ADD_CUSTOM_SNMP_ITEM', hostId, item }),
    []
  );
  const removeCustomSnmpItem = useCallback(
    (hostId: string, itemId: string) =>
      dispatch({ type: 'REMOVE_CUSTOM_SNMP_ITEM', hostId, itemId }),
    []
  );
  const applySnmpSetMutation = useCallback(
    (hostId: string, field: 'sysContact' | 'sysLocation' | 'hostname', value: string) =>
      dispatch({ type: 'APPLY_SNMP_SET', hostId, field, value }),
    []
  );
  const emitSnmpTrap = useCallback(
    (hostId: string, trapKind: TrapKind, version: 'v2c' | 'v3') =>
      dispatch({ type: 'EMIT_SNMP_TRAP', hostId, trapKind, version }),
    []
  );
  const clearTrapLog = useCallback(() => dispatch({ type: 'CLEAR_TRAP_LOG' }), []);
  const upsertTrigger = useCallback(
    (trigger: TriggerRule) => dispatch({ type: 'UPSERT_TRIGGER', trigger }),
    []
  );
  const deleteTrigger = useCallback(
    (triggerId: string) => dispatch({ type: 'DELETE_TRIGGER', triggerId }),
    []
  );
  const fixAntiPatternTrigger = useCallback(
    (triggerId: string) => dispatch({ type: 'FIX_ANTI_PATTERN_TRIGGER', triggerId }),
    []
  );
  const toggleWanFlapSimulation = useCallback(() => dispatch({ type: 'TOGGLE_WAN_FLAP' }), []);

  return {
    state,
    actions: {
      setActiveTab,
      setSimulationSpeed,
      executeNow,
      injectChaos,
      injectChaosScenario,
      recoverHost,
      recoverAll,
      selectHost,
      upsertHost,
      deleteHost,
      toggleMaintenance,
      createMaintenanceWindow,
      setMaintenanceStatus,
      deleteMaintenanceWindow,
      simulateCriticalReboot,
      acknowledgeProblem,
      resolveProblem,
      triageProblem,
      runDiagnosticRecovery,
      toggleTrigger,
      upsertTrigger,
      deleteTrigger,
      fixAntiPatternTrigger,
      toggleWanFlapSimulation,
      completeChallenge,
      launchMission,
      runMission4Upgrade,
      recordSnmpActivity,
      resetFactory,
      addCustomSnmpItem,
      removeCustomSnmpItem,
      applySnmpSetMutation,
      emitSnmpTrap,
      clearTrapLog,
    },
  };
}
