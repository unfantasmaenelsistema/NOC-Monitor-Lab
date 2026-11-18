/**
 * Saneado del estado guardado en localStorage.
 *
 * Antes se mezclaba tal cual con el estado inicial ({ ...base, ...parsed }): un host `null`, un número
 * convertido en texto o una lista que dejaba de ser lista (por una versión antigua, una edición a mano
 * o una escritura a medias) dejaban la página en blanco en cada recarga. Aquí cada elemento se valida
 * contra su forma esperada; lo que no encaja se descarta y se usa el valor inicial.
 */
import type { AppState, LabProgress } from '../types/noc';

type Regla =
  | 'n' // número finito
  | 's' // texto
  | 'b' // booleano
  | 'n?' // número o null
  | 's?' // texto o null
  | 'n~' // número opcional (puede faltar)
  | 's~' // texto opcional
  | 'b~' // booleano opcional
  | readonly string[] // valor de una lista cerrada
  | { opt: readonly string[] } // valor de una lista cerrada, opcional
  | { nul: readonly string[] } // valor de una lista cerrada o null
  | { arr: Regla } // lista cuyos elementos cumplen la regla
  | { rec: Regla } // objeto clave → valor
  | { obj: Esquema }; // objeto con estos campos

interface Esquema {
  [campo: string]: Regla;
}

const SEVERIDADES = ['not_classified', 'information', 'warning', 'average', 'high', 'disaster'] as const;
const GRUPOS = ['Seguridad', 'Networking', 'Servidores', 'Almacenamiento'] as const;
const PROTOCOLOS = ['ZBX', 'SNMP', 'ICMP', 'HTTP'] as const;
const ANOMALIAS = ['cpu_spike', 'memory_pressure', 'net_saturation', 'packet_loss', 'host_down', 'disk_critical'] as const;
const OPERADORES = ['>', '>=', '<', '<='] as const;

const HOST: Esquema = {
  id: 's',
  hostname: 's',
  ip: 's',
  role: 's',
  vendorOs: 's',
  group: GRUPOS,
  checkMode: ['passive', 'active', 'mixed'],
  pollingIntervalSec: 'n',
  lastPassivePollAt: 'n',
  lastActivePushAt: 'n?',
  status: ['UP', 'WARNING', 'DOWN', 'MAINTENANCE'],
  activeAnomaly: { nul: ANOMALIAS },
  parentId: 's?',
  interfaces: {
    arr: {
      obj: {
        protocol: PROTOCOLOS,
        label: 's',
        port: 'n',
        availability: ['available', 'unavailable', 'degraded', 'disabled'],
        checkMode: ['passive', 'active'],
        detail: 's',
      },
    },
  },
  metrics: {
    obj: {
      cpu: 'n',
      ramUsedGb: 'n',
      ramTotalGb: 'n',
      ramPct: 'n',
      diskPct: 'n',
      diskUsedTb: 'n',
      diskTotalTb: 'n',
      netInterface: 's',
      netInMbps: 'n',
      netOutMbps: 'n',
      icmpLatencyMs: 'n',
      packetLossPct: 'n',
      sysUpTimeSec: 'n',
    },
  },
  baseline: { obj: { cpu: 'n', ramPct: 'n', diskPct: 'n', netInMbps: 'n', netOutMbps: 'n', latencyMs: 'n' } },
  history: {
    arr: {
      obj: { ts: 'n', cpu: 'n', ramPct: 'n', diskPct: 'n', netInMbps: 'n', netOutMbps: 'n', latencyMs: 'n', packetLossPct: 'n' },
    },
  },
  snmpMeta: {
    obj: {
      communityRo: 's',
      communityRw: 's',
      v3User: 's',
      v3AuthPass: 's',
      v3PrivKey: 's',
      sysContact: 's',
      sysLocation: 's',
      sysObjectID: 's',
    },
  },
  customSnmpItems: {
    arr: {
      obj: {
        id: 's',
        oid: 's',
        name: 's',
        dataType: 's',
        unit: 's',
        lastNumericValue: 'n',
        lastFormattedValue: 's',
        lastPolledAt: 'n',
        history: { arr: 'n' },
      },
    },
  },
};

const PROBLEMA: Esquema = {
  id: 's',
  hostId: 's',
  hostname: 's',
  hostIp: 's',
  hostGroup: GRUPOS,
  triggerId: 's~',
  severity: SEVERIDADES,
  title: 's',
  expression: 's',
  sourceCheck: ['Pasivo (Polling)', 'Activo (Agente)', 'SNMP Trap'],
  startedAt: 'n',
  acknowledged: 'b',
  acknowledgedAt: 'n~',
  resolved: 'b',
  resolvedAt: 'n~',
  suppressedByDependency: 's~',
  suppressedInMaintenance: 'b~',
  assignedOperator: 's~',
  notes: { arr: { obj: { id: 's', ts: 'n', author: 's', text: 's' } } },
  markedFalsePositive: 'b~',
};

const EVENTO: Esquema = {
  id: 's',
  ts: 'n',
  hostId: 's',
  hostname: 's',
  direction: ['NOC → HOST', 'HOST → NOC'],
  mechanism: ['Passive Polling', 'Active Check', 'SNMP Trap', 'Manual Execute'],
  protocol: PROTOCOLOS,
  itemKeyOrOid: 's',
  summary: 's',
  rttMs: 'n',
  success: 'b',
};

const TRAP: Esquema = {
  id: 's',
  ts: 'n',
  hostId: 's',
  hostname: 's',
  sourceIp: 's',
  trapKind: ['linkDown', 'coldStart', 'authenticationFailure', 'psuRedundantDown', 'fwSessionThreshold'],
  trapOid: 's',
  severity: SEVERIDADES,
  version: ['v2c', 'v3'],
  rawPdu: 's',
  summary: 's',
};

const TRIGGER: Esquema = {
  id: 's',
  name: 's',
  hostId: 's',
  category: ['CPU', 'Memoria', 'Disco', 'Red', 'Disponibilidad', 'Falso Positivo / Lab'],
  metric: ['cpu', 'ramPct', 'diskPct', 'packetLossPct', 'icmpLatencyMs', 'netTotalMbps', 'netInMbps', 'netOutMbps'],
  evalFunc: ['last', 'avg5m', 'min3m', 'max', 'diff', 'nodata60s'],
  operator: OPERADORES,
  threshold: 'n',
  unit: 's',
  severity: SEVERIDADES,
  useHysteresis: 'b',
  recoveryOperator: OPERADORES,
  recoveryThreshold: 'n',
  dependsOnTriggerId: 's?',
  expressionTemplate: 's',
  recoveryExpressionTemplate: 's',
  enabled: 'b',
  transitionCount: 'n',
  lastStateByHost: { rec: ['OK', 'PROBLEM', 'SUPPRESSED'] },
  antiPatternNote: 's~',
};

const VENTANA: Esquema = {
  id: 's',
  name: 's',
  targetType: ['hosts', 'group'],
  hostIds: { arr: 's' },
  hostGroup: { nul: GRUPOS },
  mode: ['with_data', 'no_data'],
  status: ['active', 'scheduled', 'completed'],
  reason: 's',
  startedAt: 'n',
  durationMin: 'n',
  suppressAlerts: 'b',
};

const esObjeto = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

// Array.isArray no estrecha listas readonly en TypeScript: guarda de tipo explícita
const esListaCerrada = (r: Regla): r is readonly string[] => Array.isArray(r);

function cumple(v: unknown, r: Regla): boolean {
  if (r === 'n') return typeof v === 'number' && Number.isFinite(v);
  if (r === 's') return typeof v === 'string';
  if (r === 'b') return typeof v === 'boolean';
  if (r === 'n?') return v === null || (typeof v === 'number' && Number.isFinite(v));
  if (r === 's?') return v === null || typeof v === 'string';
  if (r === 'n~') return v === undefined || (typeof v === 'number' && Number.isFinite(v));
  if (r === 's~') return v === undefined || typeof v === 'string';
  if (r === 'b~') return v === undefined || typeof v === 'boolean';
  if (esListaCerrada(r)) return typeof v === 'string' && r.includes(v);
  if ('opt' in r) return v === undefined || (typeof v === 'string' && r.opt.includes(v));
  if ('nul' in r) return v === null || (typeof v === 'string' && r.nul.includes(v));
  if ('arr' in r) return Array.isArray(v) && v.every((x) => cumple(x, r.arr));
  if ('rec' in r) return esObjeto(v) && Object.values(v).every((x) => cumple(x, r.rec));
  return esObjeto(v) && Object.entries(r.obj).every(([k, regla]) => cumple(v[k], regla));
}

/** Elementos válidos de una lista guardada (sin ids repetidos). */
function lista<T>(v: unknown, esquema: Esquema, max: number): T[] | null {
  if (!Array.isArray(v)) return null;
  const vistos = new Set<string>();
  const out: T[] = [];
  for (const x of v) {
    if (!cumple(x, { obj: esquema })) continue;
    const id = (x as { id: string }).id;
    if (vistos.has(id)) continue;
    vistos.add(id);
    out.push(x as T);
    if (out.length >= max) break;
  }
  return out;
}

const PESTANAS = ['dashboard', 'inventory', 'mib_explorer', 'triggers', 'problems', 'maintenance', 'lab_mode'] as const;

/**
 * Devuelve el estado guardado ya validado sobre `base`, o `null` si no hay nada aprovechable.
 * Las misiones solo conservan si estaban completadas; su texto y su bandera salen siempre del código.
 */
export function sanitizeSavedState(parsed: unknown, base: AppState): AppState | null {
  if (!esObjeto(parsed)) return null;
  const hosts = lista<AppState['hosts'][number]>(parsed.hosts, HOST, 64);
  const triggers = lista<AppState['triggers'][number]>(parsed.triggers, TRIGGER, 128);
  if (!hosts || hosts.length === 0 || !triggers) return null;

  const num = (v: unknown, def: number, min = -Infinity, max = Infinity) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def;

  const guardadas = new Map(
    (Array.isArray(parsed.challenges) ? parsed.challenges : [])
      .filter(esObjeto)
      .map((c) => [c.id, c] as const)
  );
  const challenges = base.challenges.map((ch) => ({ ...ch, completed: guardadas.get(ch.id)?.completed === true }));

  const lp = esObjeto(parsed.labProgress) ? parsed.labProgress : {};
  const progreso: Record<string, unknown> = { ...base.labProgress };
  for (const [k, def] of Object.entries(base.labProgress)) {
    const v = lp[k];
    if (k === 'mission5StartedAt') {
      progreso[k] = v === null || (typeof v === 'number' && Number.isFinite(v)) ? v : def;
    } else if (typeof def === 'number') {
      progreso[k] = num(v, def, 0);
    } else if (typeof def === 'boolean') {
      progreso[k] = typeof v === 'boolean' ? v : def;
    }
  }
  const labProgress = progreso as unknown as LabProgress;

  return {
    ...base,
    activeTab: typeof parsed.activeTab === 'string' && (PESTANAS as readonly string[]).includes(parsed.activeTab)
      ? (parsed.activeTab as AppState['activeTab'])
      : base.activeTab,
    simulationSpeed: [0, 1, 2, 5].includes(parsed.simulationSpeed as number)
      ? (parsed.simulationSpeed as AppState['simulationSpeed'])
      : base.simulationSpeed,
    tickCount: Math.round(num(parsed.tickCount, base.tickCount, 0)),
    lastTickAt: num(parsed.lastTickAt, base.lastTickAt, 0),
    shiftStartedAt: num(parsed.shiftStartedAt, base.shiftStartedAt, 0),
    chaosCount: Math.round(num(parsed.chaosCount, base.chaosCount, 0)),
    slaScore: num(parsed.slaScore, base.slaScore, 0, 100),
    nocXp: Math.round(num(parsed.nocXp, base.nocXp, 0)),
    wanFlapSimulation: typeof parsed.wanFlapSimulation === 'boolean' ? parsed.wanFlapSimulation : base.wanFlapSimulation,
    selectedHostId: null,
    hosts,
    triggers,
    problems: lista(parsed.problems, PROBLEMA, 80) ?? base.problems,
    telemetryFeed: lista(parsed.telemetryFeed, EVENTO, 60) ?? base.telemetryFeed,
    trapLog: lista(parsed.trapLog, TRAP, 60) ?? base.trapLog,
    maintenanceWindows: lista(parsed.maintenanceWindows, VENTANA, 50) ?? base.maintenanceWindows,
    challenges,
    labProgress,
  };
}
