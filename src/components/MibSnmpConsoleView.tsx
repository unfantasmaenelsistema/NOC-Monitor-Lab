import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FolderTree,
  Play,
  PlusCircle,
  Radio,
  Search,
  Terminal,
  Trash2,
} from 'lucide-react';
import {
  ALL_MIB_NODES,
  findMibNodeByOid,
  MIB_TREE_ROOT,
  MibTreeNode,
  normalizeOid,
} from '../data/mibDatabase';
import {
  buildCliPreview,
  executeSnmpCommand,
  resolveLeafValueForHost,
  SnmpCommandResult,
  SnmpOperation,
  SnmpVersion,
} from '../engine/snmpSimulator';
import { formatTimeHms } from '../engine/telemetryEngine';
import { CustomSnmpItem, Host, SnmpTrapPacket, TrapKind } from '../types/noc';

interface MibSnmpConsoleViewProps {
  hosts: Host[];
  trapLog: SnmpTrapPacket[];
  onAddCustomSnmpItem: (hostId: string, item: CustomSnmpItem) => void;
  onApplySnmpSetMutation: (
    hostId: string,
    field: 'sysContact' | 'sysLocation' | 'hostname',
    value: string
  ) => void;
  onEmitSnmpTrap: (hostId: string, trapKind: TrapKind, version: 'v2c' | 'v3') => void;
  onClearTrapLog: () => void;
  onSelectHostForLatestData: (hostId: string) => void;
  onExecuteNow: (hostId: string) => void;
  onSnmpActivity?: (hostId: string, ok: boolean) => void;
}

const DEFAULT_EXPANDED = new Set<string>([
  '.1',
  '.1.3',
  '.1.3.6',
  '.1.3.6.1',
  '.1.3.6.1.2',
  '.1.3.6.1.2.1',
  '.1.3.6.1.2.1.1',
  '.1.3.6.1.2.1.2',
  '.1.3.6.1.2.1.2.2',
  '.1.3.6.1.2.1.25',
  '.1.3.6.1.4',
  '.1.3.6.1.4.1',
]);

const TRAP_OPTIONS: Array<{ kind: TrapKind; label: string; oid: string }> = [
  { kind: 'linkDown', label: 'linkDown (Interfaz caída)', oid: '.1.3.6.1.6.3.1.1.5.3' },
  { kind: 'coldStart', label: 'coldStart (Reinicio equipo)', oid: '.1.3.6.1.6.3.1.1.5.1' },
  {
    kind: 'authenticationFailure',
    label: 'authenticationFailure (Fuerza bruta community)',
    oid: '.1.3.6.1.6.3.1.1.5.5',
  },
  {
    kind: 'psuRedundantDown',
    label: 'ciscoEnvMonRedundantSupplyNotification (PSU caída)',
    oid: '.1.3.6.1.4.1.9.9.13.3.0.2',
  },
  {
    kind: 'fwSessionThreshold',
    label: 'fgTrapSessionLimit (Saturación sesiones Firewall)',
    oid: '.1.3.6.1.4.1.12356.100.1.3.0.201',
  },
];

export const MibSnmpConsoleView: React.FC<MibSnmpConsoleViewProps> = ({
  hosts,
  trapLog,
  onAddCustomSnmpItem,
  onApplySnmpSetMutation,
  onEmitSnmpTrap,
  onClearTrapLog,
  onSelectHostForLatestData,
  onExecuteNow,
  onSnmpActivity,
}) => {
  const [expandedOids, setExpandedOids] = useState<Set<string>>(() => new Set(DEFAULT_EXPANDED));
  const [treeSearch, setTreeSearch] = useState('');
  const [selectedNode, setSelectedNode] = useState<MibTreeNode>(
    () => findMibNodeByOid('.1.3.6.1.2.1.1.3.0') ?? MIB_TREE_ROOT
  );

  // Console state
  const [targetHostId, setTargetHostId] = useState<string>(
    hosts.find((h) => h.id === 'sw-core-01')?.id ?? hosts[0]?.id ?? ''
  );
  const [operation, setOperation] = useState<SnmpOperation>('snmpget');
  const [version, setVersion] = useState<SnmpVersion>('v2c');
  const [community, setCommunity] = useState('public');
  const [v3User, setV3User] = useState('nocadmin');
  const [v3AuthPass, setV3AuthPass] = useState('NocAuth#2026');
  const [v3PrivKey, setV3PrivKey] = useState('NocPriv#2026');
  const [oidInput, setOidInput] = useState('.1.3.6.1.2.1.1.3.0');
  const [setValue, setSetValue] = useState('CPD-Rack-A2-Core');
  const [lastResult, setLastResult] = useState<SnmpCommandResult | null>(null);
  const [itemCreatedBanner, setItemCreatedBanner] = useState<string | null>(null);

  // Trap generator state
  const [trapHostId, setTrapHostId] = useState<string>(
    hosts.find((h) => h.id === 'sw-core-01')?.id ?? hosts[0]?.id ?? ''
  );
  const [trapKind, setTrapKind] = useState<TrapKind>('linkDown');
  const [trapVersion, setTrapVersion] = useState<'v2c' | 'v3'>('v2c');

  const targetHost = useMemo(
    () => hosts.find((h) => h.id === targetHostId) ?? hosts[0],
    [hosts, targetHostId]
  );

  const cliPreview = useMemo(() => {
    if (!targetHost) return '';
    return buildCliPreview(
      {
        operation,
        version,
        community,
        v3User,
        v3AuthPass,
        v3PrivKey,
        oid: oidInput,
        setValue,
      },
      targetHost
    );
  }, [operation, version, community, v3User, v3AuthPass, v3PrivKey, oidInput, setValue, targetHost]);

  const matchingSearchOids = useMemo(() => {
    const q = treeSearch.trim().toLowerCase();
    if (!q) return null;
    const set = new Set<string>();
    for (const n of ALL_MIB_NODES) {
      if (
        n.name.toLowerCase().includes(q) ||
        n.oid.includes(q) ||
        n.mib.toLowerCase().includes(q)
      ) {
        // Add node and all its prefixes so tree paths remain visible
        const parts = n.oid.slice(1).split('.');
        let acc = '';
        for (const p of parts) {
          acc += `.${p}`;
          set.add(acc);
        }
      }
    }
    return set;
  }, [treeSearch]);

  const toggleExpand = (oid: string) => {
    setExpandedOids((prev) => {
      const next = new Set(prev);
      if (next.has(oid)) next.delete(oid);
      else next.add(oid);
      return next;
    });
  };

  const expandAll = () => {
    setExpandedOids(new Set(ALL_MIB_NODES.map((n) => n.oid)));
  };

  const collapseAll = () => {
    setExpandedOids(new Set(['.1', '.1.3', '.1.3.6', '.1.3.6.1']));
  };

  const handleSelectMibNode = (node: MibTreeNode) => {
    setSelectedNode(node);
    setOidInput(node.oid);
    setItemCreatedBanner(null);
    if (node.isTable) {
      setOperation('snmptable');
    } else if (node.dataType === 'Branch') {
      setOperation('snmpwalk');
    } else if (operation === 'snmptable') {
      setOperation('snmpget');
    }
  };

  const handleRunCommand = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetHost) return;
    setItemCreatedBanner(null);

    const res = executeSnmpCommand(
      {
        operation,
        version,
        community,
        v3User,
        v3AuthPass,
        v3PrivKey,
        oid: oidInput,
        setValue,
      },
      targetHost
    );
    setLastResult(res);
    onSnmpActivity?.(targetHost.id, res.ok);

    if (res.ok && res.mutation) {
      onApplySnmpSetMutation(targetHost.id, res.mutation.field, res.mutation.value);
    } else if (res.ok) {
      onExecuteNow(targetHost.id);
    }
  };

  const handleCreateItemFromOid = () => {
    if (!targetHost) return;
    const normalized = normalizeOid(oidInput);
    const leaf = resolveLeafValueForHost(normalized, targetHost);
    if (!leaf) return;

    const existing = targetHost.customSnmpItems.find((i) => i.oid === leaf.oid);
    const seedVal = leaf.numericValue;
    const item: CustomSnmpItem = {
      id: existing?.id ?? `snmp-item-${Date.now().toString(36)}`,
      oid: leaf.oid,
      name: `${leaf.mib}::${leaf.name}`,
      dataType: leaf.dataType,
      unit: leaf.unit,
      lastNumericValue: seedVal,
      lastFormattedValue: leaf.formattedValue,
      lastPolledAt: Date.now(),
      history: existing
        ? [...existing.history.slice(-29), seedVal]
        : Array.from({ length: 16 }, () => seedVal),
    };
    onAddCustomSnmpItem(targetHost.id, item);
    setItemCreatedBanner(
      `Ítem "${item.name}" (${item.oid}) vinculado a ${targetHost.hostname}. Ya se grafica en Latest Data.`
    );
  };

  const canCreateItem = useMemo(() => {
    if (!targetHost || targetHost.status === 'DOWN') return false;
    const snmpEnabled = targetHost.interfaces.some((i) => i.protocol === 'SNMP');
    if (!snmpEnabled) return false;
    const leaf = resolveLeafValueForHost(oidInput, targetHost);
    return Boolean(leaf);
  }, [targetHost, oidInput]);

  const renderTreeNode = (node: MibTreeNode, depth = 0): React.ReactNode => {
    if (matchingSearchOids && !matchingSearchOids.has(node.oid)) {
      return null;
    }

    const hasChildren = Boolean(node.children && node.children.length > 0);
    const isExpanded = matchingSearchOids ? true : expandedOids.has(node.oid);
    const isSelected = selectedNode.oid === node.oid;

    return (
      <div key={node.oid}>
        <div
          className={`flex items-center gap-1.5 py-1 px-2 rounded text-xs cursor-pointer transition-colors ${
            isSelected
              ? 'bg-sky-500/20 text-sky-200 border border-sky-500/40'
              : 'text-slate-300 hover:bg-[#1f2937]/60 border border-transparent'
          }`}
          style={{ paddingLeft: `${depth * 14 + 8}px` }}
          onClick={() => handleSelectMibNode(node)}
        >
          {hasChildren ? (
            <button
              type="button"
              aria-label={isExpanded ? `Contraer ${node.name}` : `Expandir ${node.name}`}
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand(node.oid);
              }}
              className="p-0.5 text-slate-400 hover:text-slate-100 shrink-0"
            >
              {isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
            </button>
          ) : (
            <span className="w-4 shrink-0" aria-hidden="true" />
          )}

          <span className="font-mono text-[11px] text-slate-500 shrink-0">.{node.subId}</span>
          <span
            className={`font-mono truncate ${
              node.dataType === 'Branch'
                ? 'font-semibold text-slate-200'
                : node.isTable
                ? 'font-semibold text-amber-300'
                : 'text-sky-300'
            }`}
          >
            {node.name}
          </span>
          {node.access === 'Read-Write' && (
            <span className="ml-auto text-[10px] font-mono text-emerald-400 shrink-0">RW</span>
          )}
        </div>

        {hasChildren && isExpanded && (
          <div>{node.children!.map((child) => renderTreeNode(child, depth + 1))}</div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-100 tracking-tight">
            Explorador MIB & Consola SNMP
          </h2>
          <p className="text-xs text-slate-400">
            Jerarquía ISO/IEC · Cliente interactivo net-snmp (v1/v2c/v3) · Receptor asíncrono de
            SNMP Traps UDP/162
          </p>
        </div>
        <div className="text-[11px] font-mono text-slate-400">
          Credenciales Lab: <span className="text-slate-200">RO: public</span> ·{' '}
          <span className="text-emerald-300">RW: private</span> ·{' '}
          <span className="text-sky-300">v3: nocadmin / NocAuth#2026 / NocPriv#2026</span>
        </div>
      </div>

      {/* Main 2-Column Workspace */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        {/* LEFT COLUMN: Hierarchical MIB Tree + Technical OID Sheet */}
        <div className="xl:col-span-5 space-y-4">
          <div className="bg-[#111827] border border-[#1f2937] rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-[#1f2937] flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                <FolderTree className="w-4 h-4 text-sky-400 shrink-0" />
                <span>Árbol MIB Jerárquico (ISO/IEC)</span>
              </div>
              <div className="flex items-center gap-2 text-[11px]">
                <button
                  type="button"
                  onClick={expandAll}
                  className="text-sky-400 hover:text-sky-300"
                >
                  Expandir
                </button>
                <span className="text-slate-600" aria-hidden="true">
                  ·
                </span>
                <button
                  type="button"
                  onClick={collapseAll}
                  className="text-slate-400 hover:text-slate-200"
                >
                  Contraer
                </button>
              </div>
            </div>

            <div className="p-2.5 border-b border-[#1f2937] bg-[#0b0f19]/60">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={treeSearch}
                  onChange={(e) => setTreeSearch(e.target.value)}
                  placeholder="Buscar OID o nombre simbólico (ej. sysUpTime, ifTable, cisco)..."
                  className="w-full pl-8 pr-3 py-1.5 rounded bg-[#0b0f19] border border-[#1f2937] text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>

            <div className="p-2 max-h-[410px] overflow-y-auto space-y-0.5 bg-[#0b0f19]/30">
              {renderTreeNode(MIB_TREE_ROOT)}
            </div>
          </div>

          {/* Selected OID Technical Sheet */}
          <div className="bg-[#111827] border border-[#1f2937] rounded-lg p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[11px] font-mono text-slate-400">{selectedNode.mib}</div>
                <h3 className="text-sm font-semibold font-mono text-sky-300 truncate">
                  {selectedNode.name}
                </h3>
              </div>
              <span
                className={`text-[11px] font-mono font-semibold px-2 py-0.5 rounded shrink-0 ${
                  selectedNode.access === 'Read-Write'
                    ? 'bg-emerald-500/15 text-emerald-300'
                    : selectedNode.access === 'Read-Only'
                    ? 'bg-sky-500/15 text-sky-300'
                    : 'bg-slate-700/40 text-slate-400'
                }`}
              >
                {selectedNode.access}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs bg-[#0b0f19] border border-[#1f2937] rounded p-3">
              <div>
                <div className="text-[11px] text-slate-500">OID Numérico</div>
                <div className="font-mono text-slate-100 break-all mt-0.5">{selectedNode.oid}</div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">Tipo de Dato ASN.1</div>
                <div className="font-mono text-amber-300 mt-0.5">{selectedNode.dataType}</div>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">{selectedNode.description}</p>
          </div>
        </div>

        {/* RIGHT COLUMN: SNMP Console + SNMP Trap Generator/Receiver */}
        <div className="xl:col-span-7 space-y-5">
          {/* 1. Integrated SNMP Command Console */}
          <div className="bg-[#111827] border border-[#1f2937] rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-[#1f2937] flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                <Terminal className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Consola Cliente SNMP (net-snmp)</span>
              </div>
              {targetHost && (
                <span className="text-[11px] font-mono text-slate-400">
                  {targetHost.hostname} ·{' '}
                  {targetHost.interfaces.some((i) => i.protocol === 'SNMP')
                    ? 'UDP/161 Activo'
                    : 'Sin agente SNMP'}
                </span>
              )}
            </div>

            <form onSubmit={handleRunCommand} className="p-4 space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Host Objetivo</label>
                  <select
                    aria-label="Host objetivo consola SNMP"
                    value={targetHostId}
                    onChange={(e) => setTargetHostId(e.target.value)}
                    className="w-full px-2.5 py-2 rounded bg-[#0b0f19] border border-[#1f2937] text-slate-100 font-mono focus:outline-none focus:border-sky-500"
                  >
                    {hosts.map((h) => {
                      const hasSnmp = h.interfaces.some((i) => i.protocol === 'SNMP');
                      return (
                        <option key={h.id} value={h.id}>
                          {h.hostname} ({h.ip}) {hasSnmp ? '' : '[Sin SNMP]'}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Operación</label>
                  <select
                    aria-label="Operación SNMP"
                    value={operation}
                    onChange={(e) => setOperation(e.target.value as SnmpOperation)}
                    className="w-full px-2.5 py-2 rounded bg-[#0b0f19] border border-[#1f2937] text-slate-100 font-mono focus:outline-none focus:border-sky-500"
                  >
                    <option value="snmpget">snmpget (Leer OID exacto)</option>
                    <option value="snmpwalk">snmpwalk (Recorrer subárbol)</option>
                    <option value="snmptable">snmptable (Tabular tabla MIB)</option>
                    <option value="snmpset">snmpset (Escribir OID RW)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Versión SNMP</label>
                  <select
                    aria-label="Versión SNMP"
                    value={version}
                    onChange={(e) => setVersion(e.target.value as SnmpVersion)}
                    className="w-full px-2.5 py-2 rounded bg-[#0b0f19] border border-[#1f2937] text-slate-100 font-mono focus:outline-none focus:border-sky-500"
                  >
                    <option value="v1">SNMPv1</option>
                    <option value="v2c">SNMPv2c (Community)</option>
                    <option value="v3">SNMPv3 (USM authPriv)</option>
                  </select>
                </div>
              </div>

              {/* Credentials Row */}
              {version !== 'v3' ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-slate-400 mb-1">Community String</label>
                    <input
                      type="text"
                      value={community}
                      onChange={(e) => setCommunity(e.target.value)}
                      placeholder="public"
                      className="w-full px-2.5 py-2 rounded bg-[#0b0f19] border border-[#1f2937] text-slate-100 font-mono focus:outline-none focus:border-sky-500"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-slate-400 mb-1">OID Objetivo</label>
                    <input
                      type="text"
                      value={oidInput}
                      onChange={(e) => setOidInput(e.target.value)}
                      placeholder=".1.3.6.1.2.1.1.3.0"
                      className="w-full px-2.5 py-2 rounded bg-[#0b0f19] border border-[#1f2937] text-sky-300 font-mono focus:outline-none focus:border-sky-500"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-slate-400 mb-1">Usuario USM (-u)</label>
                      <input
                        type="text"
                        value={v3User}
                        onChange={(e) => setV3User(e.target.value)}
                        className="w-full px-2.5 py-2 rounded bg-[#0b0f19] border border-[#1f2937] text-slate-100 font-mono focus:outline-none focus:border-sky-500"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">Auth SHA-256 (-A)</label>
                      <input
                        type="text"
                        value={v3AuthPass}
                        onChange={(e) => setV3AuthPass(e.target.value)}
                        className="w-full px-2.5 py-2 rounded bg-[#0b0f19] border border-[#1f2937] text-slate-100 font-mono focus:outline-none focus:border-sky-500"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">Priv AES-128 (-X)</label>
                      <input
                        type="text"
                        value={v3PrivKey}
                        onChange={(e) => setV3PrivKey(e.target.value)}
                        className="w-full px-2.5 py-2 rounded bg-[#0b0f19] border border-[#1f2937] text-slate-100 font-mono focus:outline-none focus:border-sky-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">OID Objetivo</label>
                    <input
                      type="text"
                      value={oidInput}
                      onChange={(e) => setOidInput(e.target.value)}
                      className="w-full px-2.5 py-2 rounded bg-[#0b0f19] border border-[#1f2937] text-sky-300 font-mono focus:outline-none focus:border-sky-500"
                    />
                  </div>
                </div>
              )}

              {operation === 'snmpset' && (
                <div>
                  <label className="block text-slate-400 mb-1">
                    Nuevo Valor STRING (s) para snmpset
                  </label>
                  <input
                    type="text"
                    value={setValue}
                    onChange={(e) => setSetValue(e.target.value)}
                    placeholder="CPD-Sala-Principal"
                    className="w-full px-2.5 py-2 rounded bg-[#0b0f19] border border-emerald-500/40 text-emerald-200 font-mono focus:outline-none focus:border-emerald-400"
                  />
                </div>
              )}

              {/* Command Preview + Actions */}
              <div className="pt-1 flex flex-wrap items-center justify-between gap-3">
                <div className="flex-1 min-w-[220px] px-3 py-2 rounded bg-[#0b0f19] border border-[#1f2937] font-mono text-[11px] text-slate-300 truncate">
                  $ {cliPreview}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded bg-sky-600 hover:bg-sky-500 text-white font-semibold transition-colors whitespace-nowrap"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Ejecutar Consulta</span>
                  </button>

                  <button
                    type="button"
                    disabled={!canCreateItem}
                    onClick={handleCreateItemFromOid}
                    title={
                      canCreateItem
                        ? 'Vincular este OID al host para graficarlo en Latest Data'
                        : 'Selecciona un OID hoja soportado por el host (y con SNMP activo)'
                    }
                    className={`inline-flex items-center gap-1.5 px-3 py-2 rounded border font-medium transition-colors whitespace-nowrap ${
                      canCreateItem
                        ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-300 hover:bg-emerald-600/30'
                        : 'bg-[#0b0f19] border-[#1f2937] text-slate-600 cursor-not-allowed'
                    }`}
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    <span>Crear Ítem de Monitorización desde este OID</span>
                  </button>
                </div>
              </div>
            </form>

            {itemCreatedBanner && (
              <div className="mx-4 mb-3 p-2.5 rounded bg-emerald-950/40 border border-emerald-500/40 flex flex-wrap items-center justify-between gap-2 text-xs text-emerald-200">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{itemCreatedBanner}</span>
                </span>
                {targetHost && (
                  <button
                    type="button"
                    onClick={() => onSelectHostForLatestData(targetHost.id)}
                    className="font-semibold text-emerald-300 hover:underline whitespace-nowrap"
                  >
                    Abrir Latest Data
                  </button>
                )}
              </div>
            )}

            {/* Terminal Output */}
            <div className="border-t border-[#1f2937] bg-[#0b0f19] p-4 space-y-3">
              {!lastResult ? (
                <div className="font-mono text-xs text-slate-500">
                  Selecciona un OID en el árbol MIB de la izquierda y pulsa &quot;Ejecutar
                  Consulta&quot;. Prueba errores reales omitiendo el .0 final o cambiando la
                  community string.
                </div>
              ) : (
                <>
                  <div
                    className={`font-mono text-xs space-y-1 max-h-56 overflow-y-auto ${
                      lastResult.ok ? 'text-emerald-300' : 'text-rose-300'
                    }`}
                  >
                    {lastResult.lines.map((line, idx) => (
                      <div key={idx} className="break-all leading-relaxed">
                        {line}
                      </div>
                    ))}
                  </div>

                  {lastResult.tableHeaders && lastResult.tableRows && (
                    <div className="overflow-x-auto border border-[#1f2937] rounded">
                      <table className="w-full text-xs font-mono border-collapse">
                        <thead>
                          <tr className="bg-[#111827] border-b border-[#1f2937] text-slate-300">
                            {lastResult.tableHeaders.map((h) => (
                              <th key={h} className="text-left px-3 py-2 font-medium whitespace-nowrap">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#1f2937]">
                          {lastResult.tableRows.map((row, rIdx) => (
                            <tr key={rIdx} className="hover:bg-[#111827]/60">
                              {row.map((cell, cIdx) => (
                                <td key={cIdx} className="px-3 py-1.5 text-emerald-300 whitespace-nowrap">
                                  {cell}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {lastResult.didacticNote && (
                    <div className="p-3 rounded bg-[#111827] border border-amber-500/30 flex items-start gap-2 text-xs text-amber-200">
                      <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <span>{lastResult.didacticNote}</span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* 2. SNMP Trap Generator & UDP/162 Receiver */}
          <div className="bg-[#111827] border border-[#1f2937] rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-[#1f2937] flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                  <Radio className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>Generador y Receptor de SNMP Traps (UDP/162)</span>
                </h3>
                <p className="text-[11px] text-slate-400">
                  Simula notificaciones asíncronas HOST → NOC y observa el paquete crudo en
                  snmptrapd
                </p>
              </div>
              {trapLog.length > 0 && (
                <button
                  type="button"
                  onClick={onClearTrapLog}
                  className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Limpiar receptor</span>
                </button>
              )}
            </div>

            <div className="p-4 border-b border-[#1f2937] grid grid-cols-1 sm:grid-cols-12 gap-3 items-end text-xs">
              <div className="sm:col-span-4">
                <label className="block text-slate-400 mb-1">Emisor del Trap</label>
                <select
                  aria-label="Host emisor de SNMP Trap"
                  value={trapHostId}
                  onChange={(e) => setTrapHostId(e.target.value)}
                  className="w-full px-2.5 py-2 rounded bg-[#0b0f19] border border-[#1f2937] text-slate-100 font-mono"
                >
                  {hosts.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.hostname} ({h.ip})
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-5">
                <label className="block text-slate-400 mb-1">Evento / Trap OID</label>
                <select
                  aria-label="Tipo de SNMP Trap"
                  value={trapKind}
                  onChange={(e) => setTrapKind(e.target.value as TrapKind)}
                  className="w-full px-2.5 py-2 rounded bg-[#0b0f19] border border-[#1f2937] text-slate-100"
                >
                  {TRAP_OPTIONS.map((t) => (
                    <option key={t.kind} value={t.kind}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-3 flex items-center gap-2">
                <select
                  aria-label="Versión Trap"
                  value={trapVersion}
                  onChange={(e) => setTrapVersion(e.target.value as 'v2c' | 'v3')}
                  className="px-2 py-2 rounded bg-[#0b0f19] border border-[#1f2937] text-slate-100 font-mono"
                >
                  <option value="v2c">v2c</option>
                  <option value="v3">v3</option>
                </select>

                <button
                  type="button"
                  onClick={() => trapHostId && onEmitSnmpTrap(trapHostId, trapKind, trapVersion)}
                  className="flex-1 px-3 py-2 rounded bg-rose-600 hover:bg-rose-500 text-white font-semibold transition-colors whitespace-nowrap"
                >
                  Enviar Trap
                </button>
              </div>
            </div>

            <div className="bg-[#0b0f19] p-4 max-h-60 overflow-y-auto space-y-3">
              {trapLog.length === 0 ? (
                <div className="font-mono text-xs text-slate-500">
                  snmptrapd escuchando en 0.0.0.0:162/udp... Envía un trap para inspeccionar su PDU
                  decodificado y generar la alarma en el NOC.
                </div>
              ) : (
                trapLog.map((pkt) => (
                  <div
                    key={pkt.id}
                    className="border border-[#1f2937] rounded bg-[#111827]/70 p-3 space-y-1.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                      <span className="font-mono font-semibold text-rose-300">
                        {pkt.trapOid} · {pkt.trapKind}
                      </span>
                      <span className="font-mono tabular-nums text-slate-400">
                        {formatTimeHms(pkt.ts)} · {pkt.sourceIp} → NOC:162
                      </span>
                    </div>
                    <pre className="font-mono text-[11px] text-slate-300 whitespace-pre-wrap break-all leading-relaxed">
                      {pkt.rawPdu}
                    </pre>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
