import type { RackTemplate } from './rackTemplates'

const W = 200
const H = 70

// ── Color palette ─────────────────────────────────────────────────────────────
const BG: Record<string, string> = {
  Huawei: '#c00',    ZTE: '#e65c00',  Fiberhome: '#0066cc',
  Nokia: '#005aff',  Calix: '#6600cc', 'V-SOL': '#007755',
  Parks: '#cc6600',  Mikrotik: '#d40000', Cisco: '#1ba0d7',
  'TP-Link': '#4caf00', Ubiquiti: '#0559c9', Genérico: '#334155',
}
function brandBg(brand: string) { return BG[brand] ?? '#334155' }

// ── Port shapes ───────────────────────────────────────────────────────────────
function PonPort({ x, y, size = 7 }: { x: number; y: number; size?: number }) {
  return (
    <g>
      <rect x={x} y={y} width={size} height={size} rx={1.5} fill="#111" stroke="#555" strokeWidth={0.8} />
      <circle cx={x + size / 2} cy={y + size / 2} r={1.6} fill="#4ade80" />
    </g>
  )
}

function UplinkPort({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x} y={y} width={10} height={9} rx={1.5} fill="#111" stroke="#60a5fa" strokeWidth={1} />
      <rect x={x + 2} y={y + 2} width={6} height={5} rx={0.5} fill="#1e3a5f" />
    </g>
  )
}

function EthPort({ x, y, color = '#4ade80' }: { x: number; y: number; color?: string }) {
  return (
    <g>
      <rect x={x} y={y} width={10} height={9} rx={1} fill="#111" stroke={color} strokeWidth={0.8} />
      <rect x={x + 1.5} y={y + 1.5} width={7} height={6} rx={0.5} fill="#0b1628" />
    </g>
  )
}

function FiberAdapter({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <g>
      <rect x={x} y={y} width={9} height={9} rx={1} fill="#1e293b" stroke="#475569" strokeWidth={0.5} />
      <circle cx={x + 4.5} cy={y + 4.5} r={3} fill="#0b1628" stroke={color} strokeWidth={1} />
      <circle cx={x + 4.5} cy={y + 4.5} r={1.2} fill={color} />
    </g>
  )
}

// ── Panel renderers ───────────────────────────────────────────────────────────

function OltPanel({ t }: { t: RackTemplate }) {
  const pon     = t.ponPorts ?? 8
  const uplink  = t.uplinkPorts ?? 2
  const bg      = brandBg(t.brand)
  const cols    = Math.ceil(pon / 2)
  const startX  = 36
  const gap     = 9
  const rows    = 2

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
      {/* Chassis */}
      <rect width={W} height={H} fill="#111" rx={3} />
      {/* Brand strip */}
      <rect width={28} height={H} fill={bg} rx={3} />
      <rect x={25} width={3} height={H} fill={bg} />
      <text x={14} y={H / 2 + 4} textAnchor="middle" fontSize={7} fontWeight="bold"
        fill="white" transform={`rotate(-90,14,${H/2})`} style={{ letterSpacing: '0.05em' }}>
        {t.brand.toUpperCase()}
      </text>

      {/* PON group label */}
      <text x={startX} y={12} fontSize={6} fill="#64748b">PON</text>

      {/* PON ports in 2 rows */}
      {Array.from({ length: pon }, (_, i) => {
        const col = i % cols
        const row = Math.floor(i / cols)
        return <PonPort key={i} x={startX + col * gap} y={16 + row * 11} />
      })}

      {/* Uplink group */}
      <text x={W - uplink * 12 - 2} y={12} fontSize={6} fill="#60a5fa">UPL</text>
      {Array.from({ length: uplink }, (_, i) => (
        <UplinkPort key={i} x={W - uplink * 12 + i * 12 + 1} y={16} />
      ))}

      {/* LED row */}
      {Array.from({ length: Math.min(pon, 8) }, (_, i) => (
        <circle key={i} cx={startX + i * 9 + 4} cy={H - 8} r={2}
          fill={i % 3 === 0 ? '#4ade80' : '#1e3a5f'} />
      ))}

      {/* Model text */}
      <text x={W - 4} y={H - 5} textAnchor="end" fontSize={7} fontWeight="bold" fill="#94a3b8">
        {t.model}
      </text>

      {/* U size badge */}
      <rect x={startX - 28} y={H - 18} width={20} height={11} rx={2} fill="#1e293b" />
      <text x={startX - 18} y={H - 9} textAnchor="middle" fontSize={7} fill="#60a5fa">{t.heightU}U</text>
    </svg>
  )
}

function SwitchPanel({ t }: { t: RackTemplate }) {
  const access  = t.switchAccess ?? 24
  const uplink  = t.switchUplink ?? 2
  const bg      = brandBg(t.brand)
  const cols    = Math.min(access, 24)
  const rows    = Math.ceil(access / 24)
  const pSize   = 7
  const gap     = 9
  const startX  = 32

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
      <rect width={W} height={H} fill="#0d1e14" rx={3} />
      <rect width={26} height={H} fill={bg} rx={3} />
      <rect x={23} width={3} height={H} fill={bg} />
      <text x={13} y={H/2+4} textAnchor="middle" fontSize={7} fontWeight="bold"
        fill="white" transform={`rotate(-90,13,${H/2})`}>{t.brand.toUpperCase()}</text>

      <text x={startX} y={12} fontSize={6} fill="#64748b">ACCESS ({access})</text>

      {Array.from({ length: Math.min(access, cols * rows) }, (_, i) => {
        const col = i % 24
        const row = Math.floor(i / 24)
        return <EthPort key={i} x={startX + col * (pSize + 2)} y={15 + row * 12} color="#4ade80" />
      })}

      <text x={W - uplink * 13} y={12} fontSize={6} fill="#60a5fa">SFP+</text>
      {Array.from({ length: uplink }, (_, i) => (
        <EthPort key={i} x={W - uplink * 13 + i * 13} y={15} color="#60a5fa" />
      ))}

      <text x={W - 4} y={H - 5} textAnchor="end" fontSize={7} fontWeight="bold" fill="#94a3b8">
        {t.model}
      </text>
    </svg>
  )
}

function OdfPanel({ t }: { t: RackTemplate }) {
  const ports   = t.portCount ?? 24
  const conn    = t.connectorType ?? 'SC/APC'
  const color   = conn.includes('APC') ? '#4ade80' : '#60a5fa'
  const cols    = Math.min(ports, 12)
  const rows    = Math.ceil(ports / 12)
  const gap     = 13
  const startX  = (W - cols * gap) / 2

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
      <rect width={W} height={H} fill="#0d1e3a" rx={3} />
      {/* Left ear */}
      <rect x={0} width={12} height={H} fill="#0b1628" rx={3} />
      <circle cx={6} cy={14} r={2.5} fill="#334155" />
      <circle cx={6} cy={H-14} r={2.5} fill="#334155" />
      {/* Right ear */}
      <rect x={W-12} width={12} height={H} fill="#0b1628" rx={3} />
      <circle cx={W-6} cy={14} r={2.5} fill="#334155" />
      <circle cx={W-6} cy={H-14} r={2.5} fill="#334155" />

      {/* Connector type label */}
      <rect x={W/2-18} y={4} width={36} height={10} rx={2} fill={color + '22'} />
      <text x={W/2} y={12} textAnchor="middle" fontSize={7} fontWeight="bold" fill={color}>
        {conn}
      </text>

      {/* Adapter grid */}
      {Array.from({ length: Math.min(ports, cols * rows) }, (_, i) => {
        const col = i % cols
        const row = Math.floor(i / cols)
        return <FiberAdapter key={i} x={startX + col * gap} y={18 + row * 14} color={color} />
      })}

      <text x={W/2} y={H-4} textAnchor="middle" fontSize={7} fill="#475569">
        {ports} puertos
      </text>
    </svg>
  )
}

function MikrotikPanel({ t }: { t: RackTemplate }) {
  const wan  = t.mkWan ?? 2
  const lan  = t.mkLan ?? 8
  const bg   = brandBg(t.brand)
  const startX = 34

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
      <rect width={W} height={H} fill="#0d1a2a" rx={3} />
      <rect width={26} height={H} fill={bg} rx={3} />
      <rect x={23} width={3} height={H} fill={bg} />
      <text x={13} y={H/2+4} textAnchor="middle" fontSize={7} fontWeight="bold"
        fill="white" transform={`rotate(-90,13,${H/2})`}>{t.brand.toUpperCase()}</text>

      <text x={startX} y={14} fontSize={6} fill="#f87171">WAN ({wan})</text>
      {Array.from({ length: wan }, (_, i) => (
        <EthPort key={i} x={startX + i * 14} y={17} color="#f87171" />
      ))}

      <text x={startX + wan * 14 + 6} y={14} fontSize={6} fill="#4ade80">LAN ({lan})</text>
      {Array.from({ length: lan }, (_, i) => (
        <EthPort key={i} x={startX + wan * 14 + 6 + i * 12} y={17} color="#4ade80" />
      ))}

      {/* PWR LED */}
      <circle cx={W - 10} cy={20} r={3} fill="#4ade80" />
      <text x={W - 10} y={32} textAnchor="middle" fontSize={5} fill="#4ade80">PWR</text>

      <text x={W - 4} y={H - 5} textAnchor="end" fontSize={7} fontWeight="bold" fill="#94a3b8">
        {t.model}
      </text>
    </svg>
  )
}

function SplitterPanel({ t }: { t: RackTemplate }) {
  const count = t.splitterCount ?? 4
  const ratio = t.splitterRatio ?? 8
  const cellW = Math.min(38, (W - 16) / Math.min(count, 5))

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
      <rect width={W} height={H} fill="#1a0d2e" rx={3} />
      <rect width={10} height={H} fill="#150b25" rx={3} />
      <circle cx={5} cy={12} r={2} fill="#334155" />
      <circle cx={5} cy={H-12} r={2} fill="#334155" />

      {Array.from({ length: Math.min(count, 5) }, (_, i) => {
        const x = 14 + i * (cellW + 2)
        const midX = x + cellW / 2
        const inY = 10
        const midY = H / 2 - 4
        const outSpacing = Math.min(10, (H - 28) / Math.min(ratio, 4))
        const outCount = Math.min(ratio, 4)
        const outStartY = midY + 8
        return (
          <g key={i}>
            {/* IN port */}
            <circle cx={midX} cy={inY + 3} r={3} fill="#111" stroke="#a855f7" strokeWidth={1} />
            {/* Line to center */}
            <line x1={midX} y1={inY + 6} x2={midX} y2={midY} stroke="#a855f7" strokeWidth={1} />
            {/* OUT lines */}
            {Array.from({ length: outCount }, (_, j) => {
              const oy = outStartY + j * outSpacing
              return (
                <g key={j}>
                  <line x1={midX} y1={midY} x2={midX} y2={oy} stroke="#7c3aed" strokeWidth={0.8} />
                  <circle cx={midX} cy={oy} r={2} fill="#111" stroke="#7c3aed" strokeWidth={0.8} />
                </g>
              )
            })}
            {ratio > 4 && (
              <text x={midX} y={outStartY + outCount * outSpacing + 4} textAnchor="middle"
                fontSize={5.5} fill="#7c3aed">+{ratio - 4}</text>
            )}
            {/* Splitter box */}
            <rect x={midX - 6} y={midY - 3} width={12} height={6} rx={1.5}
              fill="#2d1b52" stroke="#a855f7" strokeWidth={0.8} />
            <text x={midX} y={midY + 1.5} textAnchor="middle" fontSize={4.5} fill="#a855f7">
              1:{ratio}
            </text>
          </g>
        )
      })}
      {count > 5 && (
        <text x={W - 6} y={H/2} textAnchor="end" fontSize={8} fill="#7c3aed">+{count-5}</text>
      )}
      <text x={W - 4} y={H - 5} textAnchor="end" fontSize={7} fontWeight="bold" fill="#94a3b8">
        {count}× 1:{ratio}
      </text>
    </svg>
  )
}

// ── Export ────────────────────────────────────────────────────────────────────
export default function EquipmentPanel({ t }: { t: RackTemplate }) {
  switch (t.kind) {
    case 'olt':      return <OltPanel t={t} />
    case 'switch':   return <SwitchPanel t={t} />
    case 'odf':      return <OdfPanel t={t} />
    case 'mikrotik': return <MikrotikPanel t={t} />
    case 'splitter': return <SplitterPanel t={t} />
    default:         return null
  }
}
