export type MibDataType =
  | 'Branch'
  | 'Table'
  | 'OCTET STRING'
  | 'OBJECT IDENTIFIER'
  | 'TimeTicks'
  | 'INTEGER'
  | 'Counter32'
  | 'Gauge32';

export type MibAccess = 'Not-Accessible' | 'Read-Only' | 'Read-Write';

export interface MibTreeNode {
  oid: string;
  subId: string;
  name: string;
  mib: string;
  dataType: MibDataType;
  access: MibAccess;
  isScalar?: boolean;
  isTable?: boolean;
  unit?: string;
  description: string;
  children?: MibTreeNode[];
}

export const MIB_TREE_ROOT: MibTreeNode = {
  oid: '.1',
  subId: '1',
  name: 'iso',
  mib: 'ISO-ROOT',
  dataType: 'Branch',
  access: 'Not-Accessible',
  description: 'Raíz del árbol de identificadores de objetos (OID) asignado por la norma ISO/IEC.',
  children: [
    {
      oid: '.1.3',
      subId: '3',
      name: 'org',
      mib: 'ISO-ORG',
      dataType: 'Branch',
      access: 'Not-Accessible',
      description: 'Subárbol para organizaciones reconocidas internacionalmente.',
      children: [
        {
          oid: '.1.3.6',
          subId: '6',
          name: 'dod',
          mib: 'DOD-ROOT',
          dataType: 'Branch',
          access: 'Not-Accessible',
          description: 'Departamento de Defensa de EE. UU. (origen de la arquitectura TCP/IP).',
          children: [
            {
              oid: '.1.3.6.1',
              subId: '1',
              name: 'internet',
              mib: 'SNMPv2-SMI',
              dataType: 'Branch',
              access: 'Not-Accessible',
              description:
                'Rama principal de Internet (RFC 1155). Agrupa gestión estándar (mgmt) y extensiones privadas de fabricantes (private).',
              children: [
                {
                  oid: '.1.3.6.1.2',
                  subId: '2',
                  name: 'mgmt',
                  mib: 'SNMPv2-SMI',
                  dataType: 'Branch',
                  access: 'Not-Accessible',
                  description: 'Objetos de gestión estándar aprobados por la IETF.',
                  children: [
                    {
                      oid: '.1.3.6.1.2.1',
                      subId: '1',
                      name: 'mib-2',
                      mib: 'RFC1213-MIB',
                      dataType: 'Branch',
                      access: 'Not-Accessible',
                      description:
                        'Base de Información de Gestión versión 2. Todo dispositivo SNMP implementa sus grupos básicos (system, interfaces, host).',
                      children: [
                        {
                          oid: '.1.3.6.1.2.1.1',
                          subId: '1',
                          name: 'system',
                          mib: 'SNMPv2-MIB',
                          dataType: 'Branch',
                          access: 'Not-Accessible',
                          description:
                            'Información descriptiva general del sistema: modelo, uptime, contacto administrativo y ubicación física.',
                          children: [
                            {
                              oid: '.1.3.6.1.2.1.1.1.0',
                              subId: '1.0',
                              name: 'sysDescr.0',
                              mib: 'SNMPv2-MIB',
                              dataType: 'OCTET STRING',
                              access: 'Read-Only',
                              isScalar: true,
                              description:
                                'Cadena descriptiva del hardware, sistema operativo y versión de firmware del dispositivo (útil para auto-inventario).',
                            },
                            {
                              oid: '.1.3.6.1.2.1.1.2.0',
                              subId: '2.0',
                              name: 'sysObjectID.0',
                              mib: 'SNMPv2-MIB',
                              dataType: 'OBJECT IDENTIFIER',
                              access: 'Read-Only',
                              isScalar: true,
                              description:
                                'OID autoritativo del fabricante que identifica el modelo exacto del equipo (permite a Zabbix aplicar templates automáticamente).',
                            },
                            {
                              oid: '.1.3.6.1.2.1.1.3.0',
                              subId: '3.0',
                              name: 'sysUpTime.0',
                              mib: 'SNMPv2-MIB',
                              dataType: 'TimeTicks',
                              access: 'Read-Only',
                              isScalar: true,
                              unit: 's',
                              description:
                                'Tiempo en centésimas de segundo desde el último arranque del demonio SNMP. Caídas bruscas a 0 indican reinicio inesperado.',
                            },
                            {
                              oid: '.1.3.6.1.2.1.1.4.0',
                              subId: '4.0',
                              name: 'sysContact.0',
                              mib: 'SNMPv2-MIB',
                              dataType: 'OCTET STRING',
                              access: 'Read-Write',
                              isScalar: true,
                              description:
                                'Persona o correo responsable del equipo. Modificable remotamente mediante snmpset con comunidad RW o SNMPv3.',
                            },
                            {
                              oid: '.1.3.6.1.2.1.1.5.0',
                              subId: '5.0',
                              name: 'sysName.0',
                              mib: 'SNMPv2-MIB',
                              dataType: 'OCTET STRING',
                              access: 'Read-Write',
                              isScalar: true,
                              description:
                                'Nombre administrativo FQDN o hostname configurado en el nodo.',
                            },
                            {
                              oid: '.1.3.6.1.2.1.1.6.0',
                              subId: '6.0',
                              name: 'sysLocation.0',
                              mib: 'SNMPv2-MIB',
                              dataType: 'OCTET STRING',
                              access: 'Read-Write',
                              isScalar: true,
                              description:
                                'Ubicación física del equipo (ej. Rack-A3, Sala Servidores Planta 1). Modificable vía snmpset.',
                            },
                          ],
                        },
                        {
                          oid: '.1.3.6.1.2.1.2',
                          subId: '2',
                          name: 'interfaces',
                          mib: 'IF-MIB',
                          dataType: 'Branch',
                          access: 'Not-Accessible',
                          description:
                            'Métricas de interfaces de red físicas y lógicas (puertos Ethernet, VLANs, túneles).',
                          children: [
                            {
                              oid: '.1.3.6.1.2.1.2.1.0',
                              subId: '1.0',
                              name: 'ifNumber.0',
                              mib: 'IF-MIB',
                              dataType: 'INTEGER',
                              access: 'Read-Only',
                              isScalar: true,
                              description:
                                'Número total de interfaces de red presentes en el dispositivo.',
                            },
                            {
                              oid: '.1.3.6.1.2.1.2.2',
                              subId: '2',
                              name: 'ifTable',
                              mib: 'IF-MIB',
                              dataType: 'Table',
                              access: 'Not-Accessible',
                              isTable: true,
                              description:
                                'Tabla SNMP con una fila por interfaz. Compatible con el comando snmptable y reglas LLD (Low-Level Discovery) de Zabbix.',
                              children: [
                                {
                                  oid: '.1.3.6.1.2.1.2.2.1.2',
                                  subId: '2.1.2',
                                  name: 'ifDescr',
                                  mib: 'IF-MIB',
                                  dataType: 'OCTET STRING',
                                  access: 'Read-Only',
                                  description:
                                    'Nombre descriptivo de cada interfaz (ej. eth0, gi0/1, wan1). Usa snmpwalk para listar todos los índices.',
                                  children: [
                                    {
                                      oid: '.1.3.6.1.2.1.2.2.1.2.1',
                                      subId: '.1',
                                      name: 'ifDescr.1',
                                      mib: 'IF-MIB',
                                      dataType: 'OCTET STRING',
                                      access: 'Read-Only',
                                      description: 'Nombre de la interfaz principal (índice 1).',
                                    },
                                    {
                                      oid: '.1.3.6.1.2.1.2.2.1.2.2',
                                      subId: '.2',
                                      name: 'ifDescr.2',
                                      mib: 'IF-MIB',
                                      dataType: 'OCTET STRING',
                                      access: 'Read-Only',
                                      description: 'Nombre de la interfaz secundaria / gestión (índice 2).',
                                    },
                                  ],
                                },
                                {
                                  oid: '.1.3.6.1.2.1.2.2.1.8',
                                  subId: '2.1.8',
                                  name: 'ifOperStatus',
                                  mib: 'IF-MIB',
                                  dataType: 'INTEGER',
                                  access: 'Read-Only',
                                  description:
                                    'Estado operativo actual del enlace: 1=up, 2=down, 3=testing. Crítico para detectar puertos caídos.',
                                  children: [
                                    {
                                      oid: '.1.3.6.1.2.1.2.2.1.8.1',
                                      subId: '.1',
                                      name: 'ifOperStatus.1',
                                      mib: 'IF-MIB',
                                      dataType: 'INTEGER',
                                      access: 'Read-Only',
                                      description: 'Estado operativo interfaz índice 1 (1=up, 2=down).',
                                    },
                                    {
                                      oid: '.1.3.6.1.2.1.2.2.1.8.2',
                                      subId: '.2',
                                      name: 'ifOperStatus.2',
                                      mib: 'IF-MIB',
                                      dataType: 'INTEGER',
                                      access: 'Read-Only',
                                      description: 'Estado operativo interfaz índice 2 (1=up, 2=down).',
                                    },
                                  ],
                                },
                                {
                                  oid: '.1.3.6.1.2.1.2.2.1.10',
                                  subId: '2.1.10',
                                  name: 'ifInOctets',
                                  mib: 'IF-MIB',
                                  dataType: 'Counter32',
                                  access: 'Read-Only',
                                  unit: 'Mbps',
                                  description:
                                    'Contador acumulativo de bytes recibidos. El NOC calcula la tasa Mbps derivando la diferencia entre dos polleos.',
                                  children: [
                                    {
                                      oid: '.1.3.6.1.2.1.2.2.1.10.1',
                                      subId: '.1',
                                      name: 'ifInOctets.1',
                                      mib: 'IF-MIB',
                                      dataType: 'Counter32',
                                      access: 'Read-Only',
                                      unit: 'Mbps',
                                      description: 'Bytes entrantes en interfaz índice 1.',
                                    },
                                    {
                                      oid: '.1.3.6.1.2.1.2.2.1.10.2',
                                      subId: '.2',
                                      name: 'ifInOctets.2',
                                      mib: 'IF-MIB',
                                      dataType: 'Counter32',
                                      access: 'Read-Only',
                                      unit: 'Mbps',
                                      description: 'Bytes entrantes en interfaz índice 2.',
                                    },
                                  ],
                                },
                                {
                                  oid: '.1.3.6.1.2.1.2.2.1.16',
                                  subId: '2.1.16',
                                  name: 'ifOutOctets',
                                  mib: 'IF-MIB',
                                  dataType: 'Counter32',
                                  access: 'Read-Only',
                                  unit: 'Mbps',
                                  description:
                                    'Contador acumulativo de bytes transmitidos por la interfaz.',
                                  children: [
                                    {
                                      oid: '.1.3.6.1.2.1.2.2.1.16.1',
                                      subId: '.1',
                                      name: 'ifOutOctets.1',
                                      mib: 'IF-MIB',
                                      dataType: 'Counter32',
                                      access: 'Read-Only',
                                      unit: 'Mbps',
                                      description: 'Bytes salientes en interfaz índice 1.',
                                    },
                                    {
                                      oid: '.1.3.6.1.2.1.2.2.1.16.2',
                                      subId: '.2',
                                      name: 'ifOutOctets.2',
                                      mib: 'IF-MIB',
                                      dataType: 'Counter32',
                                      access: 'Read-Only',
                                      unit: 'Mbps',
                                      description: 'Bytes salientes en interfaz índice 2.',
                                    },
                                  ],
                                },
                                {
                                  oid: '.1.3.6.1.2.1.2.2.1.14',
                                  subId: '2.1.14',
                                  name: 'ifInErrors',
                                  mib: 'IF-MIB',
                                  dataType: 'Counter32',
                                  access: 'Read-Only',
                                  unit: 'err',
                                  description:
                                    'Paquetes entrantes descartados por errores CRC/FCS o cableado defectuoso.',
                                  children: [
                                    {
                                      oid: '.1.3.6.1.2.1.2.2.1.14.1',
                                      subId: '.1',
                                      name: 'ifInErrors.1',
                                      mib: 'IF-MIB',
                                      dataType: 'Counter32',
                                      access: 'Read-Only',
                                      unit: 'err',
                                      description: 'Errores CRC/FCS acumulados en interfaz índice 1.',
                                    },
                                  ],
                                },
                              ],
                            },
                          ],
                        },
                        {
                          oid: '.1.3.6.1.2.1.25',
                          subId: '25',
                          name: 'host',
                          mib: 'HOST-RESOURCES-MIB',
                          dataType: 'Branch',
                          access: 'Not-Accessible',
                          description:
                            'MIB estándar (RFC 2790) para monitorizar sistemas operativos, memoria, particiones de disco y procesadores sin agente propietario.',
                          children: [
                            {
                              oid: '.1.3.6.1.2.1.25.2',
                              subId: '2',
                              name: 'hrStorage',
                              mib: 'HOST-RESOURCES-MIB',
                              dataType: 'Branch',
                              access: 'Not-Accessible',
                              description: 'Subárbol de memoria física, virtual y sistemas de archivos.',
                              children: [
                                {
                                  oid: '.1.3.6.1.2.1.25.2.3',
                                  subId: '3',
                                  name: 'hrStorageTable',
                                  mib: 'HOST-RESOURCES-MIB',
                                  dataType: 'Table',
                                  access: 'Not-Accessible',
                                  isTable: true,
                                  description:
                                    'Tabla de volúmenes y memoria. Cada índice representa RAM (1) o partición montada (31).',
                                  children: [
                                    {
                                      oid: '.1.3.6.1.2.1.25.2.3.1.3.1',
                                      subId: '3.1.3.1',
                                      name: 'hrStorageDescr.1',
                                      mib: 'HOST-RESOURCES-MIB',
                                      dataType: 'OCTET STRING',
                                      access: 'Read-Only',
                                      description: 'Descripción del bloque de almacenamiento índice 1 (Physical Memory).',
                                    },
                                    {
                                      oid: '.1.3.6.1.2.1.25.2.3.1.6.1',
                                      subId: '3.1.6.1',
                                      name: 'hrStorageUsed.1',
                                      mib: 'HOST-RESOURCES-MIB',
                                      dataType: 'Gauge32',
                                      access: 'Read-Only',
                                      unit: '%',
                                      description: 'Porcentaje/unidades de memoria RAM asignadas.',
                                    },
                                    {
                                      oid: '.1.3.6.1.2.1.25.2.3.1.3.31',
                                      subId: '3.1.3.31',
                                      name: 'hrStorageDescr.31',
                                      mib: 'HOST-RESOURCES-MIB',
                                      dataType: 'OCTET STRING',
                                      access: 'Read-Only',
                                      description: 'Punto de montaje de la partición principal (/).',
                                    },
                                    {
                                      oid: '.1.3.6.1.2.1.25.2.3.1.6.31',
                                      subId: '3.1.6.31',
                                      name: 'hrStorageUsed.31',
                                      mib: 'HOST-RESOURCES-MIB',
                                      dataType: 'Gauge32',
                                      access: 'Read-Only',
                                      unit: '%',
                                      description: 'Uso actual de la partición principal (/).',
                                    },
                                  ],
                                },
                              ],
                            },
                            {
                              oid: '.1.3.6.1.2.1.25.3',
                              subId: '3',
                              name: 'hrDevice',
                              mib: 'HOST-RESOURCES-MIB',
                              dataType: 'Branch',
                              access: 'Not-Accessible',
                              description: 'Dispositivos de hardware detectados, incluyendo núcleos CPU.',
                              children: [
                                {
                                  oid: '.1.3.6.1.2.1.25.3.3.1.2.1',
                                  subId: '3.1.2.1',
                                  name: 'hrProcessorLoad.1',
                                  mib: 'HOST-RESOURCES-MIB',
                                  dataType: 'INTEGER',
                                  access: 'Read-Only',
                                  unit: '%',
                                  description:
                                    'Porcentaje promedio del último minuto durante el cual el procesador 1 no estuvo inactivo (0–100%).',
                                },
                                {
                                  oid: '.1.3.6.1.2.1.25.3.3.1.2.2',
                                  subId: '3.1.2.2',
                                  name: 'hrProcessorLoad.2',
                                  mib: 'HOST-RESOURCES-MIB',
                                  dataType: 'INTEGER',
                                  access: 'Read-Only',
                                  unit: '%',
                                  description: 'Carga de CPU del núcleo lógico 2 (0–100%).',
                                },
                              ],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
                {
                  oid: '.1.3.6.1.4',
                  subId: '4',
                  name: 'private',
                  mib: 'SNMPv2-SMI',
                  dataType: 'Branch',
                  access: 'Not-Accessible',
                  description: 'Rama asignada a extensiones privadas de fabricantes y software.',
                  children: [
                    {
                      oid: '.1.3.6.1.4.1',
                      subId: '1',
                      name: 'enterprises',
                      mib: 'SNMPv2-SMI',
                      dataType: 'Branch',
                      access: 'Not-Accessible',
                      description:
                        'Registro PEN (Private Enterprise Numbers) de IANA: cada fabricante posee un identificador único bajo .1.3.6.1.4.1.',
                      children: [
                        {
                          oid: '.1.3.6.1.4.1.9',
                          subId: '9',
                          name: 'cisco',
                          mib: 'CISCO-SMI',
                          dataType: 'Branch',
                          access: 'Not-Accessible',
                          description:
                            'OID empresarial de Cisco Systems (PEN 9): sensores térmicos, fuentes de alimentación y BGP.',
                          children: [
                            {
                              oid: '.1.3.6.1.4.1.9.9.13.1.3.1.3.1',
                              subId: '9.13.1.3.1.3.1',
                              name: 'ciscoEnvMonTemperatureStatusValue.1',
                              mib: 'CISCO-ENVMON-MIB',
                              dataType: 'Gauge32',
                              access: 'Read-Only',
                              unit: '°C',
                              description:
                                'Temperatura interna actual del chasis medida en grados Celsius por el sensor principal.',
                            },
                            {
                              oid: '.1.3.6.1.4.1.9.9.13.1.5.1.3.1',
                              subId: '9.13.1.5.1.3.1',
                              name: 'ciscoEnvMonSupplyState.1',
                              mib: 'CISCO-ENVMON-MIB',
                              dataType: 'INTEGER',
                              access: 'Read-Only',
                              description:
                                'Estado de la fuente de alimentación redundante PSU-1 (1=normal, 2=warning, 3=critical).',
                            },
                          ],
                        },
                        {
                          oid: '.1.3.6.1.4.1.12356',
                          subId: '12356',
                          name: 'fortinet',
                          mib: 'FORTINET-CORE-MIB',
                          dataType: 'Branch',
                          access: 'Not-Accessible',
                          description:
                            'OID empresarial de Fortinet (PEN 12356): tablas de sesiones firewall, IPS y VPN IPsec.',
                          children: [
                            {
                              oid: '.1.3.6.1.4.1.12356.101.4.1.8.0',
                              subId: '101.4.1.8.0',
                              name: 'fgSysSesCount.0',
                              mib: 'FORTINET-FORTIGATE-MIB',
                              dataType: 'Gauge32',
                              access: 'Read-Only',
                              isScalar: true,
                              unit: 'ses',
                              description:
                                'Número total de sesiones activas en la tabla de estado (conntrack) del firewall perimetral.',
                            },
                            {
                              oid: '.1.3.6.1.4.1.12356.101.4.1.3.0',
                              subId: '101.4.1.3.0',
                              name: 'fgSysCpuUsage.0',
                              mib: 'FORTINET-FORTIGATE-MIB',
                              dataType: 'Gauge32',
                              access: 'Read-Only',
                              isScalar: true,
                              unit: '%',
                              description: 'Porcentaje de utilización de CPU del firewall FortiGate.',
                            },
                          ],
                        },
                        {
                          oid: '.1.3.6.1.4.1.2021',
                          subId: '2021',
                          name: 'ucdavis',
                          mib: 'UCD-SNMP-MIB',
                          dataType: 'Branch',
                          access: 'Not-Accessible',
                          description:
                            'MIB extendida de Net-SNMP / Linux (PEN 2021) para métricas de memoria, swap, carga y CPU.',
                          children: [
                            {
                              oid: '.1.3.6.1.4.1.2021.4.6.0',
                              subId: '4.6.0',
                              name: 'memAvailReal.0',
                              mib: 'UCD-SNMP-MIB',
                              dataType: 'INTEGER',
                              access: 'Read-Only',
                              isScalar: true,
                              unit: 'KB',
                              description: 'Memoria RAM física libre disponible en kilobytes.',
                            },
                            {
                              oid: '.1.3.6.1.4.1.2021.4.3.0',
                              subId: '4.3.0',
                              name: 'memTotalSwap.0',
                              mib: 'UCD-SNMP-MIB',
                              dataType: 'INTEGER',
                              access: 'Read-Only',
                              isScalar: true,
                              unit: 'KB',
                              description: 'Espacio total configurado de memoria de intercambio (Swap).',
                            },
                            {
                              oid: '.1.3.6.1.4.1.2021.4.4.0',
                              subId: '4.4.0',
                              name: 'memAvailSwap.0',
                              mib: 'UCD-SNMP-MIB',
                              dataType: 'INTEGER',
                              access: 'Read-Only',
                              isScalar: true,
                              unit: 'KB',
                              description:
                                'Espacio de Swap libre. Si cae cerca de 0 indica agotamiento de memoria.',
                            },
                            {
                              oid: '.1.3.6.1.4.1.2021.11.9.0',
                              subId: '11.9.0',
                              name: 'ssCpuUser.0',
                              mib: 'UCD-SNMP-MIB',
                              dataType: 'INTEGER',
                              access: 'Read-Only',
                              isScalar: true,
                              unit: '%',
                              description: 'Porcentaje de tiempo de CPU consumido en procesos de usuario.',
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

export function flattenMibNodes(node: MibTreeNode = MIB_TREE_ROOT): MibTreeNode[] {
  const list: MibTreeNode[] = [node];
  if (node.children) {
    for (const child of node.children) {
      list.push(...flattenMibNodes(child));
    }
  }
  return list;
}

export const ALL_MIB_NODES = flattenMibNodes(MIB_TREE_ROOT);

export function findMibNodeByOid(oidInput: string): MibTreeNode | undefined {
  const normalized = normalizeOid(oidInput);
  return ALL_MIB_NODES.find((n) => n.oid === normalized);
}

export function normalizeOid(oidInput: string): string {
  const trimmed = oidInput.trim();
  if (!trimmed) return '';
  return trimmed.startsWith('.') ? trimmed : `.${trimmed}`;
}
