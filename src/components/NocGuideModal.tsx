import React from 'react';
import {
  Activity,
  BookOpen,
  Keyboard,
  Network,
  ShieldAlert,
  Sliders,
  Wrench,
  X,
} from 'lucide-react';
import { ZABBIX_SEVERITIES } from '../data/initialData';

interface NocGuideModalProps {
  open: boolean;
  onClose: () => void;
}

export const NocGuideModal: React.FC<NocGuideModalProps> = ({ open, onClose }) => {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Guía rápida de referencia NOC"
    >
      <div className="bg-[#111827] border border-[#1f2937] rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-[#1f2937] bg-[#0b0f19] flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <BookOpen className="w-4 h-4 text-sky-400 shrink-0" />
            <div>
              <h3 className="text-sm font-semibold text-slate-100">
                Guía de Referencia NOC — Zabbix, SNMP y Operación
              </h3>
              <p className="text-[11px] text-slate-400">
                Chuleta técnica para formación en monitorización de redes y triaje de incidentes
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar guía NOC"
            className="p-1.5 rounded border border-[#1f2937] text-slate-400 hover:text-slate-100 hover:bg-[#1f2937]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5 text-xs">
          {/* Passive vs Active vs Traps */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-[#0b0f19] border border-[#1f2937] rounded-lg p-3.5 space-y-1.5">
              <div className="flex items-center gap-2 font-semibold text-sky-300">
                <Activity className="w-4 h-4 shrink-0" />
                <span>Chequeo Pasivo (NOC &rarr; Host)</span>
              </div>
              <p className="text-slate-300 leading-relaxed">
                El servidor NOC abre la conexión periódicamente contra el equipo (SNMP{' '}
                <code className="font-mono text-sky-200">UDP/161</code>, Zabbix Agent{' '}
                <code className="font-mono text-sky-200">TCP/10050</code> o ICMP). Simple de
                centralizar, pero limitado por los pollers del servidor.
              </p>
            </div>

            <div className="bg-[#0b0f19] border border-[#1f2937] rounded-lg p-3.5 space-y-1.5">
              <div className="flex items-center gap-2 font-semibold text-emerald-300">
                <Activity className="w-4 h-4 shrink-0" />
                <span>Agente Activo (Host &rarr; NOC)</span>
              </div>
              <p className="text-slate-300 leading-relaxed">
                El agente instalado en el servidor solicita su lista de ítems al NOC (
                <code className="font-mono text-emerald-200">TCP/10051</code>), los recolecta y los
                envía en lotes comprimidos. Ideal detrás de firewalls/NAT y alta escala.
              </p>
            </div>

            <div className="bg-[#0b0f19] border border-[#1f2937] rounded-lg p-3.5 space-y-1.5">
              <div className="flex items-center gap-2 font-semibold text-amber-300">
                <Network className="w-4 h-4 shrink-0" />
                <span>SNMP Trap Asíncrono (UDP/162)</span>
              </div>
              <p className="text-slate-300 leading-relaxed">
                El switch, router o firewall emite un datagrama instantáneo al producirse un evento
                (<code className="font-mono text-amber-200">linkDown</code>,{' '}
                <code className="font-mono text-amber-200">authenticationFailure</code>) sin esperar
                al siguiente ciclo de polling.
              </p>
            </div>
          </div>

          {/* MIB & SNMP Credentials */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-[#0b0f19] border border-[#1f2937] rounded-lg p-4 space-y-2">
              <h4 className="font-semibold text-slate-100 flex items-center gap-1.5">
                <Network className="w-4 h-4 text-sky-400" />
                <span>Credenciales y Ramas MIB del Laboratorio</span>
              </h4>
              <ul className="space-y-1.5 text-slate-300 font-mono text-[11px]">
                <li>
                  <span className="text-slate-400">SNMPv2c RO / RW:</span> public / private
                </li>
                <li>
                  <span className="text-slate-400">SNMPv3 authPriv:</span> nocadmin / NocAuth#2026 /
                  NocPriv#2026
                </li>
                <li>
                  <span className="text-slate-400">MIB-2 System:</span> .1.3.6.1.2.1.1 (sysDescr,
                  sysUpTime)
                </li>
                <li>
                  <span className="text-slate-400">MIB-2 Interfaces:</span> .1.3.6.1.2.1.2.2
                  (ifTable)
                </li>
                <li>
                  <span className="text-slate-400">Fortinet Sesiones:</span>{' '}
                  .1.3.6.1.4.1.12356.101.4.1.8.0
                </li>
              </ul>
            </div>

            <div className="bg-[#0b0f19] border border-[#1f2937] rounded-lg p-4 space-y-2">
              <h4 className="font-semibold text-slate-100 flex items-center gap-1.5">
                <Sliders className="w-4 h-4 text-emerald-400" />
                <span>Diseño Sólido de Triggers (Sin Falsos Positivos)</span>
              </h4>
              <ul className="space-y-1.5 text-slate-300 leading-relaxed">
                <li>
                  <strong className="text-slate-100">Ventana temporal:</strong> evita{' '}
                  <code className="font-mono text-rose-300">last() &gt; 85</code> en métricas
                  volátiles; usa{' '}
                  <code className="font-mono text-emerald-300">avg(5m) &gt; 85</code>.
                </li>
                <li>
                  <strong className="text-slate-100">Histéresis:</strong> separa umbral de disparo
                  (&gt; 105 ms) y recuperación (&lt; 85 ms) para eliminar el <em>flapping</em>.
                </li>
                <li>
                  <strong className="text-slate-100">Dependencias (RCA):</strong> enlaza los nodos
                  hijos al switch core para suprimir tormentas de falsas caídas.
                </li>
              </ul>
            </div>
          </div>

          {/* Severities & Maintenance */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-[#0b0f19] border border-[#1f2937] rounded-lg p-4 space-y-2.5">
              <h4 className="font-semibold text-slate-100 flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-rose-400" />
                <span>Severidades Oficiales Zabbix</span>
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {ZABBIX_SEVERITIES.map((s) => (
                  <div
                    key={s.key}
                    className="px-2.5 py-1.5 rounded text-[11px] font-bold text-center"
                    style={{ backgroundColor: s.color, color: s.textColor }}
                  >
                    {s.label}
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-[#0b0f19] border border-[#1f2937] rounded-lg p-4 space-y-2">
              <h4 className="font-semibold text-slate-100 flex items-center gap-1.5">
                <Keyboard className="w-4 h-4 text-amber-400" />
                <span>Atajos de Teclado en Consola</span>
              </h4>
              <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-300 font-mono">
                <div>
                  <span className="text-sky-300 font-bold">[1–7]</span> Cambiar de módulo
                </div>
                <div>
                  <span className="text-sky-300 font-bold">[P]</span> Pausar / Reanudar sim.
                </div>
                <div>
                  <span className="text-sky-300 font-bold">[C]</span> Abrir Inyector de Caos
                </div>
                <div>
                  <span className="text-sky-300 font-bold">[Esc]</span> Cerrar modal / drawer
                </div>
              </div>
              <div className="pt-1 text-[11px] text-slate-400 flex items-center gap-1.5">
                <Wrench className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>
                  Usa <strong>With data collection</strong> para conservar gráficas sin penalizar
                  SLA.
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-[#1f2937] bg-[#0b0f19] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
};
