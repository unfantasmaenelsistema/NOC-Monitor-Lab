import React from 'react';
import { Host, HostStatus } from '../types/noc';

interface NetworkTopologySvgProps {
  hosts: Host[];
  selectedHostId: string | null;
  onSelectHost: (hostId: string) => void;
}

interface NodePos {
  x: number;
  y: number;
}

const FIXED_LAYOUT: Record<string, NodePos> = {
  'rtr-borde-isp': { x: 420, y: 48 },
  'fw-perimetral-01': { x: 420, y: 132 },
  'sw-core-01': { x: 420, y: 218 },
  'srv-ad-dc01': { x: 110, y: 330 },
  'srv-db-prod': { x: 265, y: 330 },
  'srv-web-front': { x: 420, y: 330 },
  'nas-backup-01': { x: 575, y: 330 },
  'ap-planta1-wifi': { x: 730, y: 330 },
};

function statusColors(status: HostStatus): {
  stroke: string;
  fill: string;
  text: string;
  label: string;
} {
  switch (status) {
    case 'UP':
      return { stroke: '#10b981', fill: '#064e3b', text: '#6ee7b7', label: 'UP' };
    case 'WARNING':
      return { stroke: '#f59e0b', fill: '#451a03', text: '#fcd34d', label: 'WARN' };
    case 'DOWN':
      return { stroke: '#ef4444', fill: '#450a0a', text: '#fca5a5', label: 'DOWN' };
    case 'MAINTENANCE':
      return { stroke: '#64748b', fill: '#1e293b', text: '#cbd5e1', label: 'MANT' };
  }
}

export const NetworkTopologySvg: React.FC<NetworkTopologySvgProps> = ({
  hosts,
  selectedHostId,
  onSelectHost,
}) => {
  // Compute positions for both core 8 hosts and any user-added hosts
  const extraHosts = hosts.filter((h) => !FIXED_LAYOUT[h.id]);
  const positions: Record<string, NodePos> = { ...FIXED_LAYOUT };

  extraHosts.forEach((h, idx) => {
    const col = idx % 4;
    const row = Math.floor(idx / 4);
    positions[h.id] = {
      x: 160 + col * 175,
      y: 418 + row * 72,
    };
  });

  const viewHeight = extraHosts.length > 0 ? 485 : 395;

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 840 ${viewHeight}`}
        className="w-full h-auto min-w-[660px] select-none"
        role="img"
        aria-label="Mapa topológico interactivo de red"
      >
        <defs>
          <pattern id="noc-grid" width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#161f30" strokeWidth="1" />
          </pattern>
        </defs>

        <rect width="840" height={viewHeight} fill="#0b0f19" rx="6" />
        <rect width="840" height={viewHeight} fill="url(#noc-grid)" rx="6" />

        {/* Zone Labels */}
        <text x="18" y="28" fill="#64748b" fontSize="10" fontFamily="JetBrains Mono, monospace">
          WAN / PERÍMETRO
        </text>
        <text x="18" y="218" fill="#64748b" fontSize="10" fontFamily="JetBrains Mono, monospace">
          CORE L3
        </text>
        <text x="18" y="310" fill="#64748b" fontSize="10" fontFamily="JetBrains Mono, monospace">
          VLANs SERVICIOS & ACCESO
        </text>

        {/* Topology Links */}
        {hosts.map((host) => {
          const parentId = host.parentId ?? (host.id !== 'rtr-borde-isp' ? 'sw-core-01' : null);
          if (!parentId) return null;
          const pPos = positions[parentId];
          const cPos = positions[host.id];
          if (!pPos || !cPos) return null;

          const parentHost = hosts.find((h) => h.id === parentId);
          const linkDown =
            host.status === 'DOWN' || (parentHost && parentHost.status === 'DOWN');
          const linkWarn =
            !linkDown &&
            (host.status === 'WARNING' ||
              host.metrics.netInMbps + host.metrics.netOutMbps > 800);
          const linkMaint = host.status === 'MAINTENANCE';

          const strokeColor = linkDown
            ? '#ef4444'
            : linkMaint
            ? '#475569'
            : linkWarn
            ? '#f59e0b'
            : '#0ea5e9';

          const midX = (pPos.x + cPos.x) / 2;
          const midY = (pPos.y + cPos.y) / 2;
          const totalMbps = Math.round(host.metrics.netInMbps + host.metrics.netOutMbps);

          return (
            <g key={`link-${host.id}`}>
              <line
                x1={pPos.x}
                y1={pPos.y}
                x2={cPos.x}
                y2={cPos.y}
                stroke={strokeColor}
                strokeOpacity={linkMaint ? 0.45 : 0.7}
                strokeWidth={linkDown ? 2 : 1.75}
                strokeDasharray={linkDown ? '5 4' : undefined}
              />
              {!linkMaint && (
                <g transform={`translate(${midX}, ${midY})`}>
                  <rect
                    x="-28"
                    y="-9"
                    width="56"
                    height="17"
                    rx="3"
                    fill="#111827"
                    stroke="#1f2937"
                    strokeWidth="1"
                  />
                  <text
                    x="0"
                    y="3"
                    textAnchor="middle"
                    fill={linkDown ? '#fca5a5' : '#94a3b8'}
                    fontSize="9.5"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {linkDown ? 'LOSS 100%' : `${totalMbps} Mbps`}
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {/* Host Nodes */}
        {hosts.map((host) => {
          const pos = positions[host.id];
          if (!pos) return null;
          const colors = statusColors(host.status);
          const isSelected = selectedHostId === host.id;

          return (
            <g
              key={host.id}
              transform={`translate(${pos.x}, ${pos.y})`}
              onClick={() => onSelectHost(host.id)}
              className="cursor-pointer"
              role="button"
              tabIndex={0}
              aria-label={`${host.hostname} (${host.ip}) estado ${host.status}`}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectHost(host.id);
                }
              }}
            >
              <rect
                x="-66"
                y="-26"
                width="132"
                height="52"
                rx="6"
                fill="#111827"
                stroke={isSelected ? '#38bdf8' : colors.stroke}
                strokeWidth={isSelected ? 2 : 1.5}
              />
              {/* Top status bar inside node */}
              <rect
                x="-65"
                y="-25"
                width="130"
                height="4"
                rx="2"
                fill={colors.stroke}
              />

              <text
                x="0"
                y="-6"
                textAnchor="middle"
                fill="#f1f5f9"
                fontSize="10.5"
                fontWeight="600"
                fontFamily="JetBrains Mono, monospace"
              >
                {host.hostname.length > 16 ? `${host.hostname.slice(0, 15)}…` : host.hostname}
              </text>

              <text
                x="0"
                y="9"
                textAnchor="middle"
                fill="#94a3b8"
                fontSize="9.5"
                fontFamily="JetBrains Mono, monospace"
              >
                {host.ip}
              </text>

              <text
                x="0"
                y="21"
                textAnchor="middle"
                fill={colors.text}
                fontSize="9"
                fontWeight="600"
                fontFamily="JetBrains Mono, monospace"
              >
                {colors.label} · CPU {host.status === 'DOWN' ? '0' : Math.round(host.metrics.cpu)}%
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};
