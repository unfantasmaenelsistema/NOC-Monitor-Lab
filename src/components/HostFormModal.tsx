import React, { useState } from 'react';
import { X } from 'lucide-react';
import {
  CheckMode,
  Host,
  HostGroup,
  HostInterface,
  InterfaceProtocol,
} from '../types/noc';

interface HostFormModalProps {
  initialHost: Host | null;
  existingHosts: Host[];
  onSave: (host: Host) => void;
  onClose: () => void;
}

const GROUPS: HostGroup[] = ['Seguridad', 'Networking', 'Servidores', 'Almacenamiento'];
const PROTOCOLS: Array<{ protocol: InterfaceProtocol; defaultPort: number; defaultLabel: string }> = [
  { protocol: 'ZBX', defaultPort: 10050, defaultLabel: 'Zabbix Agent' },
  { protocol: 'SNMP', defaultPort: 161, defaultLabel: 'SNMPv2c/v3' },
  { protocol: 'ICMP', defaultPort: 0, defaultLabel: 'ICMP Echo' },
  { protocol: 'HTTP', defaultPort: 443, defaultLabel: 'HTTP Check' },
];

export const HostFormModal: React.FC<HostFormModalProps> = ({
  initialHost,
  existingHosts,
  onSave,
  onClose,
}) => {
  const isEditing = Boolean(initialHost);

  const [hostname, setHostname] = useState(initialHost?.hostname ?? '');
  const [ip, setIp] = useState(initialHost?.ip ?? '10.0.50.');
  const [role, setRole] = useState(initialHost?.role ?? 'Servidor de Aplicaciones');
  const [vendorOs, setVendorOs] = useState(initialHost?.vendorOs ?? 'Ubuntu 24.04 LTS');
  const [group, setGroup] = useState<HostGroup>(initialHost?.group ?? 'Servidores');
  const [checkMode, setCheckMode] = useState<CheckMode>(initialHost?.checkMode ?? 'passive');
  const [pollingIntervalSec, setPollingIntervalSec] = useState<number>(
    initialHost?.pollingIntervalSec ?? 15
  );
  const [parentId, setParentId] = useState<string>(initialHost?.parentId ?? 'sw-core-01');
  const [netInterface, setNetInterface] = useState<string>(
    initialHost?.metrics.netInterface ?? 'eth0'
  );

  const [enabledProtocols, setEnabledProtocols] = useState<InterfaceProtocol[]>(
    initialHost
      ? initialHost.interfaces.map((i) => i.protocol)
      : ['ZBX', 'ICMP']
  );

  const [error, setError] = useState<string>('');

  const toggleProtocol = (proto: InterfaceProtocol) => {
    setEnabledProtocols((prev) =>
      prev.includes(proto) ? prev.filter((p) => p !== proto) : [...prev, proto]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanHost = hostname.trim().toUpperCase();
    const cleanIp = ip.trim();
    if (!cleanHost) {
      setError('El nombre de host es obligatorio.');
      return;
    }
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(cleanIp)) {
      setError('Introduce una dirección IPv4 válida (ej. 10.0.50.10).');
      return;
    }
    if (enabledProtocols.length === 0) {
      setError('Selecciona al menos una interfaz de monitorización (ZBX, SNMP, ICMP o HTTP).');
      return;
    }

    const now = Date.now();
    const interfaces: HostInterface[] = enabledProtocols.map((proto) => {
      const existing = initialHost?.interfaces.find((i) => i.protocol === proto);
      if (existing) {
        return {
          ...existing,
          checkMode:
            proto === 'ZBX' && checkMode === 'active'
              ? 'active'
              : proto === 'ZBX' && checkMode === 'mixed'
              ? 'active'
              : 'passive',
        };
      }
      const meta = PROTOCOLS.find((p) => p.protocol === proto)!;
      return {
        protocol: proto,
        label:
          proto === 'ZBX'
            ? checkMode === 'active'
              ? 'ZBX Agent Activo'
              : checkMode === 'mixed'
              ? 'ZBX Pasivo/Activo'
              : 'ZBX Pasivo'
            : meta.defaultLabel,
        port: proto === 'ZBX' && checkMode === 'active' ? 10051 : meta.defaultPort,
        availability: 'available',
        checkMode: proto === 'ZBX' && checkMode !== 'passive' ? 'active' : 'passive',
        detail: 'Configurado desde Inventario',
      };
    });

    if (initialHost) {
      onSave({
        ...initialHost,
        hostname: cleanHost,
        ip: cleanIp,
        role: role.trim() || initialHost.role,
        vendorOs: vendorOs.trim() || initialHost.vendorOs,
        group,
        checkMode,
        pollingIntervalSec: Math.max(5, Math.min(300, Number(pollingIntervalSec) || 15)),
        parentId: parentId || null,
        interfaces,
        metrics: {
          ...initialHost.metrics,
          netInterface: netInterface.trim() || 'eth0',
        },
      });
    } else {
      const id = `${cleanHost.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${now.toString(36).slice(-4)}`;
      const baseline = {
        cpu: 22,
        ramPct: 45,
        diskPct: 38,
        netInMbps: 48,
        netOutMbps: 34,
        latencyMs: 1.5,
      };
      const history = Array.from({ length: 24 }, (_, i) => ({
        ts: now - (23 - i) * 2000,
        cpu: Number((baseline.cpu + Math.sin(i * 0.4) * 3).toFixed(1)),
        ramPct: baseline.ramPct,
        diskPct: baseline.diskPct,
        netInMbps: Number((baseline.netInMbps + Math.cos(i * 0.5) * 6).toFixed(1)),
        netOutMbps: Number((baseline.netOutMbps + Math.sin(i * 0.5) * 5).toFixed(1)),
        latencyMs: baseline.latencyMs,
        packetLossPct: 0,
      }));

      const newHost: Host = {
        id,
        hostname: cleanHost,
        ip: cleanIp,
        role: role.trim() || 'Nodo de Infraestructura',
        vendorOs: vendorOs.trim() || 'Linux',
        group,
        checkMode,
        pollingIntervalSec: Math.max(5, Math.min(300, Number(pollingIntervalSec) || 15)),
        lastPassivePollAt: now,
        lastActivePushAt: checkMode !== 'passive' ? now : null,
        status: 'UP',
        activeAnomaly: null,
        parentId: parentId || 'sw-core-01',
        interfaces,
        baseline,
        metrics: {
          cpu: baseline.cpu,
          ramUsedGb: 7.2,
          ramTotalGb: 16,
          ramPct: baseline.ramPct,
          diskPct: baseline.diskPct,
          diskUsedTb: 0.38,
          diskTotalTb: 1.0,
          netInterface: netInterface.trim() || 'eth0',
          netInMbps: baseline.netInMbps,
          netOutMbps: baseline.netOutMbps,
          icmpLatencyMs: baseline.latencyMs,
          packetLossPct: 0,
          sysUpTimeSec: 120,
        },
        snmpMeta: {
          communityRo: 'public',
          communityRw: 'private',
          v3User: 'nocadmin',
          v3AuthPass: 'NocAuth#2026',
          v3PrivKey: 'NocPriv#2026',
          sysContact: 'noc@unfantasmaenelsistema.com',
          sysLocation: 'CPD-Lab (Añadido manualmente)',
          sysObjectID: '.1.3.6.1.4.1.8072.3.2.10',
        },
        customSnmpItems: [],
        history,
      };
      onSave(newHost);
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={isEditing ? 'Editar Host' : 'Crear Nuevo Host'}
    >
      <div className="w-full max-w-lg bg-[#111827] border border-[#1f2937] rounded-lg shadow-2xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#1f2937] flex items-center justify-between bg-[#0b0f19]">
          <h3 className="text-sm font-semibold text-slate-100">
            {isEditing ? `Editar Host: ${initialHost?.hostname}` : 'Nuevo Host en Inventario NOC'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar modal"
            className="p-1 rounded text-slate-400 hover:text-slate-100 hover:bg-[#1f2937]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {error && (
            <div className="p-2.5 rounded bg-rose-950/40 border border-rose-500/40 text-rose-200">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-slate-300 font-medium mb-1">Hostname</label>
              <input
                type="text"
                value={hostname}
                onChange={(e) => setHostname(e.target.value)}
                placeholder="SRV-APP-02"
                className="w-full px-3 py-2 rounded bg-[#0b0f19] border border-[#1f2937] text-slate-100 font-mono focus:outline-none focus:border-sky-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">Dirección IPv4</label>
              <input
                type="text"
                value={ip}
                onChange={(e) => setIp(e.target.value)}
                placeholder="10.0.50.10"
                className="w-full px-3 py-2 rounded bg-[#0b0f19] border border-[#1f2937] text-slate-100 font-mono focus:outline-none focus:border-sky-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">Grupo</label>
              <select
                value={group}
                onChange={(e) => setGroup(e.target.value as HostGroup)}
                className="w-full px-3 py-2 rounded bg-[#0b0f19] border border-[#1f2937] text-slate-100 focus:outline-none focus:border-sky-500"
              >
                {GROUPS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">Modo de Chequeo</label>
              <select
                value={checkMode}
                onChange={(e) => setCheckMode(e.target.value as CheckMode)}
                className="w-full px-3 py-2 rounded bg-[#0b0f19] border border-[#1f2937] text-slate-100 focus:outline-none focus:border-sky-500"
              >
                <option value="passive">Pasivo (Polling NOC → Host)</option>
                <option value="active">Activo (Agente Host → NOC)</option>
                <option value="mixed">Mixto (Pasivo + Activo/Trap)</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">Sistema / Fabricante</label>
              <input
                type="text"
                value={vendorOs}
                onChange={(e) => setVendorOs(e.target.value)}
                className="w-full px-3 py-2 rounded bg-[#0b0f19] border border-[#1f2937] text-slate-100 focus:outline-none focus:border-sky-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">Función / Rol</label>
              <input
                type="text"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full px-3 py-2 rounded bg-[#0b0f19] border border-[#1f2937] text-slate-100 focus:outline-none focus:border-sky-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">
                Intervalo Polleo (seg)
              </label>
              <input
                type="number"
                min={5}
                max={300}
                value={pollingIntervalSec}
                onChange={(e) => setPollingIntervalSec(Number(e.target.value))}
                className="w-full px-3 py-2 rounded bg-[#0b0f19] border border-[#1f2937] text-slate-100 font-mono focus:outline-none focus:border-sky-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">
                Interfaz Red Principal
              </label>
              <input
                type="text"
                value={netInterface}
                onChange={(e) => setNetInterface(e.target.value)}
                placeholder="eth0"
                className="w-full px-3 py-2 rounded bg-[#0b0f19] border border-[#1f2937] text-slate-100 font-mono focus:outline-none focus:border-sky-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">
              Nodo Padre en Topología
            </label>
            <select
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              className="w-full px-3 py-2 rounded bg-[#0b0f19] border border-[#1f2937] text-slate-100 font-mono focus:outline-none focus:border-sky-500"
            >
              <option value="">Raíz WAN (Sin padre)</option>
              {existingHosts
                .filter((h) => h.id !== initialHost?.id)
                .map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.hostname} ({h.ip})
                  </option>
                ))}
            </select>
          </div>

          <div>
            <span className="block text-slate-300 font-medium mb-2">
              Interfaces de Monitorización Habilitadas
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {PROTOCOLS.map((p) => {
                const active = enabledProtocols.includes(p.protocol);
                return (
                  <button
                    key={p.protocol}
                    type="button"
                    onClick={() => toggleProtocol(p.protocol)}
                    className={`px-3 py-2 rounded border text-center font-mono font-semibold transition-colors ${
                      active
                        ? 'bg-sky-500/20 border-sky-500/60 text-sky-300'
                        : 'bg-[#0b0f19] border-[#1f2937] text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {p.protocol}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-3 border-t border-[#1f2937] flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded border border-[#1f2937] text-slate-300 hover:bg-[#1f2937] transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded bg-sky-600 hover:bg-sky-500 text-white font-semibold transition-colors"
            >
              {isEditing ? 'Guardar Cambios' : 'Crear Host'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
