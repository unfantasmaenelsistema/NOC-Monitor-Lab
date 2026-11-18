import {
  AppState,
  Host,
  HostBaseline,
  HostSnmpMeta,
  LabChallenge,
  MetricHistoryPoint,
  SeverityLevel,
  TelemetryEvent,
  TriggerEvalFunc,
  TriggerMetric,
  TriggerOperator,
  TriggerRule,
} from '../types/noc';

export interface SeverityMeta {
  key: SeverityLevel;
  label: string;
  color: string;
  textColor: string;
  order: number;
}

// Official Zabbix Severity Color Palette
export const ZABBIX_SEVERITIES: SeverityMeta[] = [
  {
    key: 'not_classified',
    label: 'Not classified',
    color: '#97AAB3',
    textColor: '#0b0f19',
    order: 0,
  },
  {
    key: 'information',
    label: 'Information',
    color: '#7499FF',
    textColor: '#0b0f19',
    order: 1,
  },
  {
    key: 'warning',
    label: 'Warning',
    color: '#FFC859',
    textColor: '#0b0f19',
    order: 2,
  },
  {
    key: 'average',
    label: 'Average',
    color: '#FFA059',
    textColor: '#0b0f19',
    order: 3,
  },
  {
    key: 'high',
    label: 'High',
    color: '#E97659',
    textColor: '#0b0f19',
    order: 4,
  },
  {
    key: 'disaster',
    label: 'Disaster',
    color: '#E45959',
    textColor: '#0b0f19',
    order: 5,
  },
];

export const SEVERITY_MAP: Record<SeverityLevel, SeverityMeta> = ZABBIX_SEVERITIES.reduce(
  (acc, item) => {
    acc[item.key] = item;
    return acc;
  },
  {} as Record<SeverityLevel, SeverityMeta>
);

function buildInitialHistory(baseline: HostBaseline, now: number, points = 32): MetricHistoryPoint[] {
  const history: MetricHistoryPoint[] = [];
  for (let i = points - 1; i >= 0; i--) {
    const wave = Math.sin(i * 0.45) * 3.5 + Math.cos(i * 0.22) * 2.1;
    const jitter = ((i * 17) % 7) - 3;
    const cpu = Math.max(2, Math.min(95, Number((baseline.cpu + wave + jitter * 0.6).toFixed(1))));
    const ramPct = Math.max(10, Math.min(95, Number((baseline.ramPct + wave * 0.35).toFixed(1))));
    const netInMbps = Math.max(
      1,
      Number((baseline.netInMbps + wave * (baseline.netInMbps * 0.04) + jitter * 1.2).toFixed(1))
    );
    const netOutMbps = Math.max(
      1,
      Number((baseline.netOutMbps + wave * (baseline.netOutMbps * 0.04) + jitter * 0.9).toFixed(1))
    );
    const latencyMs = Math.max(0.4, Number((baseline.latencyMs + Math.abs(jitter) * 0.18).toFixed(2)));
    history.push({
      ts: now - i * 2000,
      cpu,
      ramPct,
      diskPct: baseline.diskPct,
      netInMbps,
      netOutMbps,
      latencyMs,
      packetLossPct: 0,
    });
  }
  return history;
}

const DEFAULT_SNMP_META: Omit<HostSnmpMeta, 'sysLocation' | 'sysObjectID'> = {
  communityRo: 'public',
  communityRw: 'private',
  v3User: 'nocadmin',
  v3AuthPass: 'NocAuth#2026',
  v3PrivKey: 'NocPriv#2026',
  sysContact: 'noc@unfantasmaenelsistema.com',
};

function createHost(
  params: Omit<
    Host,
    'history' | 'lastPassivePollAt' | 'lastActivePushAt' | 'activeAnomaly' | 'snmpMeta' | 'customSnmpItems'
  > & {
    hasActivePush?: boolean;
    sysLocation: string;
    sysObjectID: string;
  },
  now: number
): Host {
  const history = buildInitialHistory(params.baseline, now);
  const last = history[history.length - 1];
  const { sysLocation, sysObjectID, hasActivePush: _unused, ...rest } = params;
  return {
    ...rest,
    activeAnomaly: null,
    lastPassivePollAt: now - 1500,
    lastActivePushAt: params.hasActivePush ? now - 900 : null,
    snmpMeta: {
      ...DEFAULT_SNMP_META,
      sysLocation,
      sysObjectID,
    },
    customSnmpItems: [],
    metrics: {
      ...params.metrics,
      cpu: last.cpu,
      ramPct: last.ramPct,
      ramUsedGb: Number(((params.metrics.ramTotalGb * last.ramPct) / 100).toFixed(1)),
      netInMbps: last.netInMbps,
      netOutMbps: last.netOutMbps,
      icmpLatencyMs: last.latencyMs,
      packetLossPct: 0,
    },
    history,
  };
}

export function createInitialHosts(now = Date.now()): Host[] {
  return [
    createHost(
      {
        id: 'rtr-borde-isp',
        hostname: 'RTR-BORDE-ISP',
        ip: '172.16.0.1',
        role: 'Router BGP de salida WAN',
        vendorOs: 'Cisco IOS-XE 17.9',
        group: 'Networking',
        checkMode: 'passive',
        pollingIntervalSec: 10,
        status: 'UP',
        parentId: null,
        sysLocation: 'CPD-Rack-A1 (Demarcación WAN)',
        sysObjectID: '.1.3.6.1.4.1.9.1.2494',
        interfaces: [
          {
            protocol: 'SNMP',
            label: 'SNMPv3 (authPriv)',
            port: 161,
            availability: 'available',
            checkMode: 'passive',
            detail: 'Polling OIDs BGP & IF-MIB',
          },
          {
            protocol: 'ICMP',
            label: 'ICMP Echo',
            port: 0,
            availability: 'available',
            checkMode: 'passive',
            detail: 'RTT Gateway ISP',
          },
        ],
        baseline: {
          cpu: 24,
          ramPct: 41,
          diskPct: 28,
          netInMbps: 420,
          netOutMbps: 315,
          latencyMs: 6.4,
        },
        metrics: {
          cpu: 24,
          ramUsedGb: 3.3,
          ramTotalGb: 8,
          ramPct: 41,
          diskPct: 28,
          diskUsedTb: 0.03,
          diskTotalTb: 0.1,
          netInterface: 'gi0/0/0',
          netInMbps: 420,
          netOutMbps: 315,
          icmpLatencyMs: 6.4,
          packetLossPct: 0,
          sysUpTimeSec: 8421540,
        },
      },
      now
    ),
    createHost(
      {
        id: 'fw-perimetral-01',
        hostname: 'FW-PERIMETRAL-01',
        ip: '10.0.0.1',
        role: 'Firewall Perimetral IPS/VPN',
        vendorOs: 'FortiOS 7.4 / pfSense',
        group: 'Seguridad',
        checkMode: 'mixed',
        pollingIntervalSec: 10,
        hasActivePush: true,
        status: 'UP',
        parentId: 'rtr-borde-isp',
        sysLocation: 'CPD-Rack-A1 (Perímetro DMZ)',
        sysObjectID: '.1.3.6.1.4.1.12356.101.1.2004',
        interfaces: [
          {
            protocol: 'SNMP',
            label: 'SNMPv3 + Traps',
            port: 161,
            availability: 'available',
            checkMode: 'passive',
            detail: 'Sesiones activas & CPU',
          },
          {
            protocol: 'ICMP',
            label: 'ICMP Echo',
            port: 0,
            availability: 'available',
            checkMode: 'passive',
            detail: 'Latencia interfaz DMZ/LAN',
          },
        ],
        baseline: {
          cpu: 32,
          ramPct: 54,
          diskPct: 36,
          netInMbps: 385,
          netOutMbps: 290,
          latencyMs: 1.8,
        },
        metrics: {
          cpu: 32,
          ramUsedGb: 8.6,
          ramTotalGb: 16,
          ramPct: 54,
          diskPct: 36,
          diskUsedTb: 0.09,
          diskTotalTb: 0.25,
          netInterface: 'wan1',
          netInMbps: 385,
          netOutMbps: 290,
          icmpLatencyMs: 1.8,
          packetLossPct: 0,
          sysUpTimeSec: 5194210,
        },
      },
      now
    ),
    createHost(
      {
        id: 'sw-core-01',
        hostname: 'SW-CORE-01',
        ip: '10.0.1.2',
        role: 'Switch Capa 3 Distribución',
        vendorOs: 'Cisco Catalyst C9300',
        group: 'Networking',
        checkMode: 'passive',
        pollingIntervalSec: 10,
        status: 'UP',
        parentId: 'fw-perimetral-01',
        sysLocation: 'CPD-Rack-A2 (Core Switch)',
        sysObjectID: '.1.3.6.1.4.1.9.1.2506',
        interfaces: [
          {
            protocol: 'SNMP',
            label: 'SNMPv2c',
            port: 161,
            availability: 'available',
            checkMode: 'passive',
            detail: 'IF-MIB gi0/1..gi0/48',
          },
          {
            protocol: 'ICMP',
            label: 'ICMP Echo',
            port: 0,
            availability: 'available',
            checkMode: 'passive',
            detail: 'Control plane RTT',
          },
        ],
        baseline: {
          cpu: 18,
          ramPct: 37,
          diskPct: 22,
          netInMbps: 610,
          netOutMbps: 580,
          latencyMs: 0.9,
        },
        metrics: {
          cpu: 18,
          ramUsedGb: 3.0,
          ramTotalGb: 8,
          ramPct: 37,
          diskPct: 22,
          diskUsedTb: 0.02,
          diskTotalTb: 0.1,
          netInterface: 'gi0/1',
          netInMbps: 610,
          netOutMbps: 580,
          icmpLatencyMs: 0.9,
          packetLossPct: 0,
          sysUpTimeSec: 12490300,
        },
      },
      now
    ),
    createHost(
      {
        id: 'srv-ad-dc01',
        hostname: 'SRV-AD-DC01',
        ip: '10.0.10.10',
        role: 'Domain Controller & DNS',
        vendorOs: 'Windows Server 2022',
        group: 'Servidores',
        checkMode: 'mixed',
        pollingIntervalSec: 15,
        hasActivePush: true,
        status: 'UP',
        parentId: 'sw-core-01',
        sysLocation: 'CPD-Rack-B1 (Hypervisor VLAN10)',
        sysObjectID: '.1.3.6.1.4.1.311.1.1.3.1.2',
        interfaces: [
          {
            protocol: 'ZBX',
            label: 'ZBX Pasivo/Activo',
            port: 10050,
            availability: 'available',
            checkMode: 'active',
            detail: 'Win32 EventLog & AD',
          },
          {
            protocol: 'SNMP',
            label: 'SNMPv2c',
            port: 161,
            availability: 'available',
            checkMode: 'passive',
            detail: 'HOST-RESOURCES-MIB',
          },
          {
            protocol: 'ICMP',
            label: 'ICMP Echo',
            port: 0,
            availability: 'available',
            checkMode: 'passive',
            detail: 'Reachability LAN',
          },
        ],
        baseline: {
          cpu: 28,
          ramPct: 62,
          diskPct: 58,
          netInMbps: 95,
          netOutMbps: 84,
          latencyMs: 1.1,
        },
        metrics: {
          cpu: 28,
          ramUsedGb: 19.8,
          ramTotalGb: 32,
          ramPct: 62,
          diskPct: 58,
          diskUsedTb: 0.58,
          diskTotalTb: 1.0,
          netInterface: 'eth0',
          netInMbps: 95,
          netOutMbps: 84,
          icmpLatencyMs: 1.1,
          packetLossPct: 0,
          sysUpTimeSec: 3810200,
        },
      },
      now
    ),
    createHost(
      {
        id: 'srv-db-prod',
        hostname: 'SRV-DB-PROD',
        ip: '10.0.10.20',
        role: 'PostgreSQL 16 HA Cluster',
        vendorOs: 'Ubuntu 24.04 LTS',
        group: 'Servidores',
        checkMode: 'active',
        pollingIntervalSec: 10,
        hasActivePush: true,
        status: 'UP',
        parentId: 'sw-core-01',
        sysLocation: 'CPD-Rack-B2 (VLAN DB)',
        sysObjectID: '.1.3.6.1.4.1.8072.3.2.10',
        interfaces: [
          {
            protocol: 'ZBX',
            label: 'ZBX Agent Activo',
            port: 10051,
            availability: 'available',
            checkMode: 'active',
            detail: 'Push cada 4s al NOC',
          },
          {
            protocol: 'ICMP',
            label: 'ICMP Echo',
            port: 0,
            availability: 'available',
            checkMode: 'passive',
            detail: 'Heartbeat VLAN DB',
          },
        ],
        baseline: {
          cpu: 44,
          ramPct: 74,
          diskPct: 68,
          netInMbps: 175,
          netOutMbps: 220,
          latencyMs: 0.7,
        },
        metrics: {
          cpu: 44,
          ramUsedGb: 47.4,
          ramTotalGb: 64,
          ramPct: 74,
          diskPct: 68,
          diskUsedTb: 2.72,
          diskTotalTb: 4.0,
          netInterface: 'eth0',
          netInMbps: 175,
          netOutMbps: 220,
          icmpLatencyMs: 0.7,
          packetLossPct: 0,
          sysUpTimeSec: 6912800,
        },
      },
      now
    ),
    createHost(
      {
        id: 'srv-web-front',
        hostname: 'SRV-WEB-FRONT',
        ip: '10.0.20.15',
        role: 'Nginx Reverse Proxy TLS',
        vendorOs: 'Debian 12 Bookworm',
        group: 'Servidores',
        checkMode: 'mixed',
        pollingIntervalSec: 12,
        hasActivePush: true,
        status: 'UP',
        parentId: 'sw-core-01',
        sysLocation: 'CPD-Rack-B3 (DMZ Web)',
        sysObjectID: '.1.3.6.1.4.1.8072.3.2.10',
        interfaces: [
          {
            protocol: 'ZBX',
            label: 'ZBX Agent',
            port: 10050,
            availability: 'available',
            checkMode: 'passive',
            detail: 'CPU, Load, Nginx stubs',
          },
          {
            protocol: 'HTTP',
            label: 'HTTP Check :443',
            port: 443,
            availability: 'available',
            checkMode: 'passive',
            detail: 'GET /healthz 200 OK',
          },
          {
            protocol: 'ICMP',
            label: 'ICMP Echo',
            port: 0,
            availability: 'available',
            checkMode: 'passive',
            detail: 'DMZ Reachability',
          },
        ],
        baseline: {
          cpu: 35,
          ramPct: 48,
          diskPct: 41,
          netInMbps: 265,
          netOutMbps: 340,
          latencyMs: 1.4,
        },
        metrics: {
          cpu: 35,
          ramUsedGb: 7.7,
          ramTotalGb: 16,
          ramPct: 48,
          diskPct: 41,
          diskUsedTb: 0.21,
          diskTotalTb: 0.5,
          netInterface: 'eth0',
          netInMbps: 265,
          netOutMbps: 340,
          icmpLatencyMs: 1.4,
          packetLossPct: 0,
          sysUpTimeSec: 2150400,
        },
      },
      now
    ),
    createHost(
      {
        id: 'nas-backup-01',
        hostname: 'NAS-BACKUP-01',
        ip: '10.0.30.50',
        role: 'Almacenamiento Backups iSCSI',
        vendorOs: 'Synology DSM 7.2',
        group: 'Almacenamiento',
        checkMode: 'passive',
        pollingIntervalSec: 20,
        status: 'UP',
        parentId: 'sw-core-01',
        sysLocation: 'CPD-Rack-C1 (Storage SAN)',
        sysObjectID: '.1.3.6.1.4.1.6574.1',
        interfaces: [
          {
            protocol: 'SNMP',
            label: 'SNMPv2c',
            port: 161,
            availability: 'available',
            checkMode: 'passive',
            detail: 'SYNOLOGY-DISK-MIB & RAID',
          },
          {
            protocol: 'ICMP',
            label: 'ICMP Echo',
            port: 0,
            availability: 'available',
            checkMode: 'passive',
            detail: 'Storage VLAN',
          },
        ],
        baseline: {
          cpu: 21,
          ramPct: 58,
          diskPct: 79,
          netInMbps: 310,
          netOutMbps: 88,
          latencyMs: 1.6,
        },
        metrics: {
          cpu: 21,
          ramUsedGb: 18.6,
          ramTotalGb: 32,
          ramPct: 58,
          diskPct: 79,
          diskUsedTb: 37.9,
          diskTotalTb: 48.0,
          netInterface: 'bond0',
          netInMbps: 310,
          netOutMbps: 88,
          icmpLatencyMs: 1.6,
          packetLossPct: 0,
          sysUpTimeSec: 15811200,
        },
      },
      now
    ),
    createHost(
      {
        id: 'ap-planta1-wifi',
        hostname: 'AP-PLANTA1-WIFI',
        ip: '10.0.40.10',
        role: 'Punto de Acceso Wi-Fi 6E',
        vendorOs: 'Aruba InstantOS 8.11',
        group: 'Networking',
        checkMode: 'passive',
        pollingIntervalSec: 15,
        status: 'UP',
        parentId: 'sw-core-01',
        sysLocation: 'Oficina Planta 1 - Techo Ala Norte',
        sysObjectID: '.1.3.6.1.4.1.14823.1.2.111',
        interfaces: [
          {
            protocol: 'ICMP',
            label: 'ICMP Echo',
            port: 0,
            availability: 'available',
            checkMode: 'passive',
            detail: 'Disponibilidad PoE+',
          },
          {
            protocol: 'SNMP',
            label: 'SNMPv2c',
            port: 161,
            availability: 'available',
            checkMode: 'passive',
            detail: 'Clientes SSID & Canal RF',
          },
        ],
        baseline: {
          cpu: 19,
          ramPct: 42,
          diskPct: 18,
          netInMbps: 72,
          netOutMbps: 118,
          latencyMs: 2.9,
        },
        metrics: {
          cpu: 19,
          ramUsedGb: 0.8,
          ramTotalGb: 2,
          ramPct: 42,
          diskPct: 18,
          diskUsedTb: 0.01,
          diskTotalTb: 0.05,
          netInterface: 'eth0',
          netInMbps: 72,
          netOutMbps: 118,
          icmpLatencyMs: 2.9,
          packetLossPct: 0,
          sysUpTimeSec: 4201900,
        },
      },
      now
    ),
  ];
}

const METRIC_KEY_MAP: Record<TriggerMetric, string> = {
  cpu: 'system.cpu.util',
  ramPct: 'vm.memory.util',
  diskPct: 'vfs.fs.size[/,pused]',
  packetLossPct: 'icmppingloss',
  icmpLatencyMs: 'icmppingsec',
  netTotalMbps: 'net.if.total[if0]',
  netInMbps: 'net.if.in[if0]',
  netOutMbps: 'net.if.out[if0]',
};

export function buildTriggerExpressions(params: {
  hostnameLabel: string;
  metric: TriggerMetric;
  evalFunc: TriggerEvalFunc;
  operator: TriggerOperator;
  threshold: number;
  useHysteresis: boolean;
  recoveryOperator: TriggerOperator;
  recoveryThreshold: number;
}): { problemExpr: string; recoveryExpr: string } {
  const key = METRIC_KEY_MAP[params.metric];
  const host = params.hostnameLabel;
  let fnCall = `last(/${host}/${key})`;
  switch (params.evalFunc) {
    case 'avg5m':
      fnCall = `avg(/${host}/${key},5m)`;
      break;
    case 'min3m':
      fnCall = `min(/${host}/${key},3m)`;
      break;
    case 'max':
      fnCall = `max(/${host}/${key},3m)`;
      break;
    case 'diff':
      fnCall = `change(/${host}/${key})`;
      break;
    case 'nodata60s':
      fnCall = `nodata(/${host}/${key},60s)=1`;
      break;
    default:
      fnCall = `last(/${host}/${key})`;
      break;
  }
  const problemExpr =
    params.evalFunc === 'nodata60s'
      ? fnCall
      : `${fnCall}${params.operator}${params.threshold}`;
  const recoveryExpr = params.useHysteresis
    ? `${fnCall}${params.recoveryOperator}${params.recoveryThreshold}`
    : '— (Sin histéresis)';
  return { problemExpr, recoveryExpr };
}

export const INITIAL_TRIGGERS: TriggerRule[] = [
  // 1. Disponibilidad raíz (Switch Core - Padre de dependencias)
  {
    id: 'trg-sw-core-icmp',
    name: 'SW-CORE-01 inalcanzable por ICMP',
    hostId: 'sw-core-01',
    category: 'Disponibilidad',
    metric: 'packetLossPct',
    evalFunc: 'min3m',
    operator: '>=',
    threshold: 90,
    unit: '%',
    severity: 'disaster',
    useHysteresis: true,
    recoveryOperator: '<',
    recoveryThreshold: 20,
    dependsOnTriggerId: null,
    expressionTemplate: 'min(/SW-CORE-01/icmppingloss,3m)>=90',
    recoveryExpressionTemplate: 'min(/SW-CORE-01/icmppingloss,3m)<20',
    enabled: true,
    transitionCount: 0,
    lastStateByHost: {},
  },
  // 2. Disponibilidad general ICMP con dependencia de SW-CORE-01
  {
    id: 'trg-loss-disaster',
    name: 'Host inalcanzable / Pérdida total ICMP (100%)',
    hostId: 'ALL',
    category: 'Disponibilidad',
    metric: 'packetLossPct',
    evalFunc: 'max',
    operator: '>=',
    threshold: 90,
    unit: '%',
    severity: 'disaster',
    useHysteresis: true,
    recoveryOperator: '<',
    recoveryThreshold: 10,
    dependsOnTriggerId: 'trg-sw-core-icmp',
    expressionTemplate: 'max(/HOST/icmppingloss,3m)>=90',
    recoveryExpressionTemplate: 'max(/HOST/icmppingloss,3m)<10',
    enabled: true,
    transitionCount: 0,
    lastStateByHost: {},
  },
  // 3. Caso 1 Falso Positivo (last() sobre picos SQL de 1s)
  {
    id: 'trg-fp-db-cpu-last',
    name: '[Falso Positivo] Pico puntual 1s CPU en SRV-DB-PROD',
    hostId: 'srv-db-prod',
    category: 'Falso Positivo / Lab',
    metric: 'cpu',
    evalFunc: 'last',
    operator: '>',
    threshold: 85,
    unit: '%',
    severity: 'high',
    useHysteresis: false,
    recoveryOperator: '<',
    recoveryThreshold: 70,
    dependsOnTriggerId: 'trg-sw-core-icmp',
    expressionTemplate: 'last(/SRV-DB-PROD/system.cpu.util)>85',
    recoveryExpressionTemplate: '— (Sin histéresis)',
    enabled: true,
    transitionCount: 0,
    lastStateByHost: {},
    antiPatternNote:
      'Usa last() en lugar de avg(5m). Cualquier micro-pico SQL de 1 segundo dispara una alarma High y se resuelve al segundo siguiente.',
  },
  // 4. Caso 2 Falso Positivo (Tráfico nocturno normal de backups NAS)
  {
    id: 'trg-fp-nas-backup-net',
    name: '[Falso Positivo] Tráfico backup en NAS-BACKUP-01 (> 315 Mbps)',
    hostId: 'nas-backup-01',
    category: 'Falso Positivo / Lab',
    metric: 'netInMbps',
    evalFunc: 'last',
    operator: '>',
    threshold: 315,
    unit: 'Mbps',
    severity: 'warning',
    useHysteresis: false,
    recoveryOperator: '<',
    recoveryThreshold: 260,
    dependsOnTriggerId: 'trg-sw-core-icmp',
    expressionTemplate: 'last(/NAS-BACKUP-01/net.if.in[bond0])>315',
    recoveryExpressionTemplate: '— (Sin histéresis)',
    enabled: true,
    transitionCount: 0,
    lastStateByHost: {},
    antiPatternNote:
      'Umbral demasiado cercano al tráfico nominal de copias iSCSI (310 Mbps). En producción requiere ventana horaria o umbral > 650 Mbps.',
  },
  // 5. Caso 3 Flapping (Oscilación WAN 99-101ms sin histéresis)
  {
    id: 'trg-flap-wan-latency',
    name: '[Flapping] Latencia WAN RTR-BORDE-ISP (> 100ms rígido)',
    hostId: 'rtr-borde-isp',
    category: 'Falso Positivo / Lab',
    metric: 'icmpLatencyMs',
    evalFunc: 'last',
    operator: '>',
    threshold: 100,
    unit: 'ms',
    severity: 'average',
    useHysteresis: false,
    recoveryOperator: '<',
    recoveryThreshold: 85,
    dependsOnTriggerId: null,
    expressionTemplate: 'last(/RTR-BORDE-ISP/icmppingsec)>100',
    recoveryExpressionTemplate: '— (Sin histéresis)',
    enabled: true,
    transitionCount: 0,
    lastStateByHost: {},
    antiPatternNote:
      'La latencia oscila entre 99 ms y 101 ms alrededor del umbral sin histéresis ni avg(5m), generando flapping constante OK ↔ PROBLEM.',
  },
  // 6. CPU Crítico bien diseñado (avg 5m + histéresis)
  {
    id: 'trg-cpu-high-avg',
    name: 'Uso de CPU sostenido crítico (avg 5m > 85%)',
    hostId: 'ALL',
    category: 'CPU',
    metric: 'cpu',
    evalFunc: 'avg5m',
    operator: '>',
    threshold: 85,
    unit: '%',
    severity: 'high',
    useHysteresis: true,
    recoveryOperator: '<',
    recoveryThreshold: 70,
    dependsOnTriggerId: 'trg-sw-core-icmp',
    expressionTemplate: 'avg(/HOST/system.cpu.util,5m)>85',
    recoveryExpressionTemplate: 'avg(/HOST/system.cpu.util,5m)<70',
    enabled: true,
    transitionCount: 0,
    lastStateByHost: {},
  },
  // 7. RAM Alta con histéresis y dependencia
  {
    id: 'trg-ram-high',
    name: 'Memoria RAM física crítica (> 88%)',
    hostId: 'ALL',
    category: 'Memoria',
    metric: 'ramPct',
    evalFunc: 'avg5m',
    operator: '>',
    threshold: 88,
    unit: '%',
    severity: 'average',
    useHysteresis: true,
    recoveryOperator: '<',
    recoveryThreshold: 80,
    dependsOnTriggerId: 'trg-sw-core-icmp',
    expressionTemplate: 'avg(/HOST/vm.memory.util,5m)>88',
    recoveryExpressionTemplate: 'avg(/HOST/vm.memory.util,5m)<80',
    enabled: true,
    transitionCount: 0,
    lastStateByHost: {},
  },
  // 8. Disco Crítico en Servidores y NAS
  {
    id: 'trg-disk-crit',
    name: 'Espacio en disco crítico (>= 90%)',
    hostId: 'ALL',
    category: 'Disco',
    metric: 'diskPct',
    evalFunc: 'last',
    operator: '>=',
    threshold: 90,
    unit: '%',
    severity: 'high',
    useHysteresis: true,
    recoveryOperator: '<',
    recoveryThreshold: 85,
    dependsOnTriggerId: null,
    expressionTemplate: 'last(/HOST/vfs.fs.size[/,pused])>=90',
    recoveryExpressionTemplate: 'last(/HOST/vfs.fs.size[/,pused])<85',
    enabled: true,
    transitionCount: 0,
    lastStateByHost: {},
  },
  // 9. Pérdida parcial de paquetes ICMP
  {
    id: 'trg-loss-warn',
    name: 'Pérdida parcial de paquetes ICMP (> 5%)',
    hostId: 'ALL',
    category: 'Red',
    metric: 'packetLossPct',
    evalFunc: 'avg5m',
    operator: '>',
    threshold: 5,
    unit: '%',
    severity: 'average',
    useHysteresis: true,
    recoveryOperator: '<',
    recoveryThreshold: 1,
    dependsOnTriggerId: 'trg-sw-core-icmp',
    expressionTemplate: 'avg(/HOST/icmppingloss,5m)>5',
    recoveryExpressionTemplate: 'avg(/HOST/icmppingloss,5m)<1',
    enabled: true,
    transitionCount: 0,
    lastStateByHost: {},
  },
  // 10. Saturación de enlace en Firewall Perimetral
  {
    id: 'trg-fw-net-sat',
    name: 'Saturación enlace WAN en FW-PERIMETRAL-01 (> 880 Mbps)',
    hostId: 'fw-perimetral-01',
    category: 'Red',
    metric: 'netTotalMbps',
    evalFunc: 'avg5m',
    operator: '>',
    threshold: 880,
    unit: 'Mbps',
    severity: 'high',
    useHysteresis: true,
    recoveryOperator: '<',
    recoveryThreshold: 760,
    dependsOnTriggerId: null,
    expressionTemplate: 'avg(/FW-PERIMETRAL-01/net.if.total[wan1],5m)>880',
    recoveryExpressionTemplate: 'avg(/FW-PERIMETRAL-01/net.if.total[wan1],5m)<760',
    enabled: true,
    transitionCount: 0,
    lastStateByHost: {},
  },
  // 11. Nodata en Agente Activo PostgreSQL
  {
    id: 'trg-db-nodata',
    name: 'Agente Zabbix Activo sin reporte en SRV-DB-PROD (nodata 60s)',
    hostId: 'srv-db-prod',
    category: 'Disponibilidad',
    metric: 'packetLossPct',
    evalFunc: 'nodata60s',
    operator: '>=',
    threshold: 1,
    unit: 's',
    severity: 'high',
    useHysteresis: false,
    recoveryOperator: '<',
    recoveryThreshold: 1,
    dependsOnTriggerId: 'trg-sw-core-icmp',
    expressionTemplate: 'nodata(/SRV-DB-PROD/agent.ping,60s)=1',
    recoveryExpressionTemplate: '— (Auto-recupera al recibir datos)',
    enabled: true,
    transitionCount: 0,
    lastStateByHost: {},
  },
  // 12. Cambio brusco de tráfico en Web Proxy (diff)
  {
    id: 'trg-web-spike-diff',
    name: 'Salto súbito de tráfico en SRV-WEB-FRONT (diff > 220 Mbps)',
    hostId: 'srv-web-front',
    category: 'Red',
    metric: 'netTotalMbps',
    evalFunc: 'diff',
    operator: '>',
    threshold: 220,
    unit: 'Mbps',
    severity: 'information',
    useHysteresis: false,
    recoveryOperator: '<',
    recoveryThreshold: 100,
    dependsOnTriggerId: 'trg-sw-core-icmp',
    expressionTemplate: 'change(/SRV-WEB-FRONT/net.if.total[eth0])>220',
    recoveryExpressionTemplate: '— (Informativo por cambio)',
    enabled: true,
    transitionCount: 0,
    lastStateByHost: {},
  },
];

export const INITIAL_CHALLENGES: LabChallenge[] = [
  {
    id: 'mission-1',
    title: 'Misión 1: Caza en la MIB',
    difficulty: 'Básico',
    xpReward: 150,
    flagCode: 'NOC{MIB_OID_HUNTER_FW1}',
    description:
      'Explora el árbol MIB ISO/IEC, diagnostica por qué un servidor con Zabbix Agent no responde a SNMP y extrae métricas empresariales del firewall perimetral.',
    objective:
      'Usa snmpwalk/snmpget en FW-PERIMETRAL-01, verifica el error SNMP en SRV-DB-PROD y registra en FW-PERIMETRAL-01 el ítem de sesiones activas (.1.3.6.1.4.1.12356.101.4.1.8.0) o sysUpTime.0.',
    hint: 'En Explorador MIB & SNMP, FW-PERIMETRAL-01 usa SNMPv3 (nocadmin / NocAuth#2026 / NocPriv#2026) o comunidad public en v2c para lectura.',
    targetHostId: 'fw-perimetral-01',
    anomalyToInject: 'net_saturation',
    completed: false,
  },
  {
    id: 'mission-2',
    title: 'Misión 2: Domando el Falso Positivo',
    difficulty: 'Intermedio',
    xpReward: 200,
    flagCode: 'NOC{HYSTERESIS_AVG5M_TAMER}',
    description:
      'El NOC sufre fatiga de alertas por culpa del trigger de CPU puntual en SRV-DB-PROD y el flapping de latencia (99–101 ms) en RTR-BORDE-ISP.',
    objective:
      'Identifica y marca al menos una de esas alarmas como Falso Positivo en la Consola de Problemas y reconfigura ambos triggers con avg(5m) e Histéresis.',
    hint: 'Abre Consola de Problemas -> Triaje -> Marcar Falso Positivo, o usa el Motor de Triggers para corregir ambos antipatrones.',
    targetHostId: 'rtr-borde-isp',
    anomalyToInject: 'packet_loss',
    completed: false,
  },
  {
    id: 'mission-3',
    title: 'Misión 3: Trampa Nocturna (SNMP Trap & Correlación)',
    difficulty: 'Avanzado',
    xpReward: 250,
    flagCode: 'NOC{ROOT_CAUSE_SW_CORE_RCA}',
    description:
      'Un SNMP Trap linkDown anuncia el corte de enlace en SW-CORE-01, provocando alertas en cascada en servidores conectados detrás de ese switch.',
    objective:
      'Lanza el escenario de caída en SW-CORE-01, asegúrate de que las alertas hijas dependan de SW-CORE-01 (RCA) y documenta el Acknowledge con una nota técnica en su alarma raíz.',
    hint: 'Revisa que el trigger general de disponibilidad dependa de trg-sw-core-icmp y luego entra a Triaje en la alarma de SW-CORE-01 para guardar Ack + nota.',
    targetHostId: 'sw-core-01',
    anomalyToInject: 'host_down',
    completed: false,
  },
  {
    id: 'mission-4',
    title: 'Misión 4: Intervención sin Pánico (Ventana de Mantenimiento)',
    difficulty: 'Intermedio',
    xpReward: 250,
    flagCode: 'NOC{ZERO_PANIC_MAINT_100SLA}',
    description:
      'El equipo de sistemas necesita actualizar SRV-AD-DC01 y NAS-BACKUP-01 sin disparar alarmas ni degradar el SLA del turno.',
    objective:
      'Crea y activa una ventana de mantenimiento en modo "With data collection" que cubra a SRV-AD-DC01 y NAS-BACKUP-01, y ejecuta la actualización simulada con 0% de alertas no suprimidas.',
    hint: 'En Ventanas de Mantenimiento selecciona Hosts específicos (SRV-AD-DC01 y NAS-BACKUP-01), modo With data collection y estado Activo ahora.',
    targetHostId: 'srv-ad-dc01',
    anomalyToInject: 'cpu_spike',
    completed: false,
  },
  {
    id: 'mission-5',
    title: 'Misión 5: Turno de Guardia en Crisis (Contrarreloj)',
    difficulty: 'Experto',
    xpReward: 350,
    flagCode: 'NOC{INCIDENT_COMMANDER_GOLD}',
    description:
      'Escenario contrarreloj (180s): ataque de fuerza bruta SNMP (authenticationFailure) en el firewall, disco llenándose en SRV-DB-PROD y un falso positivo de backup como distracción.',
    objective:
      'En menos de 180s: 1) Reconoce (Ack) el Trap authenticationFailure en FW-PERIMETRAL-01, 2) Resuelve el disco crítico en SRV-DB-PROD y 3) Marca o corrige el falso positivo de NAS-BACKUP-01.',
    hint: 'Usa Consola de Problemas para el Ack del firewall, Triaje -> Restart Service / Recuperar para SRV-DB-PROD y Marcar Falso Positivo en NAS-BACKUP-01.',
    targetHostId: 'srv-db-prod',
    anomalyToInject: 'disk_critical',
    completed: false,
  },
];

export function createInitialTelemetryFeed(hosts: Host[], now = Date.now()): TelemetryEvent[] {
  const events: TelemetryEvent[] = [
    {
      id: 'ev-init-1',
      ts: now - 5200,
      hostId: 'fw-perimetral-01',
      hostname: 'FW-PERIMETRAL-01',
      direction: 'NOC → HOST',
      mechanism: 'Passive Polling',
      protocol: 'SNMP',
      itemKeyOrOid: '1.3.6.1.2.1.1.3.0 (sysUpTime)',
      summary: `SNMPv3 GET OK · wan1 ${hosts[1]?.metrics.netInMbps ?? 385} Mbps IN`,
      rttMs: 2,
      success: true,
    },
    {
      id: 'ev-init-2',
      ts: now - 3800,
      hostId: 'srv-db-prod',
      hostname: 'SRV-DB-PROD',
      direction: 'HOST → NOC',
      mechanism: 'Active Check',
      protocol: 'ZBX',
      itemKeyOrOid: 'system.cpu.util[,user]',
      summary: `Buffer activo enviado (12 ítems) · CPU ${hosts[4]?.metrics.cpu ?? 44}%`,
      rttMs: 1,
      success: true,
    },
    {
      id: 'ev-init-3',
      ts: now - 2100,
      hostId: 'sw-core-01',
      hostname: 'SW-CORE-01',
      direction: 'NOC → HOST',
      mechanism: 'Passive Polling',
      protocol: 'SNMP',
      itemKeyOrOid: '1.3.6.1.2.1.2.2.1.10.1 (ifInOctets)',
      summary: `SNMPv2c Poller · gi0/1 ${hosts[2]?.metrics.netInMbps ?? 610} Mbps`,
      rttMs: 1,
      success: true,
    },
    {
      id: 'ev-init-4',
      ts: now - 900,
      hostId: 'srv-ad-dc01',
      hostname: 'SRV-AD-DC01',
      direction: 'HOST → NOC',
      mechanism: 'Active Check',
      protocol: 'ZBX',
      itemKeyOrOid: 'eventlog[Security,,4624]',
      summary: 'ZBX Active push · Sin anomalías de autenticación',
      rttMs: 2,
      success: true,
    },
  ];
  return events;
}

export function createInitialAppState(): AppState {
  const now = Date.now();
  const hosts = createInitialHosts(now);
  return {
    activeTab: 'dashboard',
    simulationSpeed: 1,
    tickCount: 0,
    lastTickAt: now,
    shiftStartedAt: now,
    chaosCount: 0,
    slaScore: 100,
    nocXp: 0,
    wanFlapSimulation: true,
    selectedHostId: null,
    hosts,
    problems: [],
    telemetryFeed: createInitialTelemetryFeed(hosts, now),
    trapLog: [],
    triggers: INITIAL_TRIGGERS,
    maintenanceWindows: [],
    challenges: INITIAL_CHALLENGES,
    labProgress: {
      snmpQueriedFw: false,
      snmpDiagnosedDbFail: false,
      mission3Launched: false,
      mission4UpgradeSimulated: false,
      mission4UpgradeClean: false,
      mission5StartedAt: null,
      mission5TimeLimitSec: 180,
      mission5FinishedInTime: false,
    },
  };
}
