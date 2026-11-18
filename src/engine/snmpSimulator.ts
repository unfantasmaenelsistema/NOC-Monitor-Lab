import { ALL_MIB_NODES, findMibNodeByOid, normalizeOid } from '../data/mibDatabase';
import { Host, SeverityLevel, SnmpTrapPacket, TrapKind } from '../types/noc';

export type SnmpOperation = 'snmpget' | 'snmpwalk' | 'snmptable' | 'snmpset';
export type SnmpVersion = 'v1' | 'v2c' | 'v3';

export interface SnmpCommandRequest {
  operation: SnmpOperation;
  version: SnmpVersion;
  community: string;
  v3User: string;
  v3AuthPass: string;
  v3PrivKey: string;
  oid: string;
  setValue?: string;
}

export interface SnmpResolution {
  oid: string;
  mib: string;
  name: string;
  dataType: string;
  unit: string;
  numericValue: number;
  formattedValue: string;
  netSnmpLine: string;
}

export interface SnmpCommandResult {
  ok: boolean;
  cliCommand: string;
  lines: string[];
  tableHeaders?: string[];
  tableRows?: string[][];
  didacticNote?: string;
  resolvedLeaf?: SnmpResolution;
  mutation?: {
    field: 'sysContact' | 'sysLocation' | 'hostname';
    value: string;
  };
}

function formatTimeticks(seconds: number): string {
  const ticks = Math.max(0, Math.round(seconds * 100));
  const days = Math.floor(seconds / 86400);
  const hrs = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  const dayPrefix = days > 0 ? `${days} days, ` : '';
  return `(${ticks}) ${dayPrefix}${hrs}:${pad(mins)}:${pad(secs)}.00`;
}

export function resolveLeafValueForHost(oidInput: string, host: Host): SnmpResolution | null {
  const oid = normalizeOid(oidInput);
  const mibNode = findMibNodeByOid(oid);
  const m = host.metrics;

  const mk = (
    name: string,
    mib: string,
    dataType: string,
    unit: string,
    numericValue: number,
    formattedValue: string,
    netSnmpVal: string
  ): SnmpResolution => ({
    oid,
    mib,
    name,
    dataType,
    unit,
    numericValue,
    formattedValue,
    netSnmpLine: `${mib}::${name} = ${dataType}: ${netSnmpVal}`,
  });

  switch (oid) {
    case '.1.3.6.1.2.1.1.1.0':
      return mk(
        'sysDescr.0',
        'SNMPv2-MIB',
        'OCTET STRING',
        '',
        1,
        `${host.vendorOs} (${host.role})`,
        `"${host.vendorOs} - ${host.role} [${host.hostname}]"`
      );
    case '.1.3.6.1.2.1.1.2.0':
      return mk(
        'sysObjectID.0',
        'SNMPv2-MIB',
        'OBJECT IDENTIFIER',
        '',
        1,
        host.snmpMeta.sysObjectID,
        host.snmpMeta.sysObjectID
      );
    case '.1.3.6.1.2.1.1.3.0': {
      const tt = formatTimeticks(m.sysUpTimeSec);
      return mk('sysUpTime.0', 'SNMPv2-MIB', 'TimeTicks', 's', m.sysUpTimeSec, tt, tt);
    }
    case '.1.3.6.1.2.1.1.4.0':
      return mk(
        'sysContact.0',
        'SNMPv2-MIB',
        'OCTET STRING',
        '',
        1,
        host.snmpMeta.sysContact,
        `"${host.snmpMeta.sysContact}"`
      );
    case '.1.3.6.1.2.1.1.5.0':
      return mk(
        'sysName.0',
        'SNMPv2-MIB',
        'OCTET STRING',
        '',
        1,
        host.hostname,
        `"${host.hostname}"`
      );
    case '.1.3.6.1.2.1.1.6.0':
      return mk(
        'sysLocation.0',
        'SNMPv2-MIB',
        'OCTET STRING',
        '',
        1,
        host.snmpMeta.sysLocation,
        `"${host.snmpMeta.sysLocation}"`
      );
    case '.1.3.6.1.2.1.2.1.0':
      return mk('ifNumber.0', 'IF-MIB', 'INTEGER', '', 2, '2', '2');

    case '.1.3.6.1.2.1.2.2.1.2.1':
      return mk('ifDescr.1', 'IF-MIB', 'OCTET STRING', '', 1, m.netInterface, `"${m.netInterface}"`);
    case '.1.3.6.1.2.1.2.2.1.2.2':
      return mk('ifDescr.2', 'IF-MIB', 'OCTET STRING', '', 1, 'mgmt0', '"mgmt0"');

    case '.1.3.6.1.2.1.2.2.1.8.1': {
      const up = host.status !== 'DOWN' ? 1 : 2;
      const str = up === 1 ? 'up(1)' : 'down(2)';
      return mk('ifOperStatus.1', 'IF-MIB', 'INTEGER', '', up, str, str);
    }
    case '.1.3.6.1.2.1.2.2.1.8.2':
      return mk('ifOperStatus.2', 'IF-MIB', 'INTEGER', '', 1, 'up(1)', 'up(1)');

    case '.1.3.6.1.2.1.2.2.1.10.1': {
      const octets = Math.round(m.netInMbps * 125000 + m.sysUpTimeSec * 1400);
      return mk(
        'ifInOctets.1',
        'IF-MIB',
        'Counter32',
        'Mbps',
        m.netInMbps,
        `${m.netInMbps.toFixed(1)} Mbps`,
        `${octets} (~${m.netInMbps.toFixed(1)} Mbps)`
      );
    }
    case '.1.3.6.1.2.1.2.2.1.10.2': {
      const mgmtOctets = Math.round(1.4 * 125000 + m.sysUpTimeSec * 180);
      return mk('ifInOctets.2', 'IF-MIB', 'Counter32', 'Mbps', 1.4, '1.4 Mbps', `${mgmtOctets}`);
    }
    case '.1.3.6.1.2.1.2.2.1.16.1': {
      const octets = Math.round(m.netOutMbps * 125000 + m.sysUpTimeSec * 1100);
      return mk(
        'ifOutOctets.1',
        'IF-MIB',
        'Counter32',
        'Mbps',
        m.netOutMbps,
        `${m.netOutMbps.toFixed(1)} Mbps`,
        `${octets} (~${m.netOutMbps.toFixed(1)} Mbps)`
      );
    }
    case '.1.3.6.1.2.1.2.2.1.16.2': {
      const mgmtOctets = Math.round(0.9 * 125000 + m.sysUpTimeSec * 120);
      return mk('ifOutOctets.2', 'IF-MIB', 'Counter32', 'Mbps', 0.9, '0.9 Mbps', `${mgmtOctets}`);
    }
    case '.1.3.6.1.2.1.2.2.1.14.1': {
      const errs = host.activeAnomaly === 'packet_loss' ? 148 : 0;
      return mk('ifInErrors.1', 'IF-MIB', 'Counter32', 'err', errs, `${errs}`, `${errs}`);
    }

    case '.1.3.6.1.2.1.25.2.3.1.3.1':
      return mk(
        'hrStorageDescr.1',
        'HOST-RESOURCES-MIB',
        'OCTET STRING',
        '',
        1,
        'Physical memory',
        '"Physical memory"'
      );
    case '.1.3.6.1.2.1.25.2.3.1.6.1':
      return mk(
        'hrStorageUsed.1',
        'HOST-RESOURCES-MIB',
        'Gauge32',
        '%',
        m.ramPct,
        `${m.ramPct.toFixed(1)} %`,
        `${Math.round(m.ramPct)} (${m.ramUsedGb} GB / ${m.ramTotalGb} GB)`
      );
    case '.1.3.6.1.2.1.25.2.3.1.3.31':
      return mk('hrStorageDescr.31', 'HOST-RESOURCES-MIB', 'OCTET STRING', '', 1, '/', '"/"');
    case '.1.3.6.1.2.1.25.2.3.1.6.31':
      return mk(
        'hrStorageUsed.31',
        'HOST-RESOURCES-MIB',
        'Gauge32',
        '%',
        m.diskPct,
        `${m.diskPct.toFixed(1)} %`,
        `${Math.round(m.diskPct)} (${m.diskUsedTb} TB / ${m.diskTotalTb} TB)`
      );
    case '.1.3.6.1.2.1.25.3.3.1.2.1': {
      const cpu = Math.round(m.cpu);
      return mk('hrProcessorLoad.1', 'HOST-RESOURCES-MIB', 'INTEGER', '%', cpu, `${cpu} %`, `${cpu}`);
    }
    case '.1.3.6.1.2.1.25.3.3.1.2.2': {
      const cpu2 = Math.max(1, Math.min(99, Math.round(m.cpu * 0.92)));
      return mk(
        'hrProcessorLoad.2',
        'HOST-RESOURCES-MIB',
        'INTEGER',
        '%',
        cpu2,
        `${cpu2} %`,
        `${cpu2}`
      );
    }

    // Cisco Enterprise
    case '.1.3.6.1.4.1.9.9.13.1.3.1.3.1': {
      if (host.group !== 'Networking') return null;
      const temp = Math.round(36 + m.cpu * 0.25);
      return mk(
        'ciscoEnvMonTemperatureStatusValue.1',
        'CISCO-ENVMON-MIB',
        'Gauge32',
        '°C',
        temp,
        `${temp} °C`,
        `${temp} degrees Celsius`
      );
    }
    case '.1.3.6.1.4.1.9.9.13.1.5.1.3.1': {
      if (host.group !== 'Networking') return null;
      return mk(
        'ciscoEnvMonSupplyState.1',
        'CISCO-ENVMON-MIB',
        'INTEGER',
        '',
        1,
        'normal(1)',
        'normal(1)'
      );
    }

    // Fortinet Enterprise
    case '.1.3.6.1.4.1.12356.101.4.1.8.0': {
      if (host.group !== 'Seguridad') return null;
      const sessions = Math.round(4200 + (m.netInMbps + m.netOutMbps) * 18);
      return mk(
        'fgSysSesCount.0',
        'FORTINET-FORTIGATE-MIB',
        'Gauge32',
        'ses',
        sessions,
        `${sessions} sesiones`,
        `${sessions}`
      );
    }
    case '.1.3.6.1.4.1.12356.101.4.1.3.0': {
      if (host.group !== 'Seguridad') return null;
      const cpu = Math.round(m.cpu);
      return mk(
        'fgSysCpuUsage.0',
        'FORTINET-FORTIGATE-MIB',
        'Gauge32',
        '%',
        cpu,
        `${cpu} %`,
        `${cpu}`
      );
    }

    // UCD-SNMP-MIB (Linux / Storage)
    case '.1.3.6.1.4.1.2021.4.6.0': {
      const freeKb = Math.max(0, Math.round((m.ramTotalGb - m.ramUsedGb) * 1024 * 1024));
      return mk(
        'memAvailReal.0',
        'UCD-SNMP-MIB',
        'INTEGER',
        'KB',
        freeKb,
        `${freeKb} KB`,
        `${freeKb} kB`
      );
    }
    case '.1.3.6.1.4.1.2021.4.3.0': {
      const totalSwap = 4194304;
      return mk(
        'memTotalSwap.0',
        'UCD-SNMP-MIB',
        'INTEGER',
        'KB',
        totalSwap,
        `${totalSwap} KB`,
        `${totalSwap} kB`
      );
    }
    case '.1.3.6.1.4.1.2021.4.4.0': {
      const availSwap = Math.round(4194304 * (m.ramPct > 85 ? 0.35 : 0.94));
      return mk(
        'memAvailSwap.0',
        'UCD-SNMP-MIB',
        'INTEGER',
        'KB',
        availSwap,
        `${availSwap} KB`,
        `${availSwap} kB`
      );
    }
    case '.1.3.6.1.4.1.2021.11.9.0': {
      const userCpu = Math.round(m.cpu * 0.78);
      return mk(
        'ssCpuUser.0',
        'UCD-SNMP-MIB',
        'INTEGER',
        '%',
        userCpu,
        `${userCpu} %`,
        `${userCpu}`
      );
    }

    default: {
      if (mibNode && mibNode.dataType !== 'Branch' && mibNode.dataType !== 'Table') {
        return null;
      }
      return null;
    }
  }
}

export function buildCliPreview(req: SnmpCommandRequest, host: Host): string {
  const oid = normalizeOid(req.oid) || '.1.3.6.1.2.1.1';
  if (req.version === 'v3') {
    const base = `${req.operation} -v3 -l authPriv -u ${req.v3User || 'nocadmin'} -a SHA-256 -A "${
      req.v3AuthPass ? '••••••••' : ''
    }" -x AES -X "${req.v3PrivKey ? '••••••••' : ''}" ${host.ip} ${oid}`;
    return req.operation === 'snmpset' ? `${base} s "${req.setValue ?? ''}"` : base;
  }
  const vFlag = req.version === 'v1' ? '-v1' : '-v2c';
  const base = `${req.operation} ${vFlag} -c ${req.community || 'public'} ${host.ip} ${oid}`;
  return req.operation === 'snmpset' ? `${base} s "${req.setValue ?? ''}"` : base;
}

export function executeSnmpCommand(req: SnmpCommandRequest, host: Host): SnmpCommandResult {
  const oid = normalizeOid(req.oid);
  const cliCommand = buildCliPreview(req, host);
  const snmpIface = host.interfaces.find((i) => i.protocol === 'SNMP');

  if (!oid) {
    return {
      ok: false,
      cliCommand,
      lines: ['Error: Debes especificar un OID válido (ej. .1.3.6.1.2.1.1.3.0).'],
    };
  }

  // 1. Check host availability & SNMP daemon presence
  if (!snmpIface) {
    return {
      ok: false,
      cliCommand,
      lines: [`Timeout: No Response from ${host.ip}.`],
      didacticNote: `El host ${host.hostname} (${host.ip}) no tiene una interfaz SNMP habilitada (usa ${host.interfaces
        .map((i) => i.protocol)
        .join(', ')}). El paquete UDP/161 nunca obtiene respuesta.`,
    };
  }

  if (host.status === 'DOWN' || host.status === 'MAINTENANCE') {
    return {
      ok: false,
      cliCommand,
      lines: [`Timeout: No Response from ${host.ip}.`],
      didacticNote:
        host.status === 'DOWN'
          ? `El host ${host.hostname} se encuentra en estado DOWN (100% pérdida de paquetes).`
          : `El host ${host.hostname} está en Ventana de Mantenimiento con su interfaz SNMP deshabilitada.`,
    };
  }

  // 2. Validate Authentication / Community
  if (req.version === 'v3') {
    if (req.v3User.trim() !== host.snmpMeta.v3User) {
      return {
        ok: false,
        cliCommand,
        lines: [`${req.operation}: Unknown user name (Sub-id not found: ${req.v3User || 'empty'})`],
        didacticNote: `SNMPv3 USM rechazó el usuario. Usuario válido configurado en el agente del lab: "${host.snmpMeta.v3User}".`,
      };
    }
    if (
      req.v3AuthPass !== host.snmpMeta.v3AuthPass ||
      req.v3PrivKey !== host.snmpMeta.v3PrivKey
    ) {
      return {
        ok: false,
        cliCommand,
        lines: [`${req.operation}: Authentication failure (incorrect password, community or key)`],
        didacticNote: `Credenciales SNMPv3 authPriv incorrectas. Prueba usuario "${host.snmpMeta.v3User}", Auth "${host.snmpMeta.v3AuthPass}" y Priv "${host.snmpMeta.v3PrivKey}".`,
      };
    }
  } else {
    const comm = req.community.trim();
    const validCommunities =
      req.operation === 'snmpset'
        ? [host.snmpMeta.communityRw]
        : [host.snmpMeta.communityRo, host.snmpMeta.communityRw];

    if (req.operation === 'snmpset' && comm === host.snmpMeta.communityRo) {
      return {
        ok: false,
        cliCommand,
        lines: [
          `Error in packet.`,
          `Reason: noAccess (The community "${comm}" only allows Read-Only operations)`,
        ],
        didacticNote: `Intentaste ejecutar snmpset con la comunidad Read-Only "${host.snmpMeta.communityRo}". Utiliza la comunidad Read-Write "${host.snmpMeta.communityRw}" o SNMPv3.`,
      };
    }

    if (!validCommunities.includes(comm)) {
      return {
        ok: false,
        cliCommand,
        lines: [`Timeout: No Response from ${host.ip}`],
        didacticNote: `Comunidad "${comm || '(vacía)'}" incorrecta. En SNMPv1/v2c, los agentes descartan silenciosamente paquetes con community inválida provocando un Timeout. Prueba "${host.snmpMeta.communityRo}" (RO) o "${host.snmpMeta.communityRw}" (RW).`,
      };
    }
  }

  // 3. Handle operations
  if (req.operation === 'snmpget') {
    // Check if user forgot .0 on a scalar
    const scalarWithZero = findMibNodeByOid(`${oid}.0`);
    if (scalarWithZero && scalarWithZero.isScalar) {
      return {
        ok: false,
        cliCommand,
        lines: [
          `${scalarWithZero.mib}::${scalarWithZero.name.replace('.0', '')} = No Such Instance currently exists at this OID`,
        ],
        didacticNote: `Error clásico de SNMP: ${scalarWithZero.name} es un objeto escalar. En snmpget debes incluir el índice final ".0" (${scalarWithZero.oid}), o bien usar snmpwalk sobre ${oid}.`,
      };
    }

    const node = findMibNodeByOid(oid);
    if (node && (node.dataType === 'Branch' || node.isTable)) {
      return {
        ok: false,
        cliCommand,
        lines: [`${node.mib}::${node.name} = No Such Instance currently exists at this OID`],
        didacticNote: `"${node.name}" (${oid}) es una rama o tabla contenedora, no un objeto hoja. Cambia la operación a snmpwalk o snmptable, o selecciona un OID hijo concreto.`,
      };
    }

    const resolved = resolveLeafValueForHost(oid, host);
    if (!resolved) {
      return {
        ok: false,
        cliCommand,
        lines: [`${oid} = No Such Object available on this agent at this OID`],
        didacticNote: `El agente de ${host.hostname} (${host.vendorOs}) no implementa esa rama propietaria o el OID no existe en su MIB.`,
      };
    }

    return {
      ok: true,
      cliCommand,
      lines: [resolved.netSnmpLine],
      resolvedLeaf: resolved,
    };
  }

  if (req.operation === 'snmpwalk') {
    const matchingLeaves = ALL_MIB_NODES.filter(
      (n) =>
        n.dataType !== 'Branch' &&
        n.dataType !== 'Table' &&
        (n.oid === oid || n.oid.startsWith(`${oid}.`))
    );

    const resolvedLines: string[] = [];
    let firstResolved: SnmpResolution | undefined;

    for (const leaf of matchingLeaves) {
      const res = resolveLeafValueForHost(leaf.oid, host);
      if (res) {
        if (!firstResolved) firstResolved = res;
        resolvedLines.push(res.netSnmpLine);
      }
    }

    if (resolvedLines.length === 0) {
      return {
        ok: false,
        cliCommand,
        lines: [`${oid} = No more variables left in this MIB View (It is past the end of the MIB tree)`],
        didacticNote: `No se encontraron objetos implementados bajo ${oid} para el fabricante/OS de ${host.hostname}.`,
      };
    }

    return {
      ok: true,
      cliCommand,
      lines: resolvedLines,
      resolvedLeaf: firstResolved,
    };
  }

  if (req.operation === 'snmptable') {
    if (oid === '.1.3.6.1.2.1.2.2' || oid.startsWith('.1.3.6.1.2.1.2.2.1') || oid === '.1.3.6.1.2.1.2') {
      const m = host.metrics;
      const status1 = m.packetLossPct >= 90 ? 'down(2)' : 'up(1)';
      const errs1 = host.activeAnomaly === 'packet_loss' ? '148' : '0';
      return {
        ok: true,
        cliCommand,
        lines: [`SNMP table: IF-MIB::ifTable (${host.hostname})`],
        tableHeaders: ['ifIndex', 'ifDescr', 'ifOperStatus', 'ifInOctets (rate)', 'ifOutOctets (rate)', 'ifInErrors'],
        tableRows: [
          ['1', m.netInterface, status1, `${m.netInMbps.toFixed(1)} Mbps`, `${m.netOutMbps.toFixed(1)} Mbps`, errs1],
          ['2', 'mgmt0', 'up(1)', '1.4 Mbps', '0.9 Mbps', '0'],
        ],
      };
    }

    if (oid.startsWith('.1.3.6.1.2.1.25.2')) {
      const m = host.metrics;
      return {
        ok: true,
        cliCommand,
        lines: [`SNMP table: HOST-RESOURCES-MIB::hrStorageTable (${host.hostname})`],
        tableHeaders: ['hrStorageIndex', 'hrStorageDescr', 'hrStorageSize', 'hrStorageUsed (%)'],
        tableRows: [
          ['1', 'Physical memory', `${m.ramTotalGb} GB`, `${m.ramUsedGb} GB (${m.ramPct.toFixed(1)}%)`],
          ['31', '/', `${m.diskTotalTb} TB`, `${m.diskUsedTb} TB (${m.diskPct.toFixed(1)}%)`],
        ],
      };
    }

    return {
      ok: false,
      cliCommand,
      lines: [`Was that a table? ${oid}`],
      didacticNote: `snmptable solo funciona sobre tablas SNMP (por ejemplo ifTable: .1.3.6.1.2.1.2.2 o hrStorageTable: .1.3.6.1.2.1.25.2.3).`,
    };
  }

  // snmpset
  const targetNode = findMibNodeByOid(oid);
  if (!targetNode) {
    return {
      ok: false,
      cliCommand,
      lines: [`Error in packet. Reason: notWritable (OID ${oid} no encontrado)`],
    };
  }
  if (targetNode.access !== 'Read-Write') {
    return {
      ok: false,
      cliCommand,
      lines: [
        `Error in packet.`,
        `Reason: notWritable (That object does not support modification)`,
        `Failed object: ${targetNode.mib}::${targetNode.name}`,
      ],
      didacticNote: `El objeto ${targetNode.name} tiene acceso ${targetNode.access}. Solo puedes usar snmpset sobre objetos Read-Write como sysContact.0 (.1.3.6.1.2.1.1.4.0), sysName.0 (.1.3.6.1.2.1.1.5.0) o sysLocation.0 (.1.3.6.1.2.1.1.6.0).`,
    };
  }

  const newVal = (req.setValue ?? '').trim();
  if (!newVal) {
    return {
      ok: false,
      cliCommand,
      lines: ['Error: Especifica un valor de cadena para ejecutar snmpset.'],
    };
  }

  let field: 'sysContact' | 'sysLocation' | 'hostname' = 'sysContact';
  if (oid === '.1.3.6.1.2.1.1.6.0') field = 'sysLocation';
  else if (oid === '.1.3.6.1.2.1.1.5.0') field = 'hostname';

  return {
    ok: true,
    cliCommand,
    lines: [`${targetNode.mib}::${targetNode.name} = STRING: "${newVal}"`],
    didacticNote: `Escritura SNMP aplicada sobre ${host.hostname}. Ejecuta snmpget en ${oid} para confirmar el cambio persistido en AppState.`,
    mutation: { field, value: newVal },
  };
}

export function createSnmpTrapPacket(
  host: Host,
  trapKind: TrapKind,
  version: 'v2c' | 'v3'
): SnmpTrapPacket {
  const now = Date.now();
  const stamp = new Date(now).toISOString().replace('T', ' ').slice(0, 19);
  const uptime = formatTimeticks(host.metrics.sysUpTimeSec);

  let trapOid = '.1.3.6.1.6.3.1.1.5.3';
  let severity: SeverityLevel = 'high';
  let summary = '';
  let varbinds = '';

  switch (trapKind) {
    case 'linkDown':
      trapOid = '.1.3.6.1.6.3.1.1.5.3';
      severity = 'high';
      summary = `IF-MIB::linkDown en interfaz ${host.metrics.netInterface} (ifOperStatus=down(2))`;
      varbinds = `IF-MIB::ifIndex.1 = INTEGER: 1\n  IF-MIB::ifDescr.1 = STRING: "${host.metrics.netInterface}"\n  IF-MIB::ifOperStatus.1 = INTEGER: down(2)`;
      break;
    case 'coldStart':
      trapOid = '.1.3.6.1.6.3.1.1.5.1';
      severity = 'average';
      summary = `SNMPv2-MIB::coldStart — Reinicio inesperado del sistema (${host.hostname})`;
      varbinds = `SNMPv2-MIB::sysName.0 = STRING: "${host.hostname}"\n  SNMPv2-MIB::sysLocation.0 = STRING: "${host.snmpMeta.sysLocation}"`;
      break;
    case 'authenticationFailure':
      trapOid = '.1.3.6.1.6.3.1.1.5.5';
      severity = 'warning';
      summary = `SNMPv2-MIB::authenticationFailure — Intento de acceso con community inválida desde 192.168.99.44`;
      varbinds = `SNMPv2-MIB::snmpEnableAuthenTraps.0 = INTEGER: enabled(1)\n  SRC-AUDIT::offendingIp = IpAddress: 192.168.99.44`;
      break;
    case 'psuRedundantDown':
      trapOid = '.1.3.6.1.4.1.9.9.13.3.0.2';
      severity = 'high';
      summary = `CISCO-ENVMON-MIB::ciscoEnvMonRedundantSupplyNotification — Fallo en PSU-2 redundante`;
      varbinds = `CISCO-ENVMON-MIB::ciscoEnvMonSupplyStatusDescr.2 = STRING: "Power Supply 2"\n  CISCO-ENVMON-MIB::ciscoEnvMonSupplyState.2 = INTEGER: critical(3)`;
      break;
    case 'fwSessionThreshold':
      trapOid = '.1.3.6.1.4.1.12356.100.1.3.0.201';
      severity = 'high';
      summary = `FORTINET-MIB::fgTrapSessionLimit — Saturación de tabla de sesiones conntrack`;
      varbinds = `FORTINET-FORTIGATE-MIB::fgSysSesCount.0 = Gauge32: 48920\n  FORTINET-FORTIGATE-MIB::fgSysCpuUsage.0 = Gauge32: ${Math.round(host.metrics.cpu)}`;
      break;
  }

  const rawPdu = `${stamp} ${host.hostname} [UDP: [${host.ip}]:51422->[10.0.0.250]:162]:
  SNMP${version} PDU: TRAP2 (${version === 'v3' ? 'authPriv nocadmin' : `community="${host.snmpMeta.communityRo}"`})
  DISMAN-EVENT-MIB::sysUpTimeInstance = Timeticks: ${uptime}
  SNMPv2-MIB::snmpTrapOID.0 = OID: ${trapOid}
  ${varbinds}`;

  return {
    id: `trap-${now}-${Math.random().toString(36).slice(2, 6)}`,
    ts: now,
    hostId: host.id,
    hostname: host.hostname,
    sourceIp: host.ip,
    trapKind,
    trapOid,
    severity,
    version,
    rawPdu,
    summary,
  };
}
