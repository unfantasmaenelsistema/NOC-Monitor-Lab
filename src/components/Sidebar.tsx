import React from 'react';
import {
  Activity,
  AlertOctagon,
  Award,
  BookOpen,
  ExternalLink,
  FlaskConical,
  Gauge,
  Network,
  Server,
  Sliders,
  Wrench,
} from 'lucide-react';
import { NavSection } from '../types/noc';

interface SidebarProps {
  activeTab: NavSection;
  onSelectTab: (tab: NavSection) => void;
  activeProblemCount: number;
  maintenanceCount: number;
  nocXp: number;
  slaScore: number;
  onOpenGuide: () => void;
}

const NAV_ITEMS: Array<{
  id: NavSection;
  num: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'dashboard', num: '1', label: 'Dashboard NOC', icon: Gauge },
  { id: 'inventory', num: '2', label: 'Inventario de Hosts', icon: Server },
  { id: 'mib_explorer', num: '3', label: 'Explorador MIB & SNMP', icon: Network },
  { id: 'triggers', num: '4', label: 'Triggers & Umbrales', icon: Sliders },
  { id: 'problems', num: '5', label: 'Consola de Problemas', icon: AlertOctagon },
  { id: 'maintenance', num: '6', label: 'Ventanas de Mantenimiento', icon: Wrench },
  { id: 'lab_mode', num: '7', label: 'Modo Laboratorio', icon: FlaskConical },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  activeProblemCount,
  maintenanceCount,
  nocXp,
  slaScore,
  onOpenGuide,
}) => {
  return (
    <aside className="w-full lg:w-64 shrink-0 bg-[#111827] border-r border-[#1f2937] flex flex-col justify-between select-none">
      <div>
        {/* Brand Header */}
        <div className="px-4 py-4 border-b border-[#1f2937] flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-slate-100/95 p-1 flex items-center justify-center shrink-0 border border-slate-700/60">
            <img
              src={`${import.meta.env.BASE_URL}assets/logo.png`}
              alt="Logo Un Fantasma en el Sistema"
              referrerPolicy="no-referrer"
              className="w-full h-full object-contain"
            />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-slate-100 tracking-tight truncate">
              NOC Monitor Lab
            </h1>
            <a
              href="https://www.unfantasmaenelsistema.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-sky-400 hover:text-sky-300 transition-colors truncate max-w-full"
            >
              <span className="truncate">unfantasmaenelsistema.com</span>
              <ExternalLink className="w-3 h-3 shrink-0" />
            </a>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="px-3 py-4 space-y-1" aria-label="Navegación principal NOC">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            const countText =
              item.id === 'problems' && activeProblemCount > 0
                ? String(activeProblemCount)
                : item.id === 'maintenance' && maintenanceCount > 0
                ? String(maintenanceCount)
                : null;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`w-full flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-md text-[13px] font-medium transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
                  isActive
                    ? 'bg-sky-500/15 text-sky-300 border border-sky-500/30'
                    : 'text-slate-300 hover:bg-[#1f2937]/70 hover:text-slate-100 border border-transparent'
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-sky-400' : 'text-slate-400'}`} />
                  <span className="truncate whitespace-nowrap">
                    {item.num}. {item.label}
                  </span>
                </span>
                {countText !== null && (
                  <span
                    className={`font-mono tabular-nums text-[11px] font-semibold shrink-0 ${
                      item.id === 'problems' ? 'text-rose-400' : 'text-amber-400'
                    }`}
                  >
                    {countText}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Educational Reference & Attribution Footer */}
      <div className="p-4 border-t border-[#1f2937] space-y-3">
        <div className="bg-[#0b0f19] border border-[#1f2937] rounded-md px-3 py-2 flex items-center justify-between text-[11px] font-mono tabular-nums">
          <span className="inline-flex items-center gap-1 text-amber-300 font-semibold">
            <Award className="w-3.5 h-3.5" />
            <span>{nocXp} XP</span>
          </span>
          <span className="text-slate-700">|</span>
          <span
            className={
              slaScore >= 99
                ? 'text-emerald-400 font-semibold'
                : slaScore >= 95
                ? 'text-amber-300 font-semibold'
                : 'text-rose-400 font-semibold'
            }
          >
            SLA {slaScore.toFixed(1)}%
          </span>
        </div>

        <button
          type="button"
          onClick={onOpenGuide}
          className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded bg-[#0b0f19] border border-[#1f2937] hover:border-sky-500/50 text-xs text-slate-200 font-medium transition-colors"
        >
          <BookOpen className="w-3.5 h-3.5 text-sky-400" />
          <span>Guía NOC y Atajos</span>
        </button>

        <div className="space-y-1 text-xs text-slate-400 leading-relaxed">
          <div className="flex items-center gap-1.5 text-slate-200 font-medium">
            <Activity className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <span>Pasivo vs Activo</span>
          </div>
          <p className="text-[11px] text-slate-400">
            <span className="text-sky-300 font-medium">Pasivo:</span> SNMP 161, ZBX 10050, ICMP.
          </p>
          <p className="text-[11px] text-slate-400">
            <span className="text-emerald-300 font-medium">Activo / Trap:</span> Push 10051 / 162.
          </p>
        </div>

        <div className="pt-2 border-t border-[#1f2937] flex items-center justify-between text-[11px] text-slate-500">
          <span>100% Client-Side</span>
          <a
            href="https://www.unfantasmaenelsistema.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-400 hover:text-sky-400 transition-colors"
          >
            Blog & Lab
          </a>
        </div>
      </div>
    </aside>
  );
};
