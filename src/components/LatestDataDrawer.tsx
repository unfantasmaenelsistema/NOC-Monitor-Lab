import React from 'react';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  RotateCcw,
  Trash2,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import { formatTimeHms, formatUptime } from '../engine/telemetryEngine';
import { AnomalyKind, Host } from '../types/noc';
import { SparklineCanvas } from './SparklineCanvas';

interface LatestDataDrawerProps {
  host: Host | null;
  onClose: () => void;
  onExecuteNow: (hostId: string) => void;
  onInjectAnomaly: (hostId: string, kind: AnomalyKind) => void;
  onRecoverHost: (hostId: string) => void;
  onToggleMaintenance: (hostId: string) => void;
  onRemoveCustomSnmpItem?: (hostId: string, itemId: string) => void;
}

export const LatestDataDrawer: React.FC<LatestDataDrawerProps> = ({
  host,
  onClose,
  onExecuteNow,
  onInjectAnomaly,
  onRecoverHost,
  onToggleMaintenance,
  onRemoveCustomSnmpItem,
}) => {
  if (!host) return null;

  const prev = host.history[host.history.length - 2] ?? host.history[0];
  const m = host.metrics;

  const deltaStr = (curr: number, before: number | undefined, unit: string) => {
    if (before === undefined) return '0.0';
    const d = curr - before;
    const sign = d > 0 ? '+' : '';
    return `${sign}${d.toFixed(1)}${unit}`;
  };

  const items = [
    {
      category: 'Sistema & Disponibilidad',
      name: 'System Uptime (sysUpTime)',
      keyOrOid: '1.3.6.1.2.1.1.3.0',
      checkType: host.checkMode === 'active' ? 'Activo (ZBX)' : 'Pasivo (SNMP/ZBX)',
      isPush: host.checkMode === 'active',
      value: formatUptime(m.sysUpTimeSec),
      change: '+2s',
      ts: host.lastPassivePollAt,
      series: null as number[] | null,
      color: '#38bdf8',
    },
    {
      category: 'CPU & Rendimiento',
      name: 'CPU Utilization',
      keyOrOid: 'system.cpu.util[,avg1]',
      checkType: host.checkMode === 'passive' ? 'Pasivo (Polling)' : 'Activo (Agente)',
      isPush: host.checkMode !== 'passive',
      value: `${m.cpu.toFixed(1)} %`,
      change: deltaStr(m.cpu, prev?.cpu, '%'),
      ts: host.lastActivePushAt ?? host.lastPassivePollAt,
      series: host.history.map((pt) => pt.cpu),
      color: m.cpu > 85 ? '#ef4444' : m.cpu > 70 ? '#f59e0b' : '#38bdf8',
    },
    {
      category: 'Memoria',
      name: `Memoria RAM Usada (${m.ramTotalGb} GB total)`,
      keyOrOid: 'vm.memory.size[pused]',
      checkType: host.checkMode === 'passive' ? 'Pasivo (SNMP/ZBX)' : 'Activo (Agente)',
      isPush: host.checkMode !== 'passive',
      value: `${m.ramUsedGb} GB (${m.ramPct.toFixed(1)} %)`,
      change: deltaStr(m.ramPct, prev?.ramPct, '%'),
      ts: host.lastActivePushAt ?? host.lastPassivePollAt,
      series: host.history.map((pt) => pt.ramPct),
      color: m.ramPct > 88 ? '#ef4444' : '#a78bfa',
    },
    {
      category: 'Almacenamiento',
      name: `Volumen Principal (${m.diskTotalTb} TB)`,
      keyOrOid: 'vfs.fs.size[/,pused]',
      checkType: 'Pasivo (Polling)',
      isPush: false,
      value: `${m.diskUsedTb} TB (${m.diskPct.toFixed(1)} %)`,
      change: deltaStr(m.diskPct, prev?.diskPct, '%'),
      ts: host.lastPassivePollAt,
      series: host.history.map((pt) => pt.diskPct),
      color: m.diskPct >= 90 ? '#ef4444' : '#10b981',
    },
    {
      category: 'Interfaces de Red',
      name: `Tráfico Entrante (${m.netInterface})`,
      keyOrOid: `net.if.in[${m.netInterface}] · 1.3.6.1.2.1.2.2.1.10`,
      checkType: 'Pasivo (SNMP/ZBX)',
      isPush: false,
      value: `${m.netInMbps.toFixed(1)} Mbps`,
      change: deltaStr(m.netInMbps, prev?.netInMbps, 'M'),
      ts: host.lastPassivePollAt,
      series: host.history.map((pt) => pt.netInMbps),
      color: '#10b981',
    },
    {
      category: 'Interfaces de Red',
      name: `Tráfico Saliente (${m.netInterface})`,
      keyOrOid: `net.if.out[${m.netInterface}] · 1.3.6.1.2.1.2.2.1.16`,
      checkType: 'Pasivo (SNMP/ZBX)',
      isPush: false,
      value: `${m.netOutMbps.toFixed(1)} Mbps`,
      change: deltaStr(m.netOutMbps, prev?.netOutMbps, 'M'),
      ts: host.lastPassivePollAt,
      series: host.history.map((pt) => pt.netOutMbps),
      color: '#38bdf8',
    },
    {
      category: 'ICMP / Conectividad',
      name: 'ICMP Response Time (RTT)',
      keyOrOid: 'icmppingsec',
      checkType: 'Pasivo (Poller ICMP)',
      isPush: false,
      value: `${m.icmpLatencyMs.toFixed(2)} ms`,
      change: deltaStr(m.icmpLatencyMs, prev?.latencyMs, 'ms'),
      ts: host.lastPassivePollAt,
      series: host.history.map((pt) => pt.latencyMs),
      color: m.icmpLatencyMs > 45 ? '#f59e0b' : '#2dd4bf',
    },
    {
      category: 'ICMP / Conectividad',
      name: 'ICMP Packet Loss',
      keyOrOid: 'icmppingloss',
      checkType: 'Pasivo (Poller ICMP)',
      isPush: false,
      value: `${m.packetLossPct.toFixed(1)} %`,
      change: deltaStr(m.packetLossPct, prev?.packetLossPct, '%'),
      ts: host.lastPassivePollAt,
      series: host.history.map((pt) => pt.packetLossPct),
      color: m.packetLossPct > 0 ? '#ef4444' : '#10b981',
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-label={`Latest Data de ${host.hostname}`}
    >
      <div className="w-full max-w-4xl bg-[#111827] border-l border-[#1f2937] h-full flex flex-col shadow-2xl">
        {/* Drawer Header */}
        <div className="px-5 py-4 border-b border-[#1f2937] flex flex-wrap items-center justify-between gap-4 bg-[#0b0f19]">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <h3 className="text-base font-semibold font-mono text-slate-100 truncate">
                {host.hostname}
              </h3>
              <span
                className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded ${
                  host.status === 'UP'
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : host.status === 'WARNING'
                    ? 'bg-amber-500/20 text-amber-300'
                    : host.status === 'DOWN'
                    ? 'bg-rose-500/20 text-rose-300'
                    : 'bg-slate-600/30 text-slate-300'
                }`}
              >
                {host.status}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5 font-mono">
              {host.ip} · {host.vendorOs} · {host.snmpMeta.sysLocation}
            </p>
            <p className="text-[11px] text-slate-500 font-mono">
              Contacto: {host.snmpMeta.sysContact}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onExecuteNow(host.id)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-sky-600 hover:bg-sky-500 text-white transition-colors whitespace-nowrap"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Execute Now</span>
            </button>

            <button
              type="button"
              onClick={() => onToggleMaintenance(host.id)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-[#1f2937] bg-[#111827] hover:bg-[#1f2937] text-slate-200 transition-colors whitespace-nowrap"
            >
              <Wrench className="w-3.5 h-3.5 text-amber-400" />
              <span>{host.status === 'MAINTENANCE' ? 'Salir Mant.' : 'Mantenimiento'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar panel Latest Data"
              className="p-1.5 rounded-md text-slate-400 hover:text-slate-100 hover:bg-[#1f2937] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Quick Lab Controls for this Host */}
        <div className="px-5 py-2.5 border-b border-[#1f2937] bg-[#111827] flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-slate-400 font-medium flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 text-rose-400" />
              <span>Pruebas en {host.hostname}:</span>
            </span>
            <button
              type="button"
              onClick={() => onInjectAnomaly(host.id, 'cpu_spike')}
              className="px-2 py-1 rounded border border-[#1f2937] bg-[#0b0f19] hover:border-rose-500/50 text-slate-300 text-[11px]"
            >
              Pico CPU
            </button>
            <button
              type="button"
              onClick={() => onInjectAnomaly(host.id, 'net_saturation')}
              className="px-2 py-1 rounded border border-[#1f2937] bg-[#0b0f19] hover:border-amber-500/50 text-slate-300 text-[11px]"
            >
              Saturación Red
            </button>
            <button
              type="button"
              onClick={() => onInjectAnomaly(host.id, 'packet_loss')}
              className="px-2 py-1 rounded border border-[#1f2937] bg-[#0b0f19] hover:border-amber-500/50 text-slate-300 text-[11px]"
            >
              Packet Loss
            </button>
            <button
              type="button"
              onClick={() => onInjectAnomaly(host.id, 'host_down')}
              className="px-2 py-1 rounded border border-[#1f2937] bg-[#0b0f19] hover:border-rose-500/50 text-rose-300 text-[11px]"
            >
              Caída Total
            </button>
          </div>

          {host.activeAnomaly && (
            <button
              type="button"
              onClick={() => onRecoverHost(host.id)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30 font-medium text-[11px]"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Recuperar Host</span>
            </button>
          )}
        </div>

        {/* Latest Data Table */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
            <span>
              Último polleo pasivo:{' '}
              <strong className="font-mono tabular-nums text-sky-300">
                {formatTimeHms(host.lastPassivePollAt)}
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Último push activo:{' '}
              <strong className="font-mono tabular-nums text-emerald-300">
                {host.lastActivePushAt ? formatTimeHms(host.lastActivePushAt) : 'N/A (Solo Pasivo)'}
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Intervalo de consulta:{' '}
              <strong className="font-mono tabular-nums text-slate-200">
                {host.pollingIntervalSec}s
              </strong>
            </span>
          </div>

          <div className="border border-[#1f2937] rounded-lg overflow-hidden bg-[#0b0f19]">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#1f2937] bg-[#111827] text-slate-400">
                  <th className="text-left font-medium px-3.5 py-2.5">Métrica / Ítem</th>
                  <th className="text-left font-medium px-3.5 py-2.5">Mecanismo</th>
                  <th className="text-right font-medium px-3.5 py-2.5">Último Valor</th>
                  <th className="text-right font-medium px-3.5 py-2.5">Cambio</th>
                  <th className="text-left font-medium px-3.5 py-2.5 w-36">Tendencia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1f2937]">
                {items.map((item) => (
                  <tr key={item.name} className="hover:bg-[#111827]/70 transition-colors">
                    <td className="px-3.5 py-2.5">
                      <div className="font-medium text-slate-200">{item.name}</div>
                      <div className="font-mono text-[11px] text-slate-500 mt-0.5">
                        {item.keyOrOid}
                      </div>
                    </td>
                    <td className="px-3.5 py-2.5 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 text-[11px] font-medium ${
                          item.isPush ? 'text-emerald-300' : 'text-sky-300'
                        }`}
                      >
                        {item.isPush ? (
                          <ArrowUpRight className="w-3 h-3 shrink-0" />
                        ) : (
                          <ArrowDownLeft className="w-3 h-3 shrink-0" />
                        )}
                        <span>{item.checkType}</span>
                      </span>
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-mono tabular-nums font-semibold text-slate-100 whitespace-nowrap">
                      {item.value}
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-mono tabular-nums text-slate-400 whitespace-nowrap">
                      {item.change}
                    </td>
                    <td className="px-3.5 py-2">
                      {item.series ? (
                        <SparklineCanvas
                          series={[{ label: item.name, color: item.color, data: item.series }]}
                          height={36}
                          showGrid={false}
                        />
                      ) : (
                        <span className="text-[11px] font-mono text-slate-500">Contador lineal</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {host.customSnmpItems.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-slate-200">
                Ítems SNMP Personalizados Vinculados ({host.customSnmpItems.length})
              </h4>
              <div className="border border-[#1f2937] rounded-lg overflow-hidden bg-[#0b0f19]">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[#1f2937] bg-[#111827] text-slate-400">
                      <th className="text-left font-medium px-3.5 py-2">Objeto / OID</th>
                      <th className="text-left font-medium px-3 py-2">Tipo</th>
                      <th className="text-right font-medium px-3 py-2">Último Valor</th>
                      <th className="text-left font-medium px-3 py-2 w-36">Tendencia</th>
                      <th className="text-right font-medium px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1f2937]">
                    {host.customSnmpItems.map((item) => (
                      <tr key={item.id} className="hover:bg-[#111827]/70">
                        <td className="px-3.5 py-2">
                          <div className="font-mono font-medium text-sky-300">{item.name}</div>
                          <div className="font-mono text-[11px] text-slate-500">{item.oid}</div>
                        </td>
                        <td className="px-3 py-2 font-mono text-[11px] text-slate-400">
                          {item.dataType}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold text-emerald-300 whitespace-nowrap">
                          {item.lastFormattedValue}
                        </td>
                        <td className="px-3 py-1.5">
                          <SparklineCanvas
                            series={[{ label: item.name, color: '#38bdf8', data: item.history }]}
                            height={34}
                            showGrid={false}
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          {onRemoveCustomSnmpItem && (
                            <button
                              type="button"
                              onClick={() => onRemoveCustomSnmpItem(host.id, item.id)}
                              title="Eliminar ítem personalizado"
                              className="p-1 rounded text-slate-400 hover:text-rose-400"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {host.status === 'DOWN' && (
            <div className="p-3.5 rounded-md border border-rose-500/40 bg-rose-950/20 flex items-center gap-2.5 text-xs text-rose-200">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>
                El host no responde a las sondas ICMP ni a consultas SNMP/ZBX. Verifica enlaces
                aguas arriba en el mapa topológico o utiliza &quot;Recuperar Host&quot; para
                restaurar la conectividad simulada.
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
