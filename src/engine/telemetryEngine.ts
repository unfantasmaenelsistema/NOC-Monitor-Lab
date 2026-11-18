import { buildTriggerExpressions, SEVERITY_MAP } from '../data/initialData';
import { resolveLeafValueForHost } from './snmpSimulator';
import {
  AlarmProblem,
  AnomalyKind,
  AppState,
  Host,
  HostMetrics,
  HostStatus,
  InterfaceAvailability,
  MaintenanceWindow,
  MetricHistoryPoint,
  SeverityLevel,
  TelemetryEvent,
  TriggerEvalFunc,
  TriggerMetric,
  TriggerOperator,
  TriggerRule,
} from '../types/noc';

export function getActiveMaintenanceWindow(
  host: Host,
  windows: MaintenanceWindow[]
): MaintenanceWindow | undefined {
  return windows.find(
    (w) =>
      w.status === 'active' &&
      ((w.targetType === 'hosts' && w.hostIds.includes(host.id)) ||
        (w.targetType === 'group' && w.hostGroup === host.group))
  );
}

const MAX_HISTORY_POINTS = 40;
const MAX_FEED_EVENTS = 60;

export function formatUptime(totalSeconds: number): string {
  if (totalSeconds <= 0) return '0d 00h 00m';
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${days}d ${pad(hours)}h ${pad(mins)}m`;
}

export function formatTimeHms(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('es-ES', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function jitter(range: number): number {
  return (Math.random() - 0.5) * 2 * range;
}

function computeNextMetrics(
  host: Host,
  tickCount: number,
  elapsedSec: number,
  wanFlapSimulation: boolean
): HostMetrics {
  const b = host.baseline;
  const m = host.metrics;

  if (host.activeAnomaly === 'host_down') {
    return {
      ...m,
      cpu: 0,
      ramPct: 0,
      ramUsedGb: 0,
      netInMbps: 0,
      netOutMbps: 0,
      icmpLatencyMs: 0,
      packetLossPct: 100,
      sysUpTimeSec: 0,
    };
  }

  let targetCpu = b.cpu + Math.sin(tickCount * 0.35 + host.hostname.length) * 4 + jitter(3.2);
  let targetRamPct = b.ramPct + Math.cos(tickCount * 0.2) * 1.8 + jitter(1.1);
  let targetDiskPct = b.diskPct + (host.id === 'nas-backup-01' ? Math.sin(tickCount * 0.08) * 0.4 : 0);
  let targetNetIn = b.netInMbps * (1 + Math.sin(tickCount * 0.3) * 0.12) + jitter(b.netInMbps * 0.07);
  let targetNetOut = b.netOutMbps * (1 + Math.cos(tickCount * 0.28) * 0.12) + jitter(b.netOutMbps * 0.07);
  let targetLatency = b.latencyMs + Math.abs(jitter(0.65));
  let targetLoss = 0;

  // Educational Scenario Behaviors (when no chaos override is active)
  if (!host.activeAnomaly) {
    // Caso 1: 1-second SQL micro-spike on SRV-DB-PROD
    if (host.id === 'srv-db-prod' && tickCount % 6 === 0) {
      targetCpu = 87.4 + jitter(1.2);
    }
    // Caso 2: Normal NAS backup waves crossing naive 315 Mbps threshold
    if (host.id === 'nas-backup-01') {
      targetNetIn = 310 + Math.sin(tickCount * 0.65) * 24 + jitter(6);
    }
    // Caso 3: WAN latency oscillating between 99ms and 101ms on RTR-BORDE-ISP
    if (host.id === 'rtr-borde-isp' && wanFlapSimulation) {
      targetLatency = tickCount % 2 === 0 ? 101.2 + jitter(0.35) : 98.8 + jitter(0.35);
    }
  }

  switch (host.activeAnomaly) {
    case 'cpu_spike':
      targetCpu = 91 + jitter(4.5);
      targetLatency = b.latencyMs + 14 + Math.abs(jitter(4));
      break;
    case 'memory_pressure':
      targetRamPct = Math.min(97.5, Math.max(m.ramPct + 3.4, 76) + jitter(0.9));
      targetCpu = Math.max(targetCpu, 68 + jitter(5));
      break;
    case 'net_saturation':
      targetNetIn = 620 + jitter(45);
      targetNetOut = 410 + jitter(35);
      targetLatency = b.latencyMs + 32 + Math.abs(jitter(9));
      break;
    case 'packet_loss':
      targetLoss = 28 + Math.abs(jitter(12));
      targetLatency = 78 + jitter(22);
      break;
    case 'disk_critical':
      targetDiskPct = 97.8 + jitter(0.4);
      break;
    default:
      break;
  }

  const cpu = Number(clamp(targetCpu, 2, 99.4).toFixed(1));
  const ramPct = Number(clamp(targetRamPct, 8, 98.5).toFixed(1));
  const ramUsedGb = Number(((m.ramTotalGb * ramPct) / 100).toFixed(1));
  const diskPct = Number(clamp(targetDiskPct, 5, 99.2).toFixed(1));
  const diskUsedTb = Number(((m.diskTotalTb * diskPct) / 100).toFixed(2));
  const netInMbps = Number(clamp(targetNetIn, 0.5, 980).toFixed(1));
  const netOutMbps = Number(clamp(targetNetOut, 0.5, 980).toFixed(1));
  const icmpLatencyMs = Number(clamp(targetLatency, 0.3, 450).toFixed(2));
  const packetLossPct = Number(clamp(targetLoss, 0, 100).toFixed(1));

  return {
    ...m,
    cpu,
    ramPct,
    ramUsedGb,
    diskPct,
    diskUsedTb,
    netInMbps,
    netOutMbps,
    icmpLatencyMs,
    packetLossPct,
    sysUpTimeSec: m.sysUpTimeSec + elapsedSec,
  };
}

export function extractSeriesValue(pt: MetricHistoryPoint, metric: TriggerMetric): number {
  switch (metric) {
    case 'cpu':
      return pt.cpu;
    case 'ramPct':
      return pt.ramPct;
    case 'diskPct':
      return pt.diskPct;
    case 'packetLossPct':
      return pt.packetLossPct;
    case 'icmpLatencyMs':
      return pt.latencyMs;
    case 'netTotalMbps':
      return pt.netInMbps + pt.netOutMbps;
    case 'netInMbps':
      return pt.netInMbps;
    case 'netOutMbps':
      return pt.netOutMbps;
  }
}

export function computeEvaluatedValue(
  history: MetricHistoryPoint[],
  metric: TriggerMetric,
  evalFunc: TriggerEvalFunc,
  isDown: boolean
): number {
  if (evalFunc === 'nodata60s') {
    return isDown ? 1 : 0;
  }
  if (history.length === 0) return 0;
  const values = history.map((pt) => extractSeriesValue(pt, metric));
  const latest = values[values.length - 1];

  switch (evalFunc) {
    case 'last':
      return latest;
    case 'avg5m': {
      const slice = values.slice(-10);
      return slice.reduce((a, b) => a + b, 0) / slice.length;
    }
    case 'min3m': {
      const slice = values.slice(-6);
      return Math.min(...slice);
    }
    case 'max': {
      const slice = values.slice(-6);
      return Math.max(...slice);
    }
    case 'diff': {
      const prev = values.length > 1 ? values[values.length - 2] : latest;
      return Math.abs(latest - prev);
    }
    default:
      return latest;
  }
}

export function compareOperator(val: number, op: TriggerOperator, threshold: number): boolean {
  switch (op) {
    case '>':
      return val > threshold;
    case '>=':
      return val >= threshold;
    case '<':
      return val < threshold;
    case '<=':
      return val <= threshold;
  }
}

function deriveHostStatusAndInterfaces(
  host: Host,
  metrics: HostMetrics,
  activeHostProblems: AlarmProblem[]
): { status: HostStatus; interfaces: Host['interfaces'] } {
  if (host.status === 'MAINTENANCE') {
    return {
      status: 'MAINTENANCE',
      interfaces: host.interfaces.map((iface) => ({
        ...iface,
        availability: 'disabled' as InterfaceAvailability,
      })),
    };
  }

  if (host.activeAnomaly === 'host_down' || metrics.packetLossPct >= 90) {
    return {
      status: 'DOWN',
      interfaces: host.interfaces.map((iface) => ({
        ...iface,
        availability: 'unavailable' as InterfaceAvailability,
      })),
    };
  }

  const hasSevere = activeHostProblems.some(
    (p) => p.severity === 'high' || p.severity === 'disaster' || p.severity === 'average'
  );
  const hasWarn = activeHostProblems.some(
    (p) => p.severity === 'warning' || p.severity === 'information'
  );

  const status: HostStatus = hasSevere || hasWarn ? 'WARNING' : 'UP';
  const degraded = metrics.packetLossPct > 5 || metrics.icmpLatencyMs > 45;

  return {
    status,
    interfaces: host.interfaces.map((iface) => ({
      ...iface,
      availability: degraded
        ? ('degraded' as InterfaceAvailability)
        : ('available' as InterfaceAvailability),
    })),
  };
}

function buildTelemetryEvent(
  host: Host,
  metrics: HostMetrics,
  mechanism: TelemetryEvent['mechanism'],
  now: number
): TelemetryEvent {
  const primaryIface = host.interfaces[0] ?? {
    protocol: 'ICMP' as const,
    checkMode: 'passive' as const,
  };
  const isPush = mechanism === 'Active Check' || mechanism === 'SNMP Trap';
  const direction: TelemetryEvent['direction'] = isPush ? 'HOST → NOC' : 'NOC → HOST';
  const isDown = host.activeAnomaly === 'host_down' || metrics.packetLossPct >= 90;

  let itemKeyOrOid = 'icmppingsec';
  let summary = '';

  if (mechanism === 'SNMP Trap') {
    itemKeyOrOid = '1.3.6.1.6.3.1.1.5.3 (linkDown/ThresholdTrap)';
    summary = isDown
      ? `TRAP crítico emitido · Pérdida 100% en ${host.ip}`
      : `TRAP umbral superado · CPU ${metrics.cpu}% · ${metrics.netInMbps} Mbps`;
  } else if (mechanism === 'Active Check') {
    itemKeyOrOid = 'system.cpu.util + vm.memory.size[pavailable]';
    summary = isDown
      ? `Timeout de heartbeat activo (10051)`
      : `Agente empujó lote al NOC · CPU ${metrics.cpu}% · RAM ${metrics.ramPct}%`;
  } else if (primaryIface.protocol === 'SNMP') {
    itemKeyOrOid = '1.3.6.1.2.1.2.2.1.10.1 (ifInOctets)';
    summary = isDown
      ? `SNMP Timeout (${host.ip}:161)`
      : `${primaryIface.label} GET OK · ${metrics.netInterface} ${metrics.netInMbps}/${metrics.netOutMbps} Mbps`;
  } else if (primaryIface.protocol === 'HTTP') {
    itemKeyOrOid = 'web.page.get[https://healthz]';
    summary = isDown ? `HTTP 504 Gateway Timeout` : `HTTP 200 OK · RTT ${metrics.icmpLatencyMs} ms`;
  } else {
    itemKeyOrOid = 'system.cpu.util[,avg1]';
    summary = isDown
      ? `ZBX Poller unreachable (${host.ip}:10050)`
      : `${primaryIface.label} Poller · CPU ${metrics.cpu}% · RTT ${metrics.icmpLatencyMs} ms`;
  }

  return {
    id: `ev-${now}-${host.id}-${Math.random().toString(36).slice(2, 6)}`,
    ts: now,
    hostId: host.id,
    hostname: host.hostname,
    direction,
    mechanism,
    protocol: primaryIface.protocol,
    itemKeyOrOid,
    summary,
    rttMs: isDown ? 0 : Math.max(1, Math.round(metrics.icmpLatencyMs)),
    success: !isDown,
  };
}

export function stepTelemetry(state: AppState, manualHostId?: string): AppState {
  const now = Date.now();
  const nextTick = state.tickCount + 1;
  const elapsedSec = manualHostId ? 1 : 2;
  const newEvents: TelemetryEvent[] = [];

  // Phase 1: Advance metrics and history for all hosts (respecting maintenance mode)
  const stagedHosts = state.hosts.map((host) => {
    const isManual = manualHostId === host.id;
    const activeMaint = getActiveMaintenanceWindow(host, state.maintenanceWindows);
    const isMaint = Boolean(activeMaint) || host.status === 'MAINTENANCE';
    const isNoDataMaint = activeMaint?.mode === 'no_data' || (!activeMaint && host.status === 'MAINTENANCE');
    const isWithDataMaint = activeMaint?.mode === 'with_data';

    const pollDue =
      !isNoDataMaint &&
      (isManual ||
        (host.checkMode !== 'active' &&
          (now - host.lastPassivePollAt >= host.pollingIntervalSec * 1000 || nextTick % 3 === 0)));

    const activeDue =
      !isNoDataMaint &&
      (host.checkMode === 'active' || host.checkMode === 'mixed') &&
      (nextTick % 2 === 0 || host.activeAnomaly !== null);

    const nextMetrics = isNoDataMaint
      ? {
          ...host.metrics,
          sysUpTimeSec: host.metrics.sysUpTimeSec + elapsedSec,
        }
      : computeNextMetrics(host, nextTick, elapsedSec, state.wanFlapSimulation);

    const nextPoint: MetricHistoryPoint = {
      ts: now,
      cpu: nextMetrics.cpu,
      ramPct: nextMetrics.ramPct,
      diskPct: nextMetrics.diskPct,
      netInMbps: nextMetrics.netInMbps,
      netOutMbps: nextMetrics.netOutMbps,
      latencyMs: nextMetrics.icmpLatencyMs,
      packetLossPct: nextMetrics.packetLossPct,
    };
    const nextHistory = isNoDataMaint
      ? host.history
      : [...host.history.slice(-(MAX_HISTORY_POINTS - 1)), nextPoint];

    return {
      host,
      isManual,
      isMaint,
      isNoDataMaint,
      isWithDataMaint,
      pollDue,
      activeDue,
      nextMetrics,
      nextHistory,
    };
  });

  // Phase 2: Evaluate triggers in dependency order (root triggers first, then dependent triggers)
  let updatedProblems = [...state.problems];
  let slaPenalty = 0;
  const firingTriggerIds = new Set<string>();

  // Sort rules so triggers with no dependency run before dependent triggers
  const orderedTriggers = [...state.triggers].sort((a, b) => {
    const aDep = a.dependsOnTriggerId ? 1 : 0;
    const bDep = b.dependsOnTriggerId ? 1 : 0;
    return aDep - bDep;
  });

  const updatedTriggerMap = new Map<string, TriggerRule>();

  for (const rule of orderedTriggers) {
    let transitionDelta = 0;
    const nextStateByHost: Record<string, 'OK' | 'PROBLEM' | 'SUPPRESSED'> = {
      ...rule.lastStateByHost,
    };

    const parentDepFiring = Boolean(
      rule.dependsOnTriggerId && firingTriggerIds.has(rule.dependsOnTriggerId)
    );

    for (const staged of stagedHosts) {
      const { host, isNoDataMaint, isWithDataMaint, isMaint, nextMetrics, nextHistory } = staged;
      if (rule.hostId !== 'ALL' && rule.hostId !== host.id) continue;

      const existingIdx = updatedProblems.findIndex(
        (p) => !p.resolved && p.hostId === host.id && p.triggerId === rule.id
      );
      const currentlyFiring = existingIdx !== -1;

      // In no_data maintenance or disabled rule, resolve/halt trigger evaluation
      if (!rule.enabled || isNoDataMaint) {
        if (currentlyFiring) {
          updatedProblems[existingIdx] = {
            ...updatedProblems[existingIdx],
            resolved: true,
            resolvedAt: now,
          };
        }
        nextStateByHost[host.id] = 'OK';
        continue;
      }

      const isHostDown = host.activeAnomaly === 'host_down' || nextMetrics.packetLossPct >= 90;
      const evalValue = computeEvaluatedValue(nextHistory, rule.metric, rule.evalFunc, isHostDown);
      const problemMet = compareOperator(evalValue, rule.operator, rule.threshold);

      let shouldFire = false;
      if (!currentlyFiring) {
        shouldFire = problemMet;
      } else {
        if (rule.useHysteresis) {
          const recoveryMet = compareOperator(
            evalValue,
            rule.recoveryOperator,
            rule.recoveryThreshold
          );
          shouldFire = !recoveryMet;
        } else {
          shouldFire = problemMet;
        }
      }

      if (shouldFire && parentDepFiring && host.id !== 'sw-core-01') {
        if (currentlyFiring) {
          updatedProblems[existingIdx] = {
            ...updatedProblems[existingIdx],
            resolved: true,
            resolvedAt: now,
            suppressedByDependency: rule.dependsOnTriggerId ?? undefined,
          };
        }
        nextStateByHost[host.id] = 'SUPPRESSED';
        continue;
      }

      if (shouldFire) {
        firingTriggerIds.add(rule.id);
        const prevState = rule.lastStateByHost[host.id] ?? 'OK';
        if (prevState !== 'PROBLEM') {
          transitionDelta += 1;
        }
        nextStateByHost[host.id] = isWithDataMaint ? 'SUPPRESSED' : 'PROBLEM';

        if (!currentlyFiring) {
          const sourceCheck: AlarmProblem['sourceCheck'] =
            host.checkMode === 'active'
              ? 'Activo (Agente)'
              : host.interfaces.some((i) => i.protocol === 'SNMP') &&
                (rule.metric === 'netTotalMbps' ||
                  rule.metric === 'netInMbps' ||
                  rule.metric === 'packetLossPct')
              ? 'SNMP Trap'
              : 'Pasivo (Polling)';

          if (!isMaint) {
            if (rule.severity === 'disaster') slaPenalty += 1.25;
            else if (rule.severity === 'high') slaPenalty += 0.35;
          }

          updatedProblems.unshift({
            id: `prob-${host.id}-${rule.id}-${now}`,
            hostId: host.id,
            hostname: host.hostname,
            hostIp: host.ip,
            hostGroup: host.group,
            triggerId: rule.id,
            severity: rule.severity,
            title: rule.name,
            expression: rule.expressionTemplate.replace('HOST', host.hostname),
            sourceCheck,
            startedAt: now,
            acknowledged: false,
            resolved: false,
            suppressedInMaintenance: isWithDataMaint,
            notes: [],
          });
        } else if (isWithDataMaint && !updatedProblems[existingIdx].suppressedInMaintenance) {
          updatedProblems[existingIdx] = {
            ...updatedProblems[existingIdx],
            suppressedInMaintenance: true,
          };
        }
      } else {
        const prevState = rule.lastStateByHost[host.id] ?? 'OK';
        if (prevState === 'PROBLEM') {
          transitionDelta += 1;
        }
        nextStateByHost[host.id] = 'OK';

        if (currentlyFiring) {
          updatedProblems[existingIdx] = {
            ...updatedProblems[existingIdx],
            resolved: true,
            resolvedAt: now,
          };
        }
      }
    }

    updatedTriggerMap.set(rule.id, {
      ...rule,
      transitionCount: rule.transitionCount + transitionDelta,
      lastStateByHost: nextStateByHost,
    });
  }

  const updatedTriggers = state.triggers.map((t) => updatedTriggerMap.get(t.id) ?? t);

  // Phase 3: Finalize host statuses, interfaces, telemetry feed & custom SNMP items
  const updatedHosts = stagedHosts.map(
    ({
      host,
      isManual,
      isMaint,
      isNoDataMaint,
      pollDue,
      activeDue,
      nextMetrics,
      nextHistory,
    }) => {
      const activeHostProblems = updatedProblems.filter(
        (p) => !p.resolved && p.hostId === host.id && !p.suppressedInMaintenance
      );
      const { status, interfaces } = isMaint
        ? {
            status: 'MAINTENANCE' as HostStatus,
            interfaces: host.interfaces.map((iface) => ({
              ...iface,
              availability: isNoDataMaint
                ? ('disabled' as InterfaceAvailability)
                : ('available' as InterfaceAvailability),
            })),
          }
        : deriveHostStatusAndInterfaces(host, nextMetrics, activeHostProblems);

      if (isManual && !isNoDataMaint) {
        newEvents.push(buildTelemetryEvent(host, nextMetrics, 'Manual Execute', now));
      } else if (pollDue && !isNoDataMaint && newEvents.length < 3) {
        newEvents.push(buildTelemetryEvent(host, nextMetrics, 'Passive Polling', now));
      } else if (activeDue && !isNoDataMaint && newEvents.length < 3) {
        newEvents.push(buildTelemetryEvent(host, nextMetrics, 'Active Check', now));
      }

      const nextCustomSnmpItems = host.customSnmpItems.map((item) => {
        const updatedHostSnapshot: Host = {
          ...host,
          status,
          interfaces,
          metrics: nextMetrics,
        };
        const resolved = resolveLeafValueForHost(item.oid, updatedHostSnapshot);
        if (!resolved || isNoDataMaint) {
          return item;
        }
        const nextHist = [...item.history.slice(-29), resolved.numericValue];
        return {
          ...item,
          lastNumericValue: resolved.numericValue,
          lastFormattedValue: resolved.formattedValue,
          lastPolledAt: now,
          history: nextHist,
        };
      });

      return {
        ...host,
        status,
        interfaces,
        metrics: nextMetrics,
        history: nextHistory,
        customSnmpItems: nextCustomSnmpItems,
        lastPassivePollAt: pollDue ? now : host.lastPassivePollAt,
        lastActivePushAt: activeDue ? now : host.lastActivePushAt,
      };
    }
  );

  const combinedFeed = [...newEvents, ...state.telemetryFeed].slice(0, MAX_FEED_EVENTS);
  const boundedProblems = updatedProblems.slice(0, 80);
  const nextSlaScore = Number(Math.max(82.0, state.slaScore - slaPenalty).toFixed(2));

  return {
    ...state,
    tickCount: nextTick,
    lastTickAt: now,
    slaScore: nextSlaScore,
    hosts: updatedHosts,
    triggers: updatedTriggers,
    problems: boundedProblems,
    telemetryFeed: combinedFeed,
  };
}

export function fixAntiPatternTriggerRule(rule: TriggerRule): TriggerRule {
  if (rule.id === 'trg-fp-db-cpu-last') {
    const expr = buildTriggerExpressions({
      hostnameLabel: 'SRV-DB-PROD',
      metric: 'cpu',
      evalFunc: 'avg5m',
      operator: '>',
      threshold: 85,
      useHysteresis: true,
      recoveryOperator: '<',
      recoveryThreshold: 70,
    });
    return {
      ...rule,
      name: 'CPU sostenido en SRV-DB-PROD (Corregido avg 5m + Histéresis)',
      evalFunc: 'avg5m',
      useHysteresis: true,
      recoveryOperator: '<',
      recoveryThreshold: 70,
      expressionTemplate: expr.problemExpr,
      recoveryExpressionTemplate: expr.recoveryExpr,
      antiPatternNote: undefined,
    };
  }
  if (rule.id === 'trg-fp-nas-backup-net') {
    const expr = buildTriggerExpressions({
      hostnameLabel: 'NAS-BACKUP-01',
      metric: 'netInMbps',
      evalFunc: 'avg5m',
      operator: '>',
      threshold: 650,
      useHysteresis: true,
      recoveryOperator: '<',
      recoveryThreshold: 550,
    });
    return {
      ...rule,
      name: 'Tráfico backup saturado en NAS-BACKUP-01 (Corregido > 650 Mbps)',
      evalFunc: 'avg5m',
      threshold: 650,
      useHysteresis: true,
      recoveryOperator: '<',
      recoveryThreshold: 550,
      expressionTemplate: expr.problemExpr,
      recoveryExpressionTemplate: expr.recoveryExpr,
      antiPatternNote: undefined,
    };
  }
  if (rule.id === 'trg-flap-wan-latency') {
    const expr = buildTriggerExpressions({
      hostnameLabel: 'RTR-BORDE-ISP',
      metric: 'icmpLatencyMs',
      evalFunc: 'avg5m',
      operator: '>',
      threshold: 105,
      useHysteresis: true,
      recoveryOperator: '<',
      recoveryThreshold: 85,
    });
    return {
      ...rule,
      name: 'Latencia WAN RTR-BORDE-ISP (Corregido avg 5m + Histéresis < 85ms)',
      evalFunc: 'avg5m',
      threshold: 105,
      useHysteresis: true,
      recoveryOperator: '<',
      recoveryThreshold: 85,
      expressionTemplate: expr.problemExpr,
      recoveryExpressionTemplate: expr.recoveryExpr,
      antiPatternNote: undefined,
    };
  }
  return rule;
}

export function injectAnomalyIntoState(
  state: AppState,
  targetHostId?: string,
  requestedKind?: AnomalyKind
): AppState {
  const now = Date.now();
  const eligible = state.hosts.filter((h) => h.status !== 'MAINTENANCE');
  if (eligible.length === 0) return state;

  const chosen =
    (targetHostId ? eligible.find((h) => h.id === targetHostId) : undefined) ??
    eligible.find((h) => h.activeAnomaly === null) ??
    eligible[Math.floor(Math.random() * eligible.length)];

  const kinds: AnomalyKind[] = [
    'cpu_spike',
    'net_saturation',
    'packet_loss',
    'memory_pressure',
    'host_down',
    'disk_critical',
  ];
  const anomaly: AnomalyKind = requestedKind ?? kinds[Math.floor(Math.random() * kinds.length)];

  const patchedState: AppState = {
    ...state,
    chaosCount: state.chaosCount + 1,
    hosts: state.hosts.map((h) =>
      h.id === chosen.id
        ? {
            ...h,
            activeAnomaly: anomaly,
          }
        : h
    ),
  };

  const stepped = stepTelemetry(patchedState, chosen.id);
  const updatedTarget = stepped.hosts.find((h) => h.id === chosen.id) ?? chosen;

  const trapEvent = buildTelemetryEvent(
    updatedTarget,
    updatedTarget.metrics,
    updatedTarget.checkMode === 'active' ? 'Active Check' : 'SNMP Trap',
    now
  );

  return {
    ...stepped,
    telemetryFeed: [trapEvent, ...stepped.telemetryFeed].slice(0, MAX_FEED_EVENTS),
  };
}

export function recoverHostInState(state: AppState, hostId: string): AppState {
  const now = Date.now();
  const cleared: AppState = {
    ...state,
    hosts: state.hosts.map((h) =>
      h.id === hostId
        ? {
            ...h,
            activeAnomaly: null,
            status: h.status === 'MAINTENANCE' ? 'MAINTENANCE' : 'UP',
            metrics: {
              ...h.metrics,
              packetLossPct: 0,
              sysUpTimeSec: h.metrics.sysUpTimeSec === 0 ? 12 : h.metrics.sysUpTimeSec,
            },
          }
        : h
    ),
    problems: state.problems.map((p) =>
      p.hostId === hostId && !p.resolved ? { ...p, resolved: true, resolvedAt: now } : p
    ),
  };
  return stepTelemetry(cleared, hostId);
}

export function recoverAllInState(state: AppState): AppState {
  const now = Date.now();
  const cleared: AppState = {
    ...state,
    hosts: state.hosts.map((h) => ({
      ...h,
      activeAnomaly: null,
      status: h.status === 'MAINTENANCE' ? 'MAINTENANCE' : 'UP',
      metrics: {
        ...h.metrics,
        cpu: h.baseline.cpu,
        ramPct: h.baseline.ramPct,
        diskPct: h.baseline.diskPct,
        netInMbps: h.baseline.netInMbps,
        netOutMbps: h.baseline.netOutMbps,
        icmpLatencyMs: h.baseline.latencyMs,
        packetLossPct: 0,
        sysUpTimeSec: h.metrics.sysUpTimeSec === 0 ? 30 : h.metrics.sysUpTimeSec,
      },
    })),
    problems: state.problems.map((p) => (!p.resolved ? { ...p, resolved: true, resolvedAt: now } : p)),
  };
  return stepTelemetry(cleared);
}

export function getSeverityRank(sev: SeverityLevel): number {
  return SEVERITY_MAP[sev]?.order ?? 0;
}

export interface MissionStepStatus {
  label: string;
  done: boolean;
}

export interface MissionEvaluation {
  id: string;
  steps: MissionStepStatus[];
  allDone: boolean;
}

export function evaluateMissions(state: AppState): Record<string, MissionEvaluation> {
  const fwHost = state.hosts.find((h) => h.id === 'fw-perimetral-01');
  const adHost = state.hosts.find((h) => h.id === 'srv-ad-dc01');
  const nasHost = state.hosts.find((h) => h.id === 'nas-backup-01');
  const dbHost = state.hosts.find((h) => h.id === 'srv-db-prod');

  const trgDbCpu = state.triggers.find((t) => t.id === 'trg-fp-db-cpu-last');
  const trgWanFlap = state.triggers.find((t) => t.id === 'trg-flap-wan-latency');
  const trgLoss = state.triggers.find((t) => t.id === 'trg-loss-disaster');
  const trgNasFp = state.triggers.find((t) => t.id === 'trg-fp-nas-backup-net');

  // Mission 1: Caza en la MIB
  const m1Step1 = state.labProgress.snmpQueriedFw;
  const m1Step2 = state.labProgress.snmpDiagnosedDbFail;
  const m1Step3 = Boolean(fwHost && fwHost.customSnmpItems.length > 0);

  // Mission 2: Domando el Falso Positivo
  const m2Step1 = state.problems.some(
    (p) =>
      p.markedFalsePositive &&
      (p.hostId === 'srv-db-prod' || p.hostId === 'rtr-borde-isp' || p.hostId === 'nas-backup-01')
  );
  // Pausar el trigger no es corregirlo: deja SRV-DB-PROD y la WAN sin vigilancia. Tiene que seguir
  // activo y evaluar con avg(5m) + histéresis.
  const m2Step2 = Boolean(
    trgDbCpu && trgDbCpu.enabled && trgDbCpu.evalFunc === 'avg5m' && trgDbCpu.useHysteresis
  );
  const m2Step3 = Boolean(
    trgWanFlap && trgWanFlap.enabled && trgWanFlap.evalFunc === 'avg5m' && trgWanFlap.useHysteresis
  );

  // Mission 3: Trampa Nocturna (SNMP Trap & Correlación)
  const m3Step1 =
    state.labProgress.mission3Launched ||
    state.trapLog.some((t) => t.hostId === 'sw-core-01' && t.trapKind === 'linkDown');
  const m3Step2 = Boolean(trgLoss && trgLoss.dependsOnTriggerId === 'trg-sw-core-icmp');
  const m3Step3 = state.problems.some(
    (p) => p.hostId === 'sw-core-01' && p.acknowledged && p.notes.length > 0
  );

  // Mission 4: Intervención sin Pánico
  const adWin = adHost ? getActiveMaintenanceWindow(adHost, state.maintenanceWindows) : undefined;
  const nasWin = nasHost ? getActiveMaintenanceWindow(nasHost, state.maintenanceWindows) : undefined;
  const m4Step1 = Boolean(
    adWin &&
      nasWin &&
      adWin.mode === 'with_data' &&
      nasWin.mode === 'with_data'
  );
  const m4Step2 = state.labProgress.mission4UpgradeSimulated;
  // Lo que se evalúa es que la actualización no genere alertas ni penalice el SLA. El SLA del turno
  // solo baja (no se recupera), así que exigir un SLA global >= 99.5 bloqueaba esta misión para siempre
  // si antes se había hecho la Misión 3 (caída de SW-CORE-01) o cualquier prueba de caos.
  const m4Step3 = state.labProgress.mission4UpgradeClean;

  // Mission 5: Turno de Guardia en Crisis (Contrarreloj 180s)
  const m5Started = state.labProgress.mission5StartedAt !== null;
  const m5Step1 =
    m5Started &&
    state.problems.some(
      (p) =>
        p.hostId === 'fw-perimetral-01' &&
        (p.expression.includes('authenticationFailure') ||
          p.title.toLowerCase().includes('autenticación') ||
          p.sourceCheck === 'SNMP Trap') &&
        p.acknowledged
    );
  const m5Step2 =
    m5Started &&
    Boolean(dbHost && dbHost.activeAnomaly !== 'disk_critical' && dbHost.metrics.diskPct < 90);
  const m5Step3 =
    m5Started &&
    (state.problems.some((p) => p.hostId === 'nas-backup-01' && p.markedFalsePositive) ||
      Boolean(trgNasFp && (!trgNasFp.enabled || !trgNasFp.antiPatternNote)));

  return {
    'mission-1': {
      id: 'mission-1',
      steps: [
        { label: 'Ejecutar snmpget/snmpwalk exitoso contra FW-PERIMETRAL-01', done: m1Step1 },
        { label: 'Diagnosticar fallo SNMP en SRV-DB-PROD (Agente Zabbix)', done: m1Step2 },
        { label: 'Registrar ítem SNMP en FW-PERIMETRAL-01 (Latest Data)', done: m1Step3 },
      ],
      allDone: m1Step1 && m1Step2 && m1Step3,
    },
    'mission-2': {
      id: 'mission-2',
      steps: [
        { label: 'Marcar alarma ruidosa como Falso Positivo en Consola', done: m2Step1 },
        { label: 'Corregir trigger CPU de SRV-DB-PROD (activo, avg 5m + Histéresis)', done: m2Step2 },
        { label: 'Corregir trigger Flapping WAN de RTR-BORDE-ISP (activo, avg 5m + Histéresis)', done: m2Step3 },
      ],
      allDone: m2Step1 && m2Step2 && m2Step3,
    },
    'mission-3': {
      id: 'mission-3',
      steps: [
        { label: 'Recibir SNMP Trap linkDown / caída en SW-CORE-01', done: m3Step1 },
        { label: 'Verificar dependencia RCA en triggers hijos (SW-CORE-01)', done: m3Step2 },
        { label: 'Documentar Acknowledge + nota técnica en alarma raíz SW-CORE-01', done: m3Step3 },
      ],
      allDone: m3Step1 && m3Step2 && m3Step3,
    },
    'mission-4': {
      id: 'mission-4',
      steps: [
        { label: 'Ventana activa "With data collection" para SRV-AD-DC01 y NAS-BACKUP-01', done: m4Step1 },
        { label: 'Ejecutar actualización simulada sobre ambos equipos', done: m4Step2 },
        { label: '0% alertas no suprimidas y sin penalización de SLA', done: m4Step3 },
      ],
      allDone: m4Step1 && m4Step2 && m4Step3,
    },
    'mission-5': {
      id: 'mission-5',
      steps: [
        { label: 'Reconocer (Ack) Trap authenticationFailure en FW-PERIMETRAL-01', done: m5Step1 },
        { label: 'Resolver disco al 98% en SRV-DB-PROD', done: m5Step2 },
        { label: 'Descartar/corregir distracción Falso Positivo en NAS-BACKUP-01', done: m5Step3 },
      ],
      allDone: m5Step1 && m5Step2 && m5Step3,
    },
  };
}

export function syncMissionsAndXp(state: AppState): AppState {
  const evals = evaluateMissions(state);
  const now = Date.now();
  let addedXp = 0;
  let m5FinishedInTime = state.labProgress.mission5FinishedInTime;

  const nextChallenges = state.challenges.map((ch) => {
    if (ch.completed) return ch;
    const ev = evals[ch.id];
    if (!ev || !ev.allDone) return ch;

    if (ch.id === 'mission-5' && state.labProgress.mission5StartedAt !== null) {
      const elapsedSec = (now - state.labProgress.mission5StartedAt) / 1000;
      if (elapsedSec <= state.labProgress.mission5TimeLimitSec) {
        m5FinishedInTime = true;
      } else {
        return ch;
      }
    }

    addedXp += ch.xpReward;
    return { ...ch, completed: true };
  });

  if (addedXp === 0 && m5FinishedInTime === state.labProgress.mission5FinishedInTime) {
    return state;
  }

  return {
    ...state,
    nocXp: state.nocXp + addedXp,
    challenges: nextChallenges,
    labProgress: {
      ...state.labProgress,
      mission5FinishedInTime: m5FinishedInTime,
    },
  };
}

