import React, { useMemo, useState } from 'react';
import {
  Activity,
  Edit3,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import { formatUptime } from '../engine/telemetryEngine';
import {
  CheckMode,
  Host,
  HostGroup,
  HostStatus,
  InterfaceAvailability,
  InterfaceProtocol,
} from '../types/noc';
import { HostFormModal } from './HostFormModal';

interface HostInventoryViewProps {
  hosts: Host[];
  onSelectHost: (hostId: string) => void;
  onExecuteNow: (hostId: string) => void;
  onUpsertHost: (host: Host) => void;
  onDeleteHost: (hostId: string) => void;
}

const CORE_PROTOCOLS: InterfaceProtocol[] = ['ZBX', 'SNMP', 'ICMP', 'HTTP'];

function availabilityBadgeStyle(avail: InterfaceAvailability | null): string {
  switch (avail) {
    case 'available':
      return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
    case 'degraded':
      return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
    case 'unavailable':
      return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
    case 'disabled':
      return 'bg-slate-700/40 text-slate-400 border-slate-600/40';
    default:
      return 'bg-[#0b0f19] text-slate-600 border-[#1f2937]';
  }
}

function statusTextBadge(status: HostStatus): string {
  switch (status) {
    case 'UP':
      return 'text-emerald-400';
    case 'WARNING':
      return 'text-amber-400';
    case 'DOWN':
      return 'text-rose-400';
    case 'MAINTENANCE':
      return 'text-slate-400';
  }
}

export const HostInventoryView: React.FC<HostInventoryViewProps> = ({
  hosts,
  onSelectHost,
  onExecuteNow,
  onUpsertHost,
  onDeleteHost,
}) => {
  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState<'ALL' | HostGroup>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | HostStatus>('ALL');
  const [modeFilter, setModeFilter] = useState<'ALL' | CheckMode>('ALL');
  const [polledId, setPolledId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingHost, setEditingHost] = useState<Host | null>(null);

  const filteredHosts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return hosts.filter((h) => {
      if (groupFilter !== 'ALL' && h.group !== groupFilter) return false;
      if (statusFilter !== 'ALL' && h.status !== statusFilter) return false;
      if (modeFilter !== 'ALL' && h.checkMode !== modeFilter) return false;
      if (
        q &&
        !h.hostname.toLowerCase().includes(q) &&
        !h.ip.toLowerCase().includes(q) &&
        !h.vendorOs.toLowerCase().includes(q) &&
        !h.role.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [hosts, search, groupFilter, statusFilter, modeFilter]);

  const handleManualPoll = (e: React.MouseEvent, hostId: string) => {
    e.stopPropagation();
    onExecuteNow(hostId);
    setPolledId(hostId);
    window.setTimeout(() => {
      setPolledId((curr) => (curr === hostId ? null : curr));
    }, 900);
  };

  return (
    <div className="space-y-4">
      {/* Header & Primary Action */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-100 tracking-tight">
            Inventario de Hosts y Disponibilidad
          </h2>
          <p className="text-xs text-slate-400">
            Haz clic en cualquier fila para inspeccionar &quot;Latest Data&quot; o fuerza un polleo
            manual con &quot;Execute Now&quot;
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setEditingHost(null);
            setModalOpen(true);
          }}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Nuevo Host</span>
        </button>
      </div>

      {/* Filters Toolbar */}
      <div className="bg-[#111827] border border-[#1f2937] rounded-lg p-3 flex flex-wrap items-center gap-3 text-xs">
        <div className="relative flex-1 min-w-[210px]">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtrar por hostname, IP, sistema o rol..."
            className="w-full pl-8 pr-3 py-1.5 rounded bg-[#0b0f19] border border-[#1f2937] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
          />
        </div>

        <select
          aria-label="Filtrar por grupo"
          value={groupFilter}
          onChange={(e) => setGroupFilter(e.target.value as 'ALL' | HostGroup)}
          className="px-2.5 py-1.5 rounded bg-[#0b0f19] border border-[#1f2937] text-slate-200 focus:outline-none focus:border-sky-500"
        >
          <option value="ALL">Todos los grupos</option>
          <option value="Seguridad">Seguridad</option>
          <option value="Networking">Networking</option>
          <option value="Servidores">Servidores</option>
          <option value="Almacenamiento">Almacenamiento</option>
        </select>

        <select
          aria-label="Filtrar por estado"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'ALL' | HostStatus)}
          className="px-2.5 py-1.5 rounded bg-[#0b0f19] border border-[#1f2937] text-slate-200 focus:outline-none focus:border-sky-500"
        >
          <option value="ALL">Todos los estados</option>
          <option value="UP">UP</option>
          <option value="WARNING">WARNING</option>
          <option value="DOWN">DOWN</option>
          <option value="MAINTENANCE">MAINTENANCE</option>
        </select>

        <select
          aria-label="Filtrar por modo de chequeo"
          value={modeFilter}
          onChange={(e) => setModeFilter(e.target.value as 'ALL' | CheckMode)}
          className="px-2.5 py-1.5 rounded bg-[#0b0f19] border border-[#1f2937] text-slate-200 focus:outline-none focus:border-sky-500"
        >
          <option value="ALL">Modo: Todos</option>
          <option value="passive">Pasivo (Polling)</option>
          <option value="active">Activo (Agente)</option>
          <option value="mixed">Mixto</option>
        </select>

        <span className="text-slate-400 font-mono tabular-nums ml-auto">
          Mostrando {filteredHosts.length} / {hosts.length}
        </span>
      </div>

      {/* Host Table */}
      <div className="bg-[#111827] border border-[#1f2937] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#1f2937] bg-[#0b0f19] text-slate-400">
                <th className="text-left font-medium px-3.5 py-2.5 whitespace-nowrap">Host</th>
                <th className="text-left font-medium px-3 py-2.5 whitespace-nowrap">IP / Grupo</th>
                <th className="text-left font-medium px-3 py-2.5 whitespace-nowrap">
                  Disponibilidad Interfaces
                </th>
                <th className="text-left font-medium px-3 py-2.5 whitespace-nowrap">
                  Chequeo
                </th>
                <th className="text-right font-medium px-3 py-2.5 whitespace-nowrap">CPU</th>
                <th className="text-right font-medium px-3 py-2.5 whitespace-nowrap">RAM</th>
                <th className="text-right font-medium px-3 py-2.5 whitespace-nowrap">
                  Tráfico In/Out
                </th>
                <th className="text-right font-medium px-3 py-2.5 whitespace-nowrap">RTT / Loss</th>
                <th className="text-left font-medium px-3 py-2.5 whitespace-nowrap">Estado</th>
                <th className="text-right font-medium px-3.5 py-2.5 whitespace-nowrap">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1f2937]">
              {filteredHosts.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-slate-400">
                    No hay hosts que coincidan con los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                filteredHosts.map((host) => {
                  const isRecentlyPolled = polledId === host.id;
                  return (
                    <tr
                      key={host.id}
                      onClick={() => onSelectHost(host.id)}
                      className="hover:bg-[#1f2937]/45 transition-colors cursor-pointer"
                    >
                      <td className="px-3.5 py-2.5">
                        <div className="font-mono font-semibold text-sky-300 hover:underline">
                          {host.hostname}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate max-w-[200px]">
                          {host.vendorOs} · {host.role}
                        </div>
                      </td>

                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <div className="font-mono tabular-nums text-slate-200">{host.ip}</div>
                        <div className="text-[11px] text-slate-400">{host.group}</div>
                      </td>

                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          {CORE_PROTOCOLS.map((proto) => {
                            const iface = host.interfaces.find((i) => i.protocol === proto);
                            const avail = iface ? iface.availability : null;
                            const stateLabel =
                              avail === 'available'
                                ? 'Disponible'
                                : avail === 'degraded'
                                ? 'Degradado'
                                : avail === 'unavailable'
                                ? 'No disponible'
                                : avail === 'disabled'
                                ? 'Mantenimiento'
                                : 'No configurado';
                            return (
                              <span
                                key={proto}
                                title={`${proto}: ${stateLabel}${iface ? ` (${iface.label})` : ''}`}
                                className={`px-1.5 py-0.5 rounded border text-[10px] font-mono font-bold ${availabilityBadgeStyle(
                                  avail
                                )}`}
                              >
                                {proto}
                              </span>
                            );
                          })}
                        </div>
                      </td>

                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <div className="text-[11px] text-slate-200">
                          {host.checkMode === 'passive'
                            ? 'Pasivo'
                            : host.checkMode === 'active'
                            ? 'Activo'
                            : 'Mixto'}
                        </div>
                        <div className="font-mono tabular-nums text-[10px] text-slate-500">
                          cada {host.pollingIntervalSec}s · Up {formatUptime(host.metrics.sysUpTimeSec)}
                        </div>
                      </td>

                      <td
                        className={`px-3 py-2.5 text-right font-mono tabular-nums whitespace-nowrap font-semibold ${
                          host.metrics.cpu > 85
                            ? 'text-rose-400'
                            : host.metrics.cpu > 72
                            ? 'text-amber-300'
                            : 'text-slate-200'
                        }`}
                      >
                        {host.metrics.cpu.toFixed(1)}%
                      </td>

                      <td
                        className={`px-3 py-2.5 text-right font-mono tabular-nums whitespace-nowrap ${
                          host.metrics.ramPct > 88 ? 'text-rose-400 font-semibold' : 'text-slate-300'
                        }`}
                      >
                        {host.metrics.ramPct.toFixed(0)}%
                      </td>

                      <td className="px-3 py-2.5 text-right font-mono tabular-nums whitespace-nowrap text-slate-300">
                        <span className="text-emerald-300">
                          {Math.round(host.metrics.netInMbps)}
                        </span>
                        <span className="text-slate-600 mx-1">/</span>
                        <span className="text-sky-300">{Math.round(host.metrics.netOutMbps)}</span>
                        <span className="text-[10px] text-slate-500 ml-1">M</span>
                      </td>

                      <td className="px-3 py-2.5 text-right font-mono tabular-nums whitespace-nowrap">
                        <span
                          className={
                            host.metrics.icmpLatencyMs > 45 ? 'text-amber-300' : 'text-slate-300'
                          }
                        >
                          {host.metrics.icmpLatencyMs.toFixed(1)}ms
                        </span>
                        <span className="text-slate-600 mx-1">/</span>
                        <span
                          className={
                            host.metrics.packetLossPct > 0 ? 'text-rose-400 font-bold' : 'text-slate-500'
                          }
                        >
                          {host.metrics.packetLossPct}%
                        </span>
                      </td>

                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className={`font-mono font-semibold text-xs ${statusTextBadge(host.status)}`}>
                          {host.status}
                        </span>
                      </td>

                      <td
                        className="px-3.5 py-2.5 text-right whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={(e) => handleManualPoll(e, host.id)}
                            title="Forzar consulta pasiva inmediata (Execute Now)"
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded border text-[11px] font-medium transition-colors ${
                              isRecentlyPolled
                                ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                                : 'bg-[#0b0f19] border-[#1f2937] hover:border-sky-500/50 text-sky-300'
                            }`}
                          >
                            <RefreshCw
                              className={`w-3 h-3 ${isRecentlyPolled ? 'animate-spin' : ''}`}
                            />
                            <span>{isRecentlyPolled ? 'Polled' : 'Execute Now'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => onSelectHost(host.id)}
                            title="Ver Latest Data"
                            className="p-1.5 rounded border border-[#1f2937] bg-[#0b0f19] hover:bg-[#1f2937] text-slate-300"
                          >
                            <Activity className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setEditingHost(host);
                              setModalOpen(true);
                            }}
                            title="Editar Host"
                            className="p-1.5 rounded border border-[#1f2937] bg-[#0b0f19] hover:bg-[#1f2937] text-slate-300"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>

                          {hosts.length > 1 && (
                            <button
                              type="button"
                              onClick={() => onDeleteHost(host.id)}
                              title="Eliminar Host"
                              className="p-1.5 rounded border border-[#1f2937] bg-[#0b0f19] hover:border-rose-500/50 text-slate-400 hover:text-rose-400"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <HostFormModal
          initialHost={editingHost}
          existingHosts={hosts}
          onSave={onUpsertHost}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
};
