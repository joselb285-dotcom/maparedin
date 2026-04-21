import type { ReactNode } from 'react'
import type { RackPanel, RackPort, RackPortStatus } from './types'
import type { RackTemplate } from './rackTemplates'

const W = 440
const H = 88

// ── Brand palette ─────────────────────────────────────────────────────────────
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
function brd(b: string) { return BRAND[b] ?? BRAND['Genérico'] }

// ── Status colors ─────────────────────────────────────────────────────────────
const S_FILL: Record<RackPortStatus, string> = {
  free: '#0a1828', active: '#14532d', reserved: '#78350f',
}
const S_LED: Record<RackPortStatus, string> = {
  free: '#1e3a5f', active: '#4ade80', reserved: '#f59e0b',
}

// ── SVG Chassis frame ─────────────────────────────────────────────────────────
function Chassis({ children, b }: { children: ReactNode; b: string }) {
  const c = brd(b)
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
        <linearGradient id="ear-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#555" /><stop offset="100%" stopColor="#222" />
        </linearGradient>
        <linearGradient id={`br${b.replace(/[^a-z]/gi,'')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={c.accent} /><stop offset="100%" stopColor={c.bg} />
        </linearGradient>
        <filter id="glow"><feGaussianBlur stdDeviation="1.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      <rect width={W} height={H} rx={3} fill="url(#cg)" />
      <rect width={W} height={3} rx={1} fill="#666" opacity={0.4} />
      {/* Left ear */}
      <rect x={0} y={0} width={22} height={H} rx={2} fill="url(#ear-g)" />
      <circle cx={11} cy={10} r={4} fill="#111" stroke="#555" strokeWidth={1} /><circle cx={11} cy={10} r={2} fill="#333" />
      <circle cx={11} cy={H-10} r={4} fill="#111" stroke="#555" strokeWidth={1} /><circle cx={11} cy={H-10} r={2} fill="#333" />
      {/* Right ear */}
      <rect x={W-22} y={0} width={22} height={H} rx={2} fill="url(#ear-g)" />
      <circle cx={W-11} cy={10} r={4} fill="#111" stroke="#555" strokeWidth={1} /><circle cx={W-11} cy={10} r={2} fill="#333" />
      <circle cx={W-11} cy={H-10} r={4} fill="#111" stroke="#555" strokeWidth={1} /><circle cx={W-11} cy={H-10} r={2} fill="#333" />
      {/* Brand strip */}
      <rect x={22} y={0} width={38} height={H} fill={`url(#br${b.replace(/[^a-z]/gi,'')})`} />
      <rect x={58} y={0} width={2} height={H} fill="rgba(0,0,0,0.3)" />
      <text x={41} y={H/2+3} textAnchor="middle" fontSize={9} fontWeight="bold"
        fill={c.text} transform={`rotate(-90,41,${H/2})`}
        style={{ letterSpacing: '0.06em', fontFamily: 'Arial,sans-serif', pointerEvents: 'none' }}>
        {b.toUpperCase()}
      </text>
      {children}
    </svg>
  )
}

// ── Interactive port for SVG ──────────────────────────────────────────────────
type IPortShape = 'sfp' | 'rj45' | 'sc' | 'lc' | 'fiber'
interface IPortProps {
  port: RackPort; x: number; y: number; w: number; h: number
  shape: IPortShape; isPon?: boolean
  pending: boolean; connSel: boolean
  onPortClick: (p: RackPort) => void
  onRightClick: (p: RackPort, cx: number, cy: number) => void
}

function IPort({ port, x, y, w, h, shape, isPon, pending, connSel, onPortClick, onRightClick }: IPortProps) {
  const fill   = S_FILL[port.status]
  const led    = S_LED[port.status]
  const stroke = pending ? '#fbbf24' : connSel ? '#f59e0b' : '#1e3a5f'
  const sw     = pending || connSel ? 2 : 0.8

  return (
    <g data-port-id={port.id} style={{ cursor: 'pointer' }}
      onClick={e => { e.stopPropagation(); onPortClick(port) }}
      onContextMenu={e => { e.preventDefault(); e.stopPropagation(); onRightClick(port, e.clientX, e.clientY) }}>
      {/* Outer shell */}
      <rect x={x} y={y} width={w} height={h} rx={2} fill={fill} stroke={stroke} strokeWidth={sw} />

      {/* Shape-specific detail */}
      {shape === 'sfp' && <>
        <rect x={x+2} y={y+2} width={w-4} height={h-4} rx={1} fill="#04080f" stroke="#0d1f35" strokeWidth={0.4} />
        <circle cx={x+w/2} cy={y+h/2} r={2.2} fill={led} />
        {port.status === 'active' && <circle cx={x+w/2} cy={y+h/2} r={2.2} fill={led} filter="url(#glow)" opacity={0.6} />}
      </>}

      {shape === 'rj45' && <>
        <rect x={x+2} y={y+2.5} width={w-4} height={h-5} rx={0.5} fill="#04080f" />
        {[0,1.4,2.8,4.2,5.6].map((dx, i) => (
          <line key={i} x1={x+2.5+dx} y1={y+2.5} x2={x+2.5+dx} y2={y+h-4}
            stroke={port.status === 'active' ? '#4ade80' : '#1e3a5f'} strokeWidth={0.6} />
        ))}
      </>}

      {shape === 'sc' && <>
        <rect x={x+2} y={y+2} width={w-4} height={Math.min(h-5,12)} rx={1} fill="#04080f" stroke={stroke} strokeWidth={0.4} />
        <circle cx={x+w/2} cy={y+7} r={2.8} fill={led} />
        {port.status !== 'free' && <circle cx={x+w/2} cy={y+7} r={2.8} fill={led} filter="url(#glow)" opacity={0.5} />}
      </>}

      {shape === 'lc' && <>
        <circle cx={x+w/2} cy={y+7} r={4} fill="#04080f" stroke={stroke} strokeWidth={0.4} />
        <circle cx={x+w/2} cy={y+7} r={2} fill={led} />
        {port.status !== 'free' && <circle cx={x+w/2} cy={y+7} r={2} fill={led} filter="url(#glow)" opacity={0.5} />}
      </>}

      {shape === 'fiber' && <>
        <circle cx={x+w/2} cy={y+h/2} r={w/2-0.5} fill={led} stroke={stroke} strokeWidth={sw} />
        {port.status !== 'free' && <circle cx={x+w/2} cy={y+h/2} r={w/2-0.5} fill={led} filter="url(#glow)" opacity={0.5} />}
      </>}

      {/* Status LED corner dot */}
      {shape !== 'fiber' && (
        <circle cx={x+w-3} cy={y+3} r={2} fill={led} />
      )}

      {/* Zabbix key indicator */}
      {isPon && !!port.zabbixItemKey && (
        <circle cx={x+3} cy={y+3} r={1.5} fill="#60a5fa" />
      )}

      {/* Port index label below */}
      <text x={x+w/2} y={y+h+6} textAnchor="middle" fontSize={4.5} fill="#374151"
        style={{ fontFamily: 'monospace', pointerEvents: 'none' }}>{port.index}</text>
    </g>
  )
}

// ── Interactive callback types ─────────────────────────────────────────────────
interface CBs {
  pendingPortId: string | null
  connectedPortIds: Set<string>
  onPortClick: (p: RackPort) => void
  onRightClick: (p: RackPort, cx: number, cy: number) => void
}
function portCBs(cbs: CBs, port: RackPort) {
  return {
    pending: cbs.pendingPortId === port.id,
    connSel: cbs.connectedPortIds.has(port.id),
    onPortClick: cbs.onPortClick,
    onRightClick: cbs.onRightClick,
  }
}

// ── OLT ──────────────────────────────────────────────────────────────────────
const OLT_START = 68
function OltSVG({ brand, model, heightU, ponPorts, uplinkPorts, interactive, cbs, ponGroup, uplinkGroup }: {
  brand: string; model: string; heightU: number
  ponPorts: number; uplinkPorts: number
  interactive?: boolean; cbs?: CBs
  ponGroup?: RackPort[]; uplinkGroup?: RackPort[]
}) {
  const cols = Math.min(ponPorts, 8)
  return (
    <Chassis b={brand}>
      <text x={OLT_START} y={14} fontSize={8} fontWeight="bold" fill="#94a3b8"
        style={{ fontFamily: 'Arial,sans-serif', pointerEvents: 'none' }}>{model}</text>

      {/* LCD */}
      <rect x={OLT_START} y={18} width={60} height={22} rx={2} fill="#0a1a0a" stroke="#1a3a1a" strokeWidth={0.8} />
      <rect x={OLT_START+2} y={20} width={56} height={18} rx={1} fill="#0d2010" />
      <text x={OLT_START+30} y={31} textAnchor="middle" fontSize={7} fill="#4ade80"
        style={{ fontFamily: 'monospace', pointerEvents: 'none' }}>GPON ✓</text>

      {/* PWR / ALM LEDs */}
      <circle cx={OLT_START+68} cy={24} r={3.5} fill="#22c55e" filter="url(#glow)" />
      <circle cx={OLT_START+68} cy={24} r={2} fill="#22c55e" />
      <text x={OLT_START+68} y={34} textAnchor="middle" fontSize={5} fill="#64748b"
        style={{ pointerEvents: 'none' }}>PWR</text>
      <circle cx={OLT_START+82} cy={24} r={3.5} fill="#f59e0b" opacity={0.6} />
      <circle cx={OLT_START+82} cy={24} r={2} fill="#f59e0b" opacity={0.6} />
      <text x={OLT_START+82} y={34} textAnchor="middle" fontSize={5} fill="#64748b"
        style={{ pointerEvents: 'none' }}>ALM</text>

      {/* PON label */}
      <text x={OLT_START+96} y={22} fontSize={6} fill="#60a5fa"
        style={{ fontFamily: 'Arial,sans-serif', pointerEvents: 'none' }}>GPON / XGS-PON</text>

      {/* PON ports */}
      {Array.from({ length: ponPorts }, (_, i) => {
        const col = i % cols
        const row = Math.floor(i / cols)
        const px = OLT_START + 96 + col * 17
        const py = 24 + row * 18
        const port = ponGroup?.[i]
        if (interactive && port && cbs) {
          return <IPort key={i} port={port} x={px} y={py} w={14} h={13}
            shape="sfp" isPon {...portCBs(cbs, port)} />
        }
        return <g key={i}>
          <rect x={px} y={py} width={14} height={13} rx={2} fill="#0d1520" stroke="#334155" strokeWidth={0.8} />
          <rect x={px+2} y={py+2} width={10} height={9} rx={1} fill="#0a1018" stroke="#1e3a5f" strokeWidth={0.5} />
          <circle cx={px+7} cy={py+6.5} r={1.8} fill={i%3!==2 ? '#22c55e' : '#1e3a5f'} />
        </g>
      })}

      {/* Uplink label */}
      <text x={W-22-uplinkPorts*18-4} y={22} fontSize={6} fill="#60a5fa"
        style={{ fontFamily: 'Arial,sans-serif', pointerEvents: 'none' }}>10GE UPL</text>

      {/* Uplink ports */}
      {Array.from({ length: uplinkPorts }, (_, i) => {
        const px = W-22-uplinkPorts*18+i*18
        const py = 26
        const port = uplinkGroup?.[i]
        if (interactive && port && cbs) {
          return <IPort key={i} port={port} x={px} y={py} w={14} h={13}
            shape="sfp" {...portCBs(cbs, port)} />
        }
        return <g key={i}>
          <rect x={px} y={py} width={14} height={13} rx={2} fill="#0d1520" stroke="#60a5fa" strokeWidth={0.8} />
          <rect x={px+2} y={py+2} width={10} height={9} rx={1} fill="#1e3a5f" />
        </g>
      })}

      {/* U badge */}
      <rect x={OLT_START} y={H-16} width={22} height={10} rx={2} fill="#1e3a5f" />
      <text x={OLT_START+11} y={H-8} textAnchor="middle" fontSize={7}
        fill="#60a5fa" fontWeight="bold" style={{ pointerEvents: 'none' }}>{heightU}U</text>
    </Chassis>
  )
}

// ── Switch ────────────────────────────────────────────────────────────────────
const SW_START = 68
function SwitchSVG({ brand, model, switchAccess, switchUplink, interactive, cbs, accessGroup, uplinkGroup }: {
  brand: string; model: string; switchAccess: number; switchUplink: number
  interactive?: boolean; cbs?: CBs
  accessGroup?: RackPort[]; uplinkGroup?: RackPort[]
}) {
  const cols = Math.min(switchAccess, 24)
  return (
    <Chassis b={brand}>
      <text x={SW_START} y={14} fontSize={8} fontWeight="bold" fill="#94a3b8"
        style={{ fontFamily: 'Arial,sans-serif', pointerEvents: 'none' }}>{model}</text>
      <circle cx={SW_START+60} cy={10} r={3.5} fill="#22c55e" filter="url(#glow)" />
      <text x={SW_START+60} y={20} textAnchor="middle" fontSize={5} fill="#64748b"
        style={{ pointerEvents: 'none' }}>PWR</text>
      <circle cx={SW_START+74} cy={10} r={3.5} fill="#22c55e" />
      <text x={SW_START+74} y={20} textAnchor="middle" fontSize={5} fill="#64748b"
        style={{ pointerEvents: 'none' }}>SYS</text>

      <text x={SW_START} y={26} fontSize={6} fill="#64748b"
        style={{ pointerEvents: 'none' }}>GbE ({switchAccess})</text>

      {Array.from({ length: switchAccess }, (_, i) => {
        const col = i % cols
        const row = Math.floor(i / cols)
        const px = SW_START + col * 15
        const py = 29 + row * 15
        const port = accessGroup?.[i]
        if (interactive && port && cbs) {
          return <IPort key={i} port={port} x={px} y={py} w={13} h={12}
            shape="rj45" {...portCBs(cbs, port)} />
        }
        return <g key={i}>
          <rect x={px} y={py} width={13} height={12} rx={1.5} fill="#0d1520" stroke="#334155" strokeWidth={0.8} />
          <rect x={px+2} y={py+2.5} width={9} height={7} rx={0.5} fill="#060d16" />
          {[0,1.5,3,4.5,6].map((dx, j) => (
            <line key={j} x1={px+2.5+dx} y1={py+2.5} x2={px+2.5+dx} y2={py+6}
              stroke={i%4===3 ? '#f59e0b' : '#22c55e'} strokeWidth={0.6} opacity={0.6} />
          ))}
        </g>
      })}

      {/* SFP+ uplinks */}
      <text x={W-22-switchUplink*18-40} y={26} fontSize={6} fill="#60a5fa"
        style={{ pointerEvents: 'none' }}>SFP+</text>
      {Array.from({ length: switchUplink }, (_, i) => {
        const px = W-22-switchUplink*18+i*18
        const py = 26
        const port = uplinkGroup?.[i]
        if (interactive && port && cbs) {
          return <IPort key={i} port={port} x={px} y={py} w={14} h={13}
            shape="sfp" {...portCBs(cbs, port)} />
        }
        return <g key={i}>
          <rect x={px} y={py} width={14} height={13} rx={2} fill="#0d1520" stroke="#60a5fa" strokeWidth={1} />
          <rect x={px+2} y={py+2} width={10} height={9} rx={0.5} fill="#1e3a5f" />
        </g>
      })}
    </Chassis>
  )
}

// ── ODF ──────────────────────────────────────────────────────────────────────
function OdfSVG({ portCount, connectorType, interactive, cbs, ports }: {
  portCount: number; connectorType: string
  interactive?: boolean; cbs?: CBs; ports?: RackPort[]
}) {
  const isApc = connectorType.includes('APC')
  const isLc  = connectorType.includes('LC')
  const color = isApc ? '#22c55e' : '#60a5fa'
  const cols  = Math.min(portCount, 16)
  const rows  = Math.ceil(portCount / 16)
  const gap   = isLc ? 14 : 18
  const startX = 70

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%"
      preserveAspectRatio="xMidYMid meet"
      style={{ display: 'block', position: 'absolute', inset: 0 }}>
      <defs>
        <linearGradient id="odf-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1a2840" /><stop offset="100%" stopColor="#0d1a2e" />
        </linearGradient>
        <linearGradient id="ear-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#555" /><stop offset="100%" stopColor="#222" />
        </linearGradient>
        <filter id="glow"><feGaussianBlur stdDeviation="1.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      <rect width={W} height={H} rx={3} fill="url(#odf-bg)" />
      <rect width={W} height={3} rx={1} fill="#445" opacity={0.4} />
      {/* Ears */}
      <rect x={0} y={0} width={22} height={H} rx={2} fill="url(#ear-g)" />
      <circle cx={11} cy={10} r={4} fill="#111" stroke="#555" strokeWidth={1} /><circle cx={11} cy={10} r={2} fill="#333" />
      <circle cx={11} cy={H-10} r={4} fill="#111" stroke="#555" strokeWidth={1} /><circle cx={11} cy={H-10} r={2} fill="#333" />
      <rect x={W-22} y={0} width={22} height={H} rx={2} fill="url(#ear-g)" />
      <circle cx={W-11} cy={10} r={4} fill="#111" stroke="#555" strokeWidth={1} /><circle cx={W-11} cy={10} r={2} fill="#333" />
      <circle cx={W-11} cy={H-10} r={4} fill="#111" stroke="#555" strokeWidth={1} /><circle cx={W-11} cy={H-10} r={2} fill="#333" />
      {/* Label panel */}
      <rect x={22} y={0} width={42} height={H} fill="#0d1a2e" />
      <text x={43} y={H/2+3} textAnchor="middle" fontSize={9} fontWeight="bold"
        fill={color} transform={`rotate(-90,43,${H/2})`}
        style={{ fontFamily: 'Arial,sans-serif', pointerEvents: 'none' }}>ODF</text>
      {/* Connector badge */}
      <rect x={startX} y={6} width={52} height={14} rx={3}
        fill={color + '22'} stroke={color} strokeWidth={0.8} />
      <text x={startX+26} y={16} textAnchor="middle" fontSize={8} fontWeight="bold"
        fill={color} style={{ fontFamily: 'Arial,sans-serif', pointerEvents: 'none' }}>{connectorType}</text>

      {/* Ports */}
      {Array.from({ length: Math.min(portCount, cols*rows) }, (_, i) => {
        const col = i % cols
        const row = Math.floor(i / cols)
        const px  = startX + col * gap
        const py  = 24 + row * 26
        const port = ports?.[i]
        const shape: IPortShape = isLc ? 'lc' : 'sc'
        const pw = isLc ? 12 : 15
        const ph = 20

        if (interactive && port && cbs) {
          return <IPort key={i} port={port} x={px} y={py} w={pw} h={ph}
            shape={shape} {...portCBs(cbs, port)} />
        }
        if (isLc) return (
          <g key={i}>
            <rect x={px} y={py} width={pw} height={ph} rx={2} fill="#0a1220" stroke="#1e3a5f" strokeWidth={0.7} />
            <circle cx={px+6} cy={py+7} r={4} fill="#0d1a2e" stroke={color} strokeWidth={0.8} />
            <circle cx={px+6} cy={py+7} r={2} fill={color} opacity={0.8} />
          </g>
        )
        return (
          <g key={i}>
            <rect x={px} y={py} width={pw} height={ph} rx={2} fill="#0a1220" stroke="#1e3a5f" strokeWidth={0.7} />
            <rect x={px+2} y={py+2} width={pw-4} height={11} rx={1} fill="#0d1a2e" stroke={color} strokeWidth={0.8} />
            <circle cx={px+pw/2} cy={py+7} r={2.5} fill={color} opacity={0.8} />
          </g>
        )
      })}

      <text x={W-26} y={H-6} textAnchor="end" fontSize={8} fontWeight="bold"
        fill="#475569" style={{ fontFamily: 'Arial,sans-serif', pointerEvents: 'none' }}>
        {portCount}p · 1U
      </text>
    </svg>
  )
}

// ── Mikrotik / Router ─────────────────────────────────────────────────────────
const MK_START = 68
function MikrotikSVG({ brand, model, mkWan, mkLan, interactive, cbs, wanGroup, lanGroup }: {
  brand: string; model: string; mkWan: number; mkLan: number
  interactive?: boolean; cbs?: CBs
  wanGroup?: RackPort[]; lanGroup?: RackPort[]
}) {
  return (
    <Chassis b={brand}>
      <text x={MK_START} y={14} fontSize={8} fontWeight="bold" fill="#94a3b8"
        style={{ fontFamily: 'Arial,sans-serif', pointerEvents: 'none' }}>{model}</text>
      <circle cx={MK_START+70} cy={10} r={3.5} fill="#22c55e" filter="url(#glow)" />
      <text x={MK_START+70} y={20} textAnchor="middle" fontSize={5} fill="#64748b"
        style={{ pointerEvents: 'none' }}>PWR</text>

      <text x={MK_START} y={28} fontSize={6} fill="#f87171"
        style={{ pointerEvents: 'none' }}>WAN ({mkWan})</text>
      {Array.from({ length: mkWan }, (_, i) => {
        const px = MK_START + i * 16
        const py = 32
        const port = wanGroup?.[i]
        if (interactive && port && cbs) {
          return <IPort key={i} port={port} x={px} y={py} w={13} h={12}
            shape="rj45" {...portCBs(cbs, port)} />
        }
        return <g key={i}>
          <rect x={px} y={py} width={13} height={12} rx={1.5} fill="#0d1520" stroke="#f87171" strokeWidth={0.8} />
          <rect x={px+2} y={py+2.5} width={9} height={7} rx={0.5} fill="#060d16" />
        </g>
      })}

      <text x={MK_START+mkWan*16+8} y={28} fontSize={6} fill="#22c55e"
        style={{ pointerEvents: 'none' }}>LAN ({mkLan})</text>
      {Array.from({ length: mkLan }, (_, i) => {
        const px = MK_START + mkWan*16 + 8 + i * 16
        const py = 32
        const port = lanGroup?.[i]
        if (interactive && port && cbs) {
          return <IPort key={i} port={port} x={px} y={py} w={13} h={12}
            shape="rj45" {...portCBs(cbs, port)} />
        }
        return <g key={i}>
          <rect x={px} y={py} width={13} height={12} rx={1.5} fill="#0d1520" stroke="#22c55e" strokeWidth={0.8} />
          <rect x={px+2} y={py+2.5} width={9} height={7} rx={0.5} fill="#060d16" />
        </g>
      })}
    </Chassis>
  )
}

// ── Splitter ──────────────────────────────────────────────────────────────────
function SplitterSVG({ splitterCount, splitterRatio, interactive, cbs, groups }: {
  splitterCount: number; splitterRatio: number
  interactive?: boolean; cbs?: CBs
  groups?: { input: RackPort; outputs: RackPort[] }[]
}) {
  const startX = 68
  const visible = Math.min(splitterCount, 7)
  const cellW  = Math.min(50, (W - startX - 26) / visible)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%"
      preserveAspectRatio="xMidYMid meet"
      style={{ display: 'block', position: 'absolute', inset: 0 }}>
      <defs>
        <linearGradient id="sp-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1e1040" /><stop offset="100%" stopColor="#110820" />
        </linearGradient>
        <linearGradient id="ear-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#555" /><stop offset="100%" stopColor="#222" />
        </linearGradient>
        <filter id="glow"><feGaussianBlur stdDeviation="1.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      <rect width={W} height={H} rx={3} fill="url(#sp-bg)" />
      <rect width={W} height={3} rx={1} fill="#554" opacity={0.4} />
      <rect x={0} y={0} width={22} height={H} rx={2} fill="url(#ear-g)" />
      <circle cx={11} cy={10} r={4} fill="#111" stroke="#555" strokeWidth={1} /><circle cx={11} cy={10} r={2} fill="#333" />
      <circle cx={11} cy={H-10} r={4} fill="#111" stroke="#555" strokeWidth={1} /><circle cx={11} cy={H-10} r={2} fill="#333" />
      <rect x={W-22} y={0} width={22} height={H} rx={2} fill="url(#ear-g)" />
      <circle cx={W-11} cy={10} r={4} fill="#111" stroke="#555" strokeWidth={1} /><circle cx={W-11} cy={10} r={2} fill="#333" />
      <circle cx={W-11} cy={H-10} r={4} fill="#111" stroke="#555" strokeWidth={1} /><circle cx={W-11} cy={H-10} r={2} fill="#333" />
      <rect x={22} y={0} width={40} height={H} fill="#1a0838" />
      <text x={42} y={H/2+3} textAnchor="middle" fontSize={8} fontWeight="bold"
        fill="#a855f7" transform={`rotate(-90,42,${H/2})`}
        style={{ fontFamily: 'Arial,sans-serif', pointerEvents: 'none' }}>SPLIT</text>

      {Array.from({ length: visible }, (_, i) => {
        const cx  = startX + i * cellW + cellW / 2
        const grp = groups?.[i]
        const outCount = Math.min(splitterRatio, 4)
        return (
          <g key={i}>
            {/* Splitter box */}
            <rect x={cx-10} y={12} width={20} height={14} rx={3}
              fill="#2d1060" stroke="#a855f7" strokeWidth={1} />
            <text x={cx} y={22} textAnchor="middle" fontSize={7} fontWeight="bold"
              fill="#a855f7" style={{ fontFamily: 'Arial,sans-serif', pointerEvents: 'none' }}>
              1:{splitterRatio}
            </text>
            {/* Input port */}
            <line x1={cx} y1={7} x2={cx} y2={12} stroke="#a855f7" strokeWidth={1.5} />
            {interactive && grp?.input && cbs ? (
              <IPort port={grp.input} x={cx-4} y={2} w={8} h={7} shape="fiber"
                {...portCBs(cbs, grp.input)} />
            ) : (
              <circle cx={cx} cy={5} r={4} fill="#0d1520" stroke="#a855f7" strokeWidth={1}>
                <title>IN</title>
              </circle>
            )}
            {/* Output ports */}
            {Array.from({ length: outCount }, (_, j) => {
              const ox = cx + (j - (outCount-1)/2) * (cellW * 0.22)
              const oy = H - 14
              return (
                <g key={j}>
                  <line x1={cx} y1={26} x2={ox} y2={oy} stroke="#7c3aed" strokeWidth={1} />
                  {interactive && grp?.outputs[j] && cbs ? (
                    <IPort port={grp.outputs[j]} x={ox-4} y={oy-4} w={8} h={8} shape="fiber"
                      {...portCBs(cbs, grp.outputs[j])} />
                  ) : (
                    <circle cx={ox} cy={oy} r={4} fill="#0d1520" stroke="#7c3aed" strokeWidth={0.8} />
                  )}
                </g>
              )
            })}
            {splitterRatio > 4 && (
              <text x={cx} y={H-3} textAnchor="middle" fontSize={5.5} fill="#7c3aed"
                style={{ pointerEvents: 'none' }}>+{splitterRatio-4}</text>
            )}
          </g>
        )
      })}

      <text x={W-26} y={H-5} textAnchor="end" fontSize={7} fontWeight="bold"
        fill="#6b7280" style={{ fontFamily: 'Arial,sans-serif', pointerEvents: 'none' }}>
        {splitterCount}× 1:{splitterRatio}
      </text>
    </svg>
  )
}

// ── Visual-only export (template picker) ──────────────────────────────────────
export default function EquipmentPanel({ t }: { t: RackTemplate }) {
  switch (t.kind) {
    case 'olt':
      return <OltSVG brand={t.brand} model={t.model} heightU={t.heightU}
        ponPorts={t.ponPorts ?? 8} uplinkPorts={t.uplinkPorts ?? 2} />
    case 'switch':
      return <SwitchSVG brand={t.brand} model={t.model}
        switchAccess={t.switchAccess ?? 24} switchUplink={t.switchUplink ?? 2} />
    case 'odf':
      return <OdfSVG portCount={t.portCount ?? 24} connectorType={t.connectorType ?? 'SC/APC'} />
    case 'mikrotik':
      return <MikrotikSVG brand={t.brand} model={t.model}
        mkWan={t.mkWan ?? 2} mkLan={t.mkLan ?? 8} />
    case 'splitter':
      return <SplitterSVG splitterCount={t.splitterCount ?? 4} splitterRatio={t.splitterRatio ?? 8} />
    default: return null
  }
}

// ── Interactive export (rack slots) ───────────────────────────────────────────
export function InteractiveEquipmentPanel({ panel, pendingPortId, connectedPortIds, onPortClick, onPortRightClick }: {
  panel: RackPanel
  pendingPortId: string | null
  connectedPortIds: Set<string>
  onPortClick: (p: RackPort) => void
  onPortRightClick: (p: RackPort, clientX: number, clientY: number) => void
}) {
  const cbs: CBs = { pendingPortId, connectedPortIds, onPortClick, onRightClick: onPortRightClick }
  const pg = panel.portGroups ?? []
  const b = panel.brand ?? 'Genérico'

  switch (panel.kind) {
    case 'olt': {
      const ponGroup    = pg.find(g => g.label.toLowerCase().includes('pon'))
      const uplinkGroup = pg.find(g => g.label.toLowerCase().includes('uplink'))
      return <OltSVG brand={b} model={panel.name}
        heightU={panel.heightU}
        ponPorts={ponGroup?.ports.length ?? 8}
        uplinkPorts={uplinkGroup?.ports.length ?? 2}
        interactive cbs={cbs}
        ponGroup={ponGroup?.ports}
        uplinkGroup={uplinkGroup?.ports} />
    }
    case 'switch': {
      const accessGroup = pg.find(g => g.label.toLowerCase().includes('access'))
      const uplinkGroup = pg.find(g => g.label.toLowerCase().includes('uplink'))
      return <SwitchSVG brand={b} model={panel.name}
        switchAccess={accessGroup?.ports.length ?? 24}
        switchUplink={uplinkGroup?.ports.length ?? 2}
        interactive cbs={cbs}
        accessGroup={accessGroup?.ports}
        uplinkGroup={uplinkGroup?.ports} />
    }
    case 'odf':
      return <OdfSVG
        portCount={panel.portCount ?? panel.ports.length}
        connectorType={panel.connectorType ?? 'SC/APC'}
        interactive cbs={cbs} ports={panel.ports} />
    case 'mikrotik': {
      const wanGroup = pg.find(g => g.label.toLowerCase().includes('wan'))
      const lanGroup = pg.find(g => g.label.toLowerCase().includes('lan'))
      return <MikrotikSVG brand={b} model={panel.name}
        mkWan={wanGroup?.ports.length ?? 2}
        mkLan={lanGroup?.ports.length ?? 8}
        interactive cbs={cbs}
        wanGroup={wanGroup?.ports}
        lanGroup={lanGroup?.ports} />
    }
    case 'splitter': {
      const groups = pg.map(g => ({ input: g.ports[0], outputs: g.ports.slice(1) }))
      return <SplitterSVG
        splitterCount={pg.length}
        splitterRatio={Math.max(1, (pg[0]?.ports.length ?? 3) - 1)}
        interactive cbs={cbs} groups={groups} />
    }
    default: return null
  }
}
