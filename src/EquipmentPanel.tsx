import type { RackTemplate } from './rackTemplates'

const W = 440
const H = 88

// ── Brand colors ──────────────────────────────────────────────────────────────
const BRAND: Record<string, { bg: string; accent: string; text: string }> = {
  Huawei:    { bg: '#c00020', accent: '#ff2040', text: '#fff' },
  ZTE:       { bg: '#e65c00', accent: '#ff7722', text: '#fff' },
  Fiberhome: { bg: '#0055bb', accent: '#2277ff', text: '#fff' },
  Nokia:     { bg: '#124191', accent: '#1a5fd4', text: '#fff' },
  Calix:     { bg: '#5500aa', accent: '#7722ee', text: '#fff' },
  'V-SOL':   { bg: '#006644', accent: '#00aa66', text: '#fff' },
  Parks:     { bg: '#884400', accent: '#bb6600', text: '#fff' },
  Mikrotik:  { bg: '#990000', accent: '#cc1111', text: '#fff' },
  Cisco:     { bg: '#1d5fa6', accent: '#2277cc', text: '#fff' },
  'TP-Link': { bg: '#3a7a00', accent: '#55aa00', text: '#fff' },
  Ubiquiti:  { bg: '#0050d0', accent: '#1166ff', text: '#fff' },
  Genérico:  { bg: '#2d3a4a', accent: '#445566', text: '#ccc' },
}
function brand(b: string) { return BRAND[b] ?? BRAND['Genérico'] }

// ── Shared chassis base ───────────────────────────────────────────────────────
function Chassis({ children, brand: b }: { children: React.ReactNode; brand: string }) {
  const c = brand(b)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%"
      preserveAspectRatio="xMidYMid meet"
      style={{ display: 'block', position: 'absolute', inset: 0 }}>
      <defs>
        <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4a5568" />
          <stop offset="40%" stopColor="#2d3748" />
          <stop offset="100%" stopColor="#1a202c" />
        </linearGradient>
        <linearGradient id="ear" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#555" />
          <stop offset="100%" stopColor="#222" />
        </linearGradient>
        <linearGradient id={`br-${b}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={c.accent} />
          <stop offset="100%" stopColor={c.bg} />
        </linearGradient>
        <filter id="ledglow"><feGaussianBlur stdDeviation="1.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <filter id="sh"><feDropShadow dx="0" dy="1" stdDeviation="1" floodOpacity="0.5"/></filter>
      </defs>

      {/* Main chassis */}
      <rect width={W} height={H} rx={3} fill="url(#cg)" />

      {/* Top bevel */}
      <rect width={W} height={3} rx={1} fill="#666" opacity={0.4} />

      {/* Left rack ear */}
      <rect x={0} y={0} width={22} height={H} rx={2} fill="url(#ear)" />
      <circle cx={11} cy={10} r={4} fill="#111" stroke="#555" strokeWidth={1} />
      <circle cx={11} cy={10} r={2} fill="#333" />
      <circle cx={11} cy={H-10} r={4} fill="#111" stroke="#555" strokeWidth={1} />
      <circle cx={11} cy={H-10} r={2} fill="#333" />

      {/* Right rack ear */}
      <rect x={W-22} y={0} width={22} height={H} rx={2} fill="url(#ear)" />
      <circle cx={W-11} cy={10} r={4} fill="#111" stroke="#555" strokeWidth={1} />
      <circle cx={W-11} cy={10} r={2} fill="#333" />
      <circle cx={W-11} cy={H-10} r={4} fill="#111" stroke="#555" strokeWidth={1} />
      <circle cx={W-11} cy={H-10} r={2} fill="#333" />

      {/* Brand strip */}
      <rect x={22} y={0} width={38} height={H} fill={`url(#br-${b})`} />
      <rect x={58} y={0} width={2} height={H} fill="rgba(0,0,0,0.3)" />

      {/* Brand name vertical */}
      <text x={41} y={H/2+3} textAnchor="middle" fontSize={9} fontWeight="bold"
        fill={c.text} transform={`rotate(-90,41,${H/2})`}
        style={{ letterSpacing: '0.06em', fontFamily: 'Arial, sans-serif' }}>
        {b.toUpperCase()}
      </text>

      {/* Horizontal rule above content */}
      <line x1={60} y1={H-18} x2={W-22} y2={H-18} stroke="#1a202c" strokeWidth={1} opacity={0.6} />

      {children}
    </svg>
  )
}

// ── SFP Port (optical) ────────────────────────────────────────────────────────
function SfpPort({ x, y, active = false, color = '#22c55e' }: { x: number; y: number; active?: boolean; color?: string }) {
  return (
    <g>
      <rect x={x} y={y} width={14} height={13} rx={2} fill="#0d1520" stroke="#334155" strokeWidth={0.8} />
      <rect x={x+2} y={y+2} width={10} height={9} rx={1} fill="#0a1018" stroke="#1e3a5f" strokeWidth={0.5} />
      <rect x={x+4} y={y+4} width={6} height={5} rx={0.5} fill={active ? '#0d2010' : '#050a10'} />
      <circle cx={x+7} cy={y+6.5} r={1.8} fill={active ? color : '#1e3a5f'} />
      {active && <circle cx={x+7} cy={y+6.5} r={1.8} fill={color} filter="url(#ledglow)" opacity={0.6} />}
    </g>
  )
}

// ── RJ45 Port ─────────────────────────────────────────────────────────────────
function Rj45Port({ x, y, color = '#22c55e' }: { x: number; y: number; color?: string }) {
  return (
    <g>
      <rect x={x} y={y} width={13} height={12} rx={1.5} fill="#0d1520" stroke="#334155" strokeWidth={0.8} />
      <rect x={x+2} y={y+2.5} width={9} height={7} rx={0.5} fill="#060d16" />
      {[0,1.5,3,4.5,6,7.5].map((dx, i) => (
        <line key={i} x1={x+2.5+dx} y1={y+2.5} x2={x+2.5+dx} y2={y+6} stroke={color} strokeWidth={0.6} opacity={0.6} />
      ))}
      <circle cx={x+11} cy={y+2.5} r={1.5} fill={color} filter="url(#ledglow)" />
      <circle cx={x+11} cy={y+5.5} r={1.5} fill="#f59e0b" opacity={0.7} />
    </g>
  )
}

// ── LCD Display ───────────────────────────────────────────────────────────────
function Lcd({ x, y, w, h, text }: { x: number; y: number; w: number; h: number; text: string }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={2} fill="#0a1a0a" stroke="#1a3a1a" strokeWidth={0.8} />
      <rect x={x+2} y={y+2} width={w-4} height={h-4} rx={1} fill="#0d2010" />
      <text x={x+w/2} y={y+h/2+2.5} textAnchor="middle" fontSize={7}
        fill="#4ade80" style={{ fontFamily: 'monospace', letterSpacing: '0.05em' }}>{text}</text>
    </g>
  )
}

// ── LED ───────────────────────────────────────────────────────────────────────
function Led({ x, y, color, label }: { x: number; y: number; color: string; label?: string }) {
  return (
    <g>
      <circle cx={x} cy={y} r={3.5} fill={color} filter="url(#ledglow)" />
      <circle cx={x} cy={y} r={2} fill={color} opacity={0.9} />
      {label && <text x={x} y={y+10} textAnchor="middle" fontSize={5} fill="#64748b">{label}</text>}
    </g>
  )
}

// ── OLT Panel ────────────────────────────────────────────────────────────────
function OltPanel({ t }: { t: RackTemplate }) {
  const pon    = t.ponPorts ?? 8
  const uplink = t.uplinkPorts ?? 2
  const startX = 68
  const ponCols = Math.min(pon, 8)
  const ponRows = Math.ceil(pon / 8)

  return (
    <Chassis brand={t.brand}>
      {/* Model label */}
      <text x={startX} y={14} fontSize={8} fontWeight="bold" fill="#94a3b8"
        style={{ fontFamily: 'Arial, sans-serif' }}>
        {t.model}
      </text>

      {/* LCD */}
      <Lcd x={startX} y={18} w={60} h={22} text="GPON ✓" />

      {/* PWR LED */}
      <Led x={startX+68} y={24} color="#22c55e" label="PWR" />
      <Led x={startX+80} y={24} color="#f59e0b" label="ALM" />

      {/* PON label */}
      <text x={startX+96} y={22} fontSize={6} fill="#60a5fa"
        style={{ fontFamily: 'Arial, sans-serif', letterSpacing: '0.05em' }}>
        GPON / XGS-PON
      </text>

      {/* PON ports */}
      {Array.from({ length: pon }, (_, i) => {
        const col = i % ponCols
        const row = Math.floor(i / ponCols)
        return <SfpPort key={i}
          x={startX + 96 + col * 17}
          y={24 + row * 16}
          active={i % 3 !== 2}
          color="#22c55e" />
      })}

      {/* Uplink label */}
      <text x={W-22-uplink*18-4} y={22} fontSize={6} fill="#60a5fa"
        style={{ fontFamily: 'Arial, sans-serif' }}>
        10GE UPL
      </text>
      {Array.from({ length: uplink }, (_, i) => (
        <SfpPort key={i}
          x={W-22-uplink*18+i*18}
          y={26}
          active color="#60a5fa" />
      ))}

      {/* Bottom: port numbers */}
      {Array.from({ length: Math.min(pon, 8) }, (_, i) => (
        <text key={i} x={startX+96+i*17+7} y={H-6} textAnchor="middle"
          fontSize={5} fill="#475569"
          style={{ fontFamily: 'monospace' }}>{i+1}</text>
      ))}

      {/* U-size badge */}
      <rect x={startX} y={H-16} width={22} height={10} rx={2} fill="#1e3a5f" />
      <text x={startX+11} y={H-8} textAnchor="middle" fontSize={7}
        fill="#60a5fa" fontWeight="bold">{t.heightU}U</text>
    </Chassis>
  )
}

// ── Switch Panel ──────────────────────────────────────────────────────────────
function SwitchPanel({ t }: { t: RackTemplate }) {
  const access = t.switchAccess ?? 24
  const uplink = t.switchUplink ?? 2
  const startX = 68
  const cols24 = Math.min(access, 24)
  const rows   = Math.ceil(access / 24)

  return (
    <Chassis brand={t.brand}>
      <text x={startX} y={14} fontSize={8} fontWeight="bold" fill="#94a3b8"
        style={{ fontFamily: 'Arial, sans-serif' }}>{t.model}</text>

      <Led x={startX+60} y={10} color="#22c55e" label="PWR" />
      <Led x={startX+74} y={10} color="#22c55e" label="SYS" />

      {/* Access ports */}
      <text x={startX} y={26} fontSize={6} fill="#64748b">GbE ({access})</text>
      {Array.from({ length: access }, (_, i) => {
        const col = i % cols24
        const row = Math.floor(i / cols24)
        return <Rj45Port key={i}
          x={startX + col * 15}
          y={29 + row * 15}
          color={i % 4 === 3 ? '#f59e0b' : '#22c55e'} />
      })}

      {/* SFP uplinks */}
      <text x={W-22-uplink*18-40} y={26} fontSize={6} fill="#60a5fa">SFP+</text>
      {Array.from({ length: uplink }, (_, i) => (
        <SfpPort key={i}
          x={W-22-uplink*18+i*18}
          y={26}
          active color="#60a5fa" />
      ))}

      {/* Port numbers bottom */}
      {Array.from({ length: Math.min(access, 24) }, (_, i) => (
        <text key={i} x={startX+i*15+7} y={H-5} textAnchor="middle"
          fontSize={4.5} fill="#374151"
          style={{ fontFamily: 'monospace' }}>{i+1}</text>
      ))}
    </Chassis>
  )
}

// ── ODF Panel ────────────────────────────────────────────────────────────────
function OdfPanel({ t }: { t: RackTemplate }) {
  const ports   = t.portCount ?? 24
  const conn    = t.connectorType ?? 'SC/APC'
  const isApc   = conn.includes('APC')
  const isLc    = conn.includes('LC')
  const portColor = isApc ? '#22c55e' : '#60a5fa'
  const cols    = Math.min(ports, 16)
  const rows    = Math.ceil(ports / 16)
  const startX  = 68
  const gap     = isLc ? 14 : 18

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%"
      preserveAspectRatio="xMidYMid meet"
      style={{ display: 'block', position: 'absolute', inset: 0 }}>
      <defs>
        <linearGradient id="odf-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1a2840" />
          <stop offset="100%" stopColor="#0d1a2e" />
        </linearGradient>
        <linearGradient id="ear" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#555" />
          <stop offset="100%" stopColor="#222" />
        </linearGradient>
        <filter id="ledglow"><feGaussianBlur stdDeviation="1.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>

      <rect width={W} height={H} rx={3} fill="url(#odf-bg)" />
      <rect width={W} height={3} rx={1} fill="#445" opacity={0.4} />

      {/* Ears */}
      <rect x={0} y={0} width={22} height={H} rx={2} fill="url(#ear)" />
      <circle cx={11} cy={10} r={4} fill="#111" stroke="#555" strokeWidth={1} /><circle cx={11} cy={10} r={2} fill="#333" />
      <circle cx={11} cy={H-10} r={4} fill="#111" stroke="#555" strokeWidth={1} /><circle cx={11} cy={H-10} r={2} fill="#333" />
      <rect x={W-22} y={0} width={22} height={H} rx={2} fill="url(#ear)" />
      <circle cx={W-11} cy={10} r={4} fill="#111" stroke="#555" strokeWidth={1} /><circle cx={W-11} cy={10} r={2} fill="#333" />
      <circle cx={W-11} cy={H-10} r={4} fill="#111" stroke="#555" strokeWidth={1} /><circle cx={W-11} cy={H-10} r={2} fill="#333" />

      {/* Label panel */}
      <rect x={22} y={0} width={40} height={H} fill="#0d1a2e" />
      <text x={42} y={H/2+3} textAnchor="middle" fontSize={9} fontWeight="bold"
        fill={portColor} transform={`rotate(-90,42,${H/2})`}
        style={{ fontFamily: 'Arial, sans-serif' }}>ODF</text>

      {/* Connector type badge */}
      <rect x={startX} y={6} width={52} height={14} rx={3}
        fill={portColor + '22'} stroke={portColor} strokeWidth={0.8} />
      <text x={startX+26} y={16} textAnchor="middle" fontSize={8} fontWeight="bold"
        fill={portColor} style={{ fontFamily: 'Arial, sans-serif' }}>{conn}</text>

      {/* Ports */}
      {Array.from({ length: Math.min(ports, cols*rows) }, (_, i) => {
        const col = i % cols
        const row = Math.floor(i / cols)
        const x = startX + col * gap
        const y = 24 + row * 26
        if (isLc) {
          // LC: small round connector
          return (
            <g key={i}>
              <rect x={x} y={y} width={12} height={20} rx={2} fill="#0a1220" stroke="#1e3a5f" strokeWidth={0.7} />
              <circle cx={x+6} cy={y+7} r={4} fill="#0d1a2e" stroke={portColor} strokeWidth={0.8} />
              <circle cx={x+6} cy={y+7} r={2} fill={portColor} opacity={0.8} />
              <rect x={x+3} y={y+13} width={6} height={4} rx={1} fill="#1e3a5f" />
            </g>
          )
        }
        // SC: square connector
        return (
          <g key={i}>
            <rect x={x} y={y} width={15} height={20} rx={2} fill="#0a1220" stroke="#1e3a5f" strokeWidth={0.7} />
            <rect x={x+2} y={y+2} width={11} height={11} rx={1} fill="#0d1a2e" stroke={portColor} strokeWidth={0.8} />
            <circle cx={x+7.5} cy={y+7.5} r={2.5} fill={portColor} opacity={0.8} />
            <rect x={x+4} y={y+15} width={7} height={3} rx={1} fill="#1e3a5f" />
          </g>
        )
      })}

      <text x={W-26} y={H-6} textAnchor="end" fontSize={8} fontWeight="bold"
        fill="#475569" style={{ fontFamily: 'Arial, sans-serif' }}>
        {ports}p · {t.heightU}U
      </text>
    </svg>
  )
}

// ── Router/Mikrotik Panel ─────────────────────────────────────────────────────
function MikrotikPanel({ t }: { t: RackTemplate }) {
  const wan    = t.mkWan ?? 2
  const lan    = t.mkLan ?? 8
  const startX = 68

  return (
    <Chassis brand={t.brand}>
      <text x={startX} y={14} fontSize={8} fontWeight="bold" fill="#94a3b8"
        style={{ fontFamily: 'Arial, sans-serif' }}>{t.model}</text>

      <Led x={startX+70} y={10} color="#22c55e" label="PWR" />
      <Led x={startX+84} y={10} color="#22c55e" label="USR" />

      <text x={startX} y={28} fontSize={6} fill="#f87171">WAN ({wan})</text>
      {Array.from({ length: wan }, (_, i) => (
        <Rj45Port key={i} x={startX + i * 16} y={32} color="#f87171" />
      ))}

      <text x={startX + wan*16 + 8} y={28} fontSize={6} fill="#22c55e">LAN ({lan})</text>
      {Array.from({ length: lan }, (_, i) => (
        <Rj45Port key={i} x={startX + wan*16 + 8 + i * 16} y={32} color="#22c55e" />
      ))}

      {Array.from({ length: wan+lan }, (_, i) => (
        <text key={i} x={startX+(i < wan ? i*16 : wan*16+8+(i-wan)*16)+7} y={H-5}
          textAnchor="middle" fontSize={4.5} fill="#374151"
          style={{ fontFamily: 'monospace' }}>{i+1}</text>
      ))}
    </Chassis>
  )
}

// ── Splitter Panel ────────────────────────────────────────────────────────────
function SplitterPanel({ t }: { t: RackTemplate }) {
  const count = t.splitterCount ?? 4
  const ratio = t.splitterRatio ?? 8
  const startX = 68
  const cellW  = Math.min(50, (W - startX - 26) / Math.min(count, 7))

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%"
      preserveAspectRatio="xMidYMid meet"
      style={{ display: 'block', position: 'absolute', inset: 0 }}>
      <defs>
        <linearGradient id="sp-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1e1040" />
          <stop offset="100%" stopColor="#110820" />
        </linearGradient>
        <linearGradient id="ear" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#555" />
          <stop offset="100%" stopColor="#222" />
        </linearGradient>
      </defs>
      <rect width={W} height={H} rx={3} fill="url(#sp-bg)" />
      <rect width={W} height={3} rx={1} fill="#554" opacity={0.4} />

      <rect x={0} y={0} width={22} height={H} rx={2} fill="url(#ear)" />
      <circle cx={11} cy={10} r={4} fill="#111" stroke="#555" strokeWidth={1} /><circle cx={11} cy={10} r={2} fill="#333" />
      <circle cx={11} cy={H-10} r={4} fill="#111" stroke="#555" strokeWidth={1} /><circle cx={11} cy={H-10} r={2} fill="#333" />
      <rect x={W-22} y={0} width={22} height={H} rx={2} fill="url(#ear)" />
      <circle cx={W-11} cy={10} r={4} fill="#111" stroke="#555" strokeWidth={1} /><circle cx={W-11} cy={10} r={2} fill="#333" />
      <circle cx={W-11} cy={H-10} r={4} fill="#111" stroke="#555" strokeWidth={1} /><circle cx={W-11} cy={H-10} r={2} fill="#333" />

      <rect x={22} y={0} width={40} height={H} fill="#1a0838" />
      <text x={42} y={H/2+3} textAnchor="middle" fontSize={8} fontWeight="bold"
        fill="#a855f7" transform={`rotate(-90,42,${H/2})`}
        style={{ fontFamily: 'Arial, sans-serif' }}>SPLIT</text>

      {Array.from({ length: Math.min(count, 7) }, (_, i) => {
        const cx = startX + i * cellW + cellW / 2
        return (
          <g key={i}>
            {/* splitter box */}
            <rect x={cx-10} y={12} width={20} height={14} rx={3}
              fill="#2d1060" stroke="#a855f7" strokeWidth={1} />
            <text x={cx} y={22} textAnchor="middle" fontSize={7} fontWeight="bold"
              fill="#a855f7" style={{ fontFamily: 'Arial, sans-serif' }}>1:{ratio}</text>
            {/* input line */}
            <line x1={cx} y1={4} x2={cx} y2={12} stroke="#a855f7" strokeWidth={1.5} />
            <circle cx={cx} cy={4} r={3.5} fill="#0d1520" stroke="#a855f7" strokeWidth={1} />
            <circle cx={cx} cy={4} r={1.5} fill="#a855f7" />
            {/* output lines */}
            {Array.from({ length: Math.min(ratio, 4) }, (_, j) => {
              const outCount = Math.min(ratio, 4)
              const ox = cx + (j - (outCount-1)/2) * (cellW * 0.22)
              return (
                <g key={j}>
                  <line x1={cx} y1={26} x2={ox} y2={H-14} stroke="#7c3aed" strokeWidth={1} />
                  <circle cx={ox} cy={H-14} r={3} fill="#0d1520" stroke="#7c3aed" strokeWidth={0.8} />
                  <circle cx={ox} cy={H-14} r={1.2} fill="#7c3aed" />
                </g>
              )
            })}
            {ratio > 4 && (
              <text x={cx} y={H-4} textAnchor="middle" fontSize={5.5} fill="#7c3aed">+{ratio-4}</text>
            )}
          </g>
        )
      })}

      <text x={W-26} y={H-5} textAnchor="end" fontSize={7} fontWeight="bold"
        fill="#6b7280" style={{ fontFamily: 'Arial, sans-serif' }}>
        {count}× 1:{ratio} · {count*ratio} sal.
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
