import React, { useMemo, useState } from 'react';
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Cpu,
  Network,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import { SEVERITY_MAP, ZABBIX_SEVERITIES } from '../data/initialData';
import { formatTimeHms } from '../engine/telemetryEngine';
import {
  AlarmProblem,
  Host,
  HostGroup,
  SeverityLevel,
  TelemetryEvent,
} from '../types/noc';
import { NetworkTopologySvg } from './NetworkTopologySvg';
import { SparklineCanvas } from './SparklineCanvas';

interface DashboardNocViewProps {
  hosts: Host[];
  problems: AlarmProblem[];
  telemetryFeed: TelemetryEvent[];
  selectedHostId: string | null;
  onSelectHost: (hostId: string) => void;
  onNavigateToProblems: () => void;
  onExecuteNow: (hostId: string) => void;
}

const HOST_GROUPS: HostGroup[] = ['Seguridad', 'Networking', 'Servidores', 'Almacenamiento'];

export const DashboardNocView: React.FC<DashboardNocViewProps> = ({
  hosts,
  problems,
  telemetryFeed,
  selectedHostId,
  onSelectHost,
  onNavigateToProblems,
  onExecuteNow,
}) => {
  const [feedFilter, setFeedFilter] = useState<'all' | 'passive' | 'active'>('all');

  const activeProblems = useMemo(() => problems.filter((p) => !p.resolved), [problems]);

  const stats = useMemo(() => {
    const total = hosts.length;
    const up = hosts.filter((h) => h.status === 'UP').length;
    const availability = total > 0 ? ((up / total) * 100).toFixed(1) : '0.0';
    const totalIn = hosts.reduce((s, h) => s + h.metrics.netInMbps, 0);
    const totalOut = hosts.reduce((s, h) => s + h.metrics.netOutMbps, 0);
    const avgCpu =
      total > 0 ? (hosts.reduce((s, h) => s + h.metrics.cpu, 0) / total).toFixed(1) : '0.0';
    const passiveChecks = hosts.reduce(
      (s, h) => s + h.interfaces.filter((i) => i.checkMode === 'passive').length,
      0
    );
    const activeChecks = hosts.reduce(
      (s, h) => s + h.interfaces.filter((i) => i.checkMode === 'active').length,
      0
    );
    return { total, up, availability, totalIn, totalOut, avgCpu, passiveChecks, activeChecks };
  }, [hosts]);

  // Top 3 hosts by CPU for live multi-series canvas chart
  const topCpuHosts = useMemo(() => {
    return [...hosts]
      .sort((a, b) => b.metrics.cpu - a.metrics.cpu)
      .slice(0, 3);
  }, [hosts]);

  const cpuChartSeries = useMemo(() => {
    const palette = ['#38bdf8', '#f59e0b', '#e97659'];
    return topCpuHosts.map((h, idx) => ({
      label: h.hostname,
      color: palette[idx % palette.length],
      data: h.history.map((pt) => pt.cpu),
    }));
  }, [topCpuHosts]);

  // Aggregate Network In/Out Mbps series across all hosts
  const aggregateNetSeries = useMemo(() => {
    const len = hosts[0]?.history.length ?? 0;
    const inData: number[] = [];
    const outData: number[] = [];
    for (let i = 0; i < len; i++) {
      let sumIn = 0;
      let sumOut = 0;
      for (const h of hosts) {
        const pt = h.history[i];
        if (pt) {
          sumIn += pt.netInMbps;
          sumOut += pt.netOutMbps;
        }
      }
      inData.push(Number(sumIn.toFixed(1)));
      outData.push(Number(sumOut.toFixed(1)));
    }
    return [
      { label: 'Tráfico Entrada (Mbps)', color: '#10b981', data: inData },
      { label: 'Tráfico Salida (Mbps)', color: '#38bdf8', data: outData },
    ];
  }, [hosts]);

  // Severity matrix counts: group -> severity -> count
  const matrixCounts = useMemo(() => {
    const matrix: Record<HostGroup, Record<SeverityLevel, number>> = {
      Seguridad: {
        not_classified: 0,
        information: 0,
        warning: 0,
        average: 0,
        high: 0,
        disaster: 0,
      },
      Networking: {
        not_classified: 0,
        information: 0,
        warning: 0,
        average: 0,
        high: 0,
        disaster: 0,
      },
      Servidores: {
        not_classified: 0,
        information: 0,
        warning: 0,
        average: 0,
        high: 0,
        disaster: 0,
      },
      Almacenamiento: {
        not_classified: 0,
        information: 0,
        warning: 0,
        average: 0,
        high: 0,
        disaster: 0,
      },
    };
    for (const p of activeProblems) {
      if (matrix[p.hostGroup]) {
        matrix[p.hostGroup][p.severity] += 1;
      }
    }
    return matrix;
  }, [activeProblems]);

  const filteredFeed = useMemo(() => {
    if (feedFilter === 'passive') {
      return telemetryFeed.filter(
        (e) => e.mechanism === 'Passive Polling' || e.mechanism === 'Manual Execute'
      );
    }
    if (feedFilter === 'active') {
      return telemetryFeed.filter(
        (e) => e.mechanism === 'Active Check' || e.mechanism === 'SNMP Trap'
      );
    }
    return telemetryFeed;
  }, [telemetryFeed, feedFilter]);

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-100 tracking-tight">
            Dashboard NOC en Tiempo Real
          </h2>
          <p className="text-xs text-slate-400">
            Supervisión centralizada · Matriz oficial Zabbix · Topología L2/L3 y flujo Pasivo vs Activo
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-400 font-mono tabular-nums">
          <span>
            Pasivos: <strong className="text-sky-300">{stats.passiveChecks}</strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            Activos/Traps: <strong className="text-emerald-300">{stats.activeChecks}</strong>
          </span>
        </div>
      </div>

      {/* System Status KPI Strip */}
      <section
        aria-label="Indicadores globales del sistema"
        className="grid grid-cols-2 lg:grid-cols-4 gap-4"
      >
        <div className="bg-[#111827] border border-[#1f2937] rounded-lg p-4">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
            <span>Disponibilidad Infraestructura</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          </div>
          <div className="text-2xl font-semibold font-mono tabular-nums text-slate-100">
            {stats.availability}%
          </div>
          <div className="text-xs text-slate-400 mt-1 font-mono tabular-nums">
            {stats.up} de {stats.total} hosts nominales
          </div>
        </div>

        <div className="bg-[#111827] border border-[#1f2937] rounded-lg p-4">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
            <span>Problemas Activos</span>
            <ShieldAlert
              className={`w-4 h-4 shrink-0 ${
                activeProblems.length > 0 ? 'text-rose-400' : 'text-slate-400'
              }`}
            />
          </div>
          <div className="text-2xl font-semibold font-mono tabular-nums text-slate-100">
            {activeProblems.length}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            {activeProblems.length === 0 ? (
              <span className="text-emerald-400">Sin triggers disparados</span>
            ) : (
              <button
                type="button"
                onClick={onNavigateToProblems}
                className="text-sky-400 hover:text-sky-300 underline-offset-2 hover:underline"
              >
                Abrir Consola de Problemas
              </button>
            )}
          </div>
        </div>

        <div className="bg-[#111827] border border-[#1f2937] rounded-lg p-4">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
            <span>Carga Media CPU Cluster</span>
            <Cpu className="w-4 h-4 text-sky-400 shrink-0" />
          </div>
          <div className="text-2xl font-semibold font-mono tabular-nums text-slate-100">
            {stats.avgCpu}%
          </div>
          <div className="text-xs text-slate-400 mt-1 truncate font-mono tabular-nums">
            Pico: {topCpuHosts[0]?.hostname ?? '—'} ({topCpuHosts[0]?.metrics.cpu ?? 0}%)
          </div>
        </div>

        <div className="bg-[#111827] border border-[#1f2937] rounded-lg p-4">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
            <span>Tráfico Agregado Red</span>
            <Network className="w-4 h-4 text-emerald-400 shrink-0" />
          </div>
          <div className="text-2xl font-semibold font-mono tabular-nums text-slate-100">
            {Math.round(stats.totalIn + stats.totalOut)} Mbps
          </div>
          <div className="text-xs text-slate-400 mt-1 font-mono tabular-nums">
            IN {Math.round(stats.totalIn)} · OUT {Math.round(stats.totalOut)} Mbps
          </div>
        </div>
      </section>

      {/* Zabbix Official Severity Matrix + Active Problems Summary */}
      <section className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <div className="xl:col-span-7 bg-[#111827] border border-[#1f2937] rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-[#1f2937] flex items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">
                Matriz de Severidad por Grupo (Estándar Zabbix)
              </h3>
              <p className="text-[11px] text-slate-400">
                Haz clic en cualquier celda con incidencias para inspeccionar la Consola de Problemas
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#1f2937] bg-[#0b0f19]/60">
                  <th className="text-left font-medium text-slate-300 px-4 py-2.5 whitespace-nowrap">
                    Grupo de Hosts
                  </th>
                  {ZABBIX_SEVERITIES.map((sev) => (
                    <th
                      key={sev.key}
                      className="text-center font-semibold px-2 py-2.5 whitespace-nowrap"
                      style={{ color: sev.color }}
                    >
                      {sev.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1f2937]">
                {HOST_GROUPS.map((group) => (
                  <tr key={group} className="hover:bg-[#1f2937]/30 transition-colors">
                    <td className="px-4 py-2.5 font-medium text-slate-200 whitespace-nowrap">
                      {group}
                    </td>
                    {ZABBIX_SEVERITIES.map((sev) => {
                      const count = matrixCounts[group][sev.key];
                      return (
                        <td key={sev.key} className="px-2 py-2 text-center">
                          {count > 0 ? (
                            <button
                              type="button"
                              onClick={onNavigateToProblems}
                              className="w-full py-1 px-2 rounded font-mono tabular-nums font-bold text-xs transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                              style={{
                                backgroundColor: sev.color,
                                color: sev.textColor,
                              }}
                            >
                              {count}
                            </button>
                          ) : (
                            <span className="font-mono tabular-nums text-slate-600">0</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Active Triggers / Recent Problems Panel */}
        <div className="xl:col-span-5 bg-[#111827] border border-[#1f2937] rounded-lg flex flex-col">
          <div className="px-4 py-3 border-b border-[#1f2937] flex items-center justify-between gap-4">
            <h3 className="text-sm font-semibold text-slate-100">
              Problemas Activos en Curso
            </h3>
            <button
              type="button"
              onClick={onNavigateToProblems}
              className="text-xs text-sky-400 hover:text-sky-300 font-medium whitespace-nowrap"
            >
              Ver todos ({activeProblems.length})
            </button>
          </div>

          {activeProblems.length === 0 ? (
            <div className="p-6 flex-1 flex flex-col items-center justify-center text-center">
              <CheckCircle2 className="w-7 h-7 text-emerald-500/80 mb-2" />
              <p className="text-sm font-medium text-slate-200">
                Todos los servicios operando en parámetros nominales
              </p>
              <p className="text-xs text-slate-400 mt-1 max-w-sm">
                Pulsa &quot;Inyectar Anomalía / Caos&quot; en la barra superior para simular un fallo
                real y observar la evaluación de triggers.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#1f2937] max-h-60 overflow-y-auto">
              {activeProblems.slice(0, 6).map((prob) => {
                const sev = SEVERITY_MAP[prob.severity];
                return (
                  <div
                    key={prob.id}
                    className="px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-[#1f2937]/30 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide shrink-0"
                          style={{ backgroundColor: sev.color, color: sev.textColor }}
                        >
                          {sev.label}
                        </span>
                        <button
                          type="button"
                          onClick={() => onSelectHost(prob.hostId)}
                          className="text-xs font-mono font-semibold text-sky-300 hover:underline truncate"
                        >
                          {prob.hostname}
                        </button>
                      </div>
                      <p className="text-xs text-slate-300 truncate mt-1">{prob.title}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[11px] font-mono tabular-nums text-slate-400">
                        {formatTimeHms(prob.startedAt)}
                      </div>
                      <div className="text-[10px] text-slate-500">{prob.sourceCheck}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Live Canvas Charts */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-[#111827] border border-[#1f2937] rounded-lg p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">
                Uso de CPU en Vivo (Top 3 Hosts)
              </h3>
              <p className="text-[11px] text-slate-400">
                Ventana deslizante de telemetría · Actualización en tiempo real
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono tabular-nums">
              {cpuChartSeries.map((s) => {
                const latest = s.data[s.data.length - 1] ?? 0;
                return (
                  <span key={s.label} className="inline-flex items-center gap-1.5 text-slate-300">
                    <span
                      className="w-2.5 h-2.5 rounded-xs shrink-0"
                      style={{ backgroundColor: s.color }}
                      aria-hidden="true"
                    />
                    <span>{s.label}:</span>
                    <strong className="text-slate-100">{latest.toFixed(1)}%</strong>
                  </span>
                );
              })}
            </div>
          </div>
          <SparklineCanvas series={cpuChartSeries} height={155} max={100} unit="%" />
        </div>

        <div className="bg-[#111827] border border-[#1f2937] rounded-lg p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">
                Rendimiento de Red Agregado (In / Out)
              </h3>
              <p className="text-[11px] text-slate-400">
                Suma de interfaces troncales y servidores en Mbps
              </p>
            </div>
            <div className="flex items-center gap-4 text-[11px] font-mono tabular-nums">
              {aggregateNetSeries.map((s) => {
                const latest = s.data[s.data.length - 1] ?? 0;
                return (
                  <span key={s.label} className="inline-flex items-center gap-1.5 text-slate-300">
                    <span
                      className="w-2.5 h-2.5 rounded-xs shrink-0"
                      style={{ backgroundColor: s.color }}
                      aria-hidden="true"
                    />
                    <span>{s.label.includes('Entrada') ? 'IN' : 'OUT'}:</span>
                    <strong className="text-slate-100">{Math.round(latest)} Mbps</strong>
                  </span>
                );
              })}
            </div>
          </div>
          <SparklineCanvas series={aggregateNetSeries} height={155} unit="M" />
        </div>
      </section>

      {/* Interactive SVG Topology Map & Live Passive vs Active Stream */}
      <section className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* SVG Topology */}
        <div className="xl:col-span-7 bg-[#111827] border border-[#1f2937] rounded-lg p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">
                Mapa Topológico Interactivo (WAN → Core → VLANs)
              </h3>
              <p className="text-[11px] text-slate-400">
                Haz clic en cualquier nodo para abrir su vista &quot;Latest Data&quot;
              </p>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-slate-400 font-mono">
              <span className="text-emerald-400">■ UP</span>
              <span className="text-amber-400">■ WARN</span>
              <span className="text-rose-400">■ DOWN</span>
              <span className="text-slate-400">■ MANT</span>
            </div>
          </div>
          <NetworkTopologySvg
            hosts={hosts}
            selectedHostId={selectedHostId}
            onSelectHost={onSelectHost}
          />
        </div>

        {/* Live Telemetry Protocol Feed (Passive vs Active/Trap) */}
        <div className="xl:col-span-5 bg-[#111827] border border-[#1f2937] rounded-lg flex flex-col">
          <div className="px-4 py-3 border-b border-[#1f2937] flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                <Activity className="w-4 h-4 text-sky-400 shrink-0" />
                <span>Flujo de Telemetría (Pasivo vs Activo)</span>
              </h3>
              <p className="text-[11px] text-slate-400">
                Observa quién inicia la conexión: NOC Poller o Agente/Trap
              </p>
            </div>

            <div className="inline-flex bg-[#0b0f19] border border-[#1f2937] rounded p-0.5 text-[11px]">
              <button
                type="button"
                onClick={() => setFeedFilter('all')}
                className={`px-2 py-1 rounded transition-colors ${
                  feedFilter === 'all' ? 'bg-[#1f2937] text-slate-100' : 'text-slate-400'
                }`}
              >
                Todos
              </button>
              <button
                type="button"
                onClick={() => setFeedFilter('passive')}
                className={`px-2 py-1 rounded transition-colors ${
                  feedFilter === 'passive' ? 'bg-sky-500/20 text-sky-300' : 'text-slate-400'
                }`}
              >
                Pasivo
              </button>
              <button
                type="button"
                onClick={() => setFeedFilter('active')}
                className={`px-2 py-1 rounded transition-colors ${
                  feedFilter === 'active'
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'text-slate-400'
                }`}
              >
                Activo/Trap
              </button>
            </div>
          </div>

          <div className="divide-y divide-[#1f2937] max-h-[375px] overflow-y-auto">
            {filteredFeed.slice(0, 14).map((ev) => {
              const isPush = ev.direction === 'HOST → NOC';
              return (
                <div
                  key={ev.id}
                  className="px-3.5 py-2.5 text-xs hover:bg-[#1f2937]/30 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {isPush ? (
                        <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      ) : (
                        <ArrowDownLeft className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                      )}
                      <span
                        className={`font-mono text-[11px] font-semibold whitespace-nowrap ${
                          ev.mechanism === 'SNMP Trap'
                            ? 'text-rose-300'
                            : isPush
                            ? 'text-emerald-300'
                            : 'text-sky-300'
                        }`}
                      >
                        {ev.direction}
                      </span>
                      <span className="text-slate-600" aria-hidden="true">
                        ·
                      </span>
                      <button
                        type="button"
                        onClick={() => onSelectHost(ev.hostId)}
                        className="font-mono font-medium text-slate-200 hover:text-sky-300 truncate"
                      >
                        {ev.hostname}
                      </button>
                    </div>
                    <span className="font-mono tabular-nums text-[11px] text-slate-500 shrink-0">
                      {formatTimeHms(ev.ts)}
                    </span>
                  </div>

                  <div className="mt-1 flex items-center justify-between gap-2 text-[11px]">
                    <span className="text-slate-400 truncate">{ev.summary}</span>
                    <button
                      type="button"
                      onClick={() => onExecuteNow(ev.hostId)}
                      title="Forzar polleo pasivo inmediato (Execute Now)"
                      className="text-slate-400 hover:text-sky-300 inline-flex items-center gap-1 shrink-0"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span className="font-mono">{ev.protocol}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
};
