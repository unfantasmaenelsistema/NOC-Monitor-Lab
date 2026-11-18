export type NavSection =
  | 'dashboard'
  | 'inventory'
  | 'mib_explorer'
  | 'triggers'
  | 'problems'
  | 'maintenance'
  | 'lab_mode';

export type HostStatus = 'UP' | 'WARNING' | 'DOWN' | 'MAINTENANCE';

export type HostGroup = 'Seguridad' | 'Networking' | 'Servidores' | 'Almacenamiento';

export type InterfaceProtocol = 'ZBX' | 'SNMP' | 'ICMP' | 'HTTP';

export type InterfaceAvailability = 'available' | 'unavailable' | 'degraded' | 'disabled';

export type CheckMode = 'passive' | 'active' | 'mixed';

export type SimulationSpeed = 0 | 1 | 2 | 5;

export type SeverityLevel =
  | 'not_classified'
  | 'information'
  | 'warning'
  | 'average'
  | 'high'
  | 'disaster';

export type AnomalyKind =
  | 'cpu_spike'
  | 'memory_pressure'
  | 'net_saturation'
  | 'packet_loss'
  | 'host_down'
  | 'disk_critical';

export interface HostInterface {
  protocol: InterfaceProtocol;
  label: string; // e.g., "SNMPv3", "ZBX Pasivo/Activo", "ICMP Echo"
  port: number;
  availability: InterfaceAvailability;
  checkMode: 'passive' | 'active';
  detail: string;
}

export interface MetricHistoryPoint {
  ts: number;
  cpu: number;
  ramPct: number;
  diskPct: number;
  netInMbps: number;
  netOutMbps: number;
  latencyMs: number;
  packetLossPct: number;
}

export interface HostMetrics {
  cpu: number; // %
  ramUsedGb: number;
  ramTotalGb: number;
  ramPct: number; // %
  diskPct: number; // %
  diskUsedTb: number;
  diskTotalTb: number;
  netInterface: string; // e.g., "eth0", "gi0/1", "wan1"
  netInMbps: number;
  netOutMbps: number;
  icmpLatencyMs: number;
  packetLossPct: number;
  sysUpTimeSec: number;
}

export interface HostBaseline {
  cpu: number;
  ramPct: number;
  diskPct: number;
  netInMbps: number;
  netOutMbps: number;
  latencyMs: number;
}

export interface CustomSnmpItem {
  id: string;
  oid: string;
  name: string;
  dataType: string;
  unit: string;
  lastNumericValue: number;
  lastFormattedValue: string;
  lastPolledAt: number;
  history: number[];
}

export interface HostSnmpMeta {
  communityRo: string;
  communityRw: string;
  v3User: string;
  v3AuthPass: string;
  v3PrivKey: string;
  sysContact: string;
  sysLocation: string;
  sysObjectID: string;
}

export interface Host {
  id: string;
  hostname: string;
  ip: string;
  role: string;
  vendorOs: string;
  group: HostGroup;
  checkMode: CheckMode;
  pollingIntervalSec: number;
  lastPassivePollAt: number;
  lastActivePushAt: number | null;
  status: HostStatus;
  activeAnomaly: AnomalyKind | null;
  parentId: string | null; // For topology graph links
  interfaces: HostInterface[];
  metrics: HostMetrics;
  baseline: HostBaseline;
  history: MetricHistoryPoint[];
  snmpMeta: HostSnmpMeta;
  customSnmpItems: CustomSnmpItem[];
}

export interface ProblemNote {
  id: string;
  ts: number;
  author: string;
  text: string;
}

export interface AlarmProblem {
  id: string;
  hostId: string;
  hostname: string;
  hostIp: string;
  hostGroup: HostGroup;
  triggerId?: string;
  severity: SeverityLevel;
  title: string;
  expression: string;
  sourceCheck: 'Pasivo (Polling)' | 'Activo (Agente)' | 'SNMP Trap';
  startedAt: number;
  acknowledged: boolean;
  acknowledgedAt?: number;
  resolved: boolean;
  resolvedAt?: number;
  suppressedByDependency?: string;
  suppressedInMaintenance?: boolean;
  assignedOperator?: string;
  notes: ProblemNote[];
  markedFalsePositive?: boolean;
}

export interface TelemetryEvent {
  id: string;
  ts: number;
  hostId: string;
  hostname: string;
  direction: 'NOC → HOST' | 'HOST → NOC';
  mechanism: 'Passive Polling' | 'Active Check' | 'SNMP Trap' | 'Manual Execute';
  protocol: InterfaceProtocol;
  itemKeyOrOid: string;
  summary: string;
  rttMs: number;
  success: boolean;
}

export type TrapKind =
  | 'linkDown'
  | 'coldStart'
  | 'authenticationFailure'
  | 'psuRedundantDown'
  | 'fwSessionThreshold';

export interface SnmpTrapPacket {
  id: string;
  ts: number;
  hostId: string;
  hostname: string;
  sourceIp: string;
  trapKind: TrapKind;
  trapOid: string;
  severity: SeverityLevel;
  version: 'v2c' | 'v3';
  rawPdu: string;
  summary: string;
}

export type TriggerMetric =
  | 'cpu'
  | 'ramPct'
  | 'diskPct'
  | 'packetLossPct'
  | 'icmpLatencyMs'
  | 'netTotalMbps'
  | 'netInMbps'
  | 'netOutMbps';

export type TriggerEvalFunc = 'last' | 'avg5m' | 'min3m' | 'max' | 'diff' | 'nodata60s';
export type TriggerOperator = '>' | '>=' | '<' | '<=';
export type TriggerCategory =
  | 'CPU'
  | 'Memoria'
  | 'Disco'
  | 'Red'
  | 'Disponibilidad'
  | 'Falso Positivo / Lab';

export interface TriggerRule {
  id: string;
  name: string;
  hostId: string; // 'ALL' or specific host id
  category: TriggerCategory;
  metric: TriggerMetric;
  evalFunc: TriggerEvalFunc;
  operator: TriggerOperator;
  threshold: number;
  unit: string;
  severity: SeverityLevel;
  useHysteresis: boolean;
  recoveryOperator: TriggerOperator;
  recoveryThreshold: number;
  dependsOnTriggerId: string | null;
  expressionTemplate: string;
  recoveryExpressionTemplate: string;
  enabled: boolean;
  transitionCount: number;
  lastStateByHost: Record<string, 'OK' | 'PROBLEM' | 'SUPPRESSED'>;
  antiPatternNote?: string;
}

export type MaintenanceMode = 'with_data' | 'no_data';
export type MaintenanceStatus = 'active' | 'scheduled' | 'completed';

export interface MaintenanceWindow {
  id: string;
  name: string;
  targetType: 'hosts' | 'group';
  hostIds: string[];
  hostGroup: HostGroup | null;
  mode: MaintenanceMode;
  status: MaintenanceStatus;
  reason: string;
  startedAt: number;
  durationMin: number;
  suppressAlerts: boolean;
}

export interface LabChallenge {
  id: string;
  title: string;
  difficulty: 'Básico' | 'Intermedio' | 'Avanzado' | 'Experto';
  xpReward: number;
  flagCode: string;
  description: string;
  objective: string;
  hint: string;
  targetHostId: string;
  anomalyToInject: AnomalyKind;
  completed: boolean;
}

export interface LabProgress {
  snmpQueriedFw: boolean;
  snmpDiagnosedDbFail: boolean;
  mission3Launched: boolean;
  mission4UpgradeSimulated: boolean;
  mission4UpgradeClean: boolean;
  mission5StartedAt: number | null;
  mission5TimeLimitSec: number;
  mission5FinishedInTime: boolean;
}

export interface AppState {
  activeTab: NavSection;
  simulationSpeed: SimulationSpeed;
  tickCount: number;
  lastTickAt: number;
  shiftStartedAt: number;
  chaosCount: number;
  slaScore: number;
  nocXp: number;
  wanFlapSimulation: boolean;
  selectedHostId: string | null;
  hosts: Host[];
  problems: AlarmProblem[];
  telemetryFeed: TelemetryEvent[];
  trapLog: SnmpTrapPacket[];
  triggers: TriggerRule[];
  maintenanceWindows: MaintenanceWindow[];
  challenges: LabChallenge[];
  labProgress: LabProgress;
}
