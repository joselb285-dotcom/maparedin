import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { AppFeature, ClientInfo, Fiber, FiberCable, FiberColor, SpliceCard, SpliceConnection, Splitter, ZabbixConfig } from './types'
import ClientModal from './ClientModal'
import SpliceExportView from './SpliceExportView'
import TitleBlockFormModal, { type TitleBlockData } from './TitleBlockFormModal'
import jsPDF from 'jspdf'

// ── Constants ─────────────────────────────────────────────────────────────────
const FIBER_ROW_H = 24
const CABLE_HDR_H = 34
const CABLE_GAP = 6
const SVG_W = 600
const LEFT_PORT_X = 20
const RIGHT_PORT_X = SVG_W - 20
const SPLITTER_W = 80
const SPLITTER_HDR_H = 26
const SPLITTER_PORT_H = 18
const SPLITTER_GAP = 14
const DEFAULT_SP_X = (SVG_W - SPLITTER_W) / 2

// ── Fiber Colors ──────────────────────────────────────────────────────────────
const FIBER_HEX: Record<FiberColor, string> = {
  blue: '#2979ff', orange: '#ff6d00', green: '#00c853',
  brown: '#8d6e63', slate: '#90a4ae', white: '#eeeeee',
  red: '#f44336', black: '#757575', yellow: '#ffd600',
  violet: '#ab47bc', rose: '#f06292', aqua: '#00e5ff',
}

const FIBER_LABEL: Record<FiberColor, string> = {
  blue: 'Azul', orange: 'Naranja', green: 'Verde', brown: 'Marrón',
  slate: 'Pizarra', white: 'Blanco', red: 'Rojo', black: 'Negro',
  yellow: 'Amarillo', violet: 'Violeta', rose: 'Rosa', aqua: 'Aqua',
}

const COLOR_SEQ: FiberColor[] = [
  'blue', 'orange', 'green', 'brown', 'slate', 'white',
  'red', 'black', 'yellow', 'violet', 'rose', 'aqua',
]

const FIBER_COUNTS = [1, 2, 4, 6, 8, 12, 24, 48, 96]
const SPLITTER_RATIOS = [2, 4, 8, 16, 32, 64]

// ── Helpers ───────────────────────────────────────────────────────────────────
function uid() { return crypto.randomUUID() }

function makeFibers(count: number, startIndex = 1): Fiber[] {
  return Array.from({ length: count }, (_, i) => ({
    id: uid(),
    index: startIndex + i,
    color: COLOR_SEQ[(startIndex - 1 + i) % 12],
  }))
}

function makeSplitter(name: string, ratio: number, posX: number, posY: number): Splitter {
  return {
    id: uid(),
    name,
    ratio,
    inputPortId: uid(),
    outputPortIds: Array.from({ length: ratio }, () => uid()),
    posX,
    posY,
  }
}

function splitterBoxH(sp: Splitter): number {
  return SPLITTER_HDR_H + (1 + sp.ratio) * SPLITTER_PORT_H
}

function getDefaultSplitterY(splitters: Splitter[], idx: number): number {
  let y = 0
  for (let i = 0; i < idx; i++) y += splitterBoxH(splitters[i]) + SPLITTER_GAP
  return y
}

function getSplitterPos(sp: Splitter, splitters: Splitter[], idx: number): { x: number; y: number } {
  return {
    x: sp.posX ?? DEFAULT_SP_X,
    y: sp.posY ?? getDefaultSplitterY(splitters, idx),
  }
}

function getCableStartY(cables: FiberCable[], idx: number): number {
  return cables.slice(0, idx).reduce(
    (acc, c) => acc + CABLE_HDR_H + c.fibers.length * FIBER_ROW_H + CABLE_GAP,
    0
  )
}

function totalCableH(cables: FiberCable[]): number {
  return cables.reduce(
    (s, c) => s + CABLE_HDR_H + c.fibers.length * FIBER_ROW_H + CABLE_GAP,
    0
  )
}

// ── Port Info ─────────────────────────────────────────────────────────────────
type PortInfo = { x: number; y: number; color: string }

function getPortInfo(
  portId: string,
  leftCables: FiberCable[],
  rightCables: FiberCable[],
  splitters: Splitter[],
  portPos: Record<string, { x: number; y: number }> = {}
): PortInfo | null {
  // Prefer real DOM-measured positions for cable fibers
  const measured = portPos[portId]
  if (measured) {
    for (const c of leftCables) {
      const f = c.fibers.find(f => f.id === portId)
      if (f) return { ...measured, color: FIBER_HEX[f.color] }
    }
    for (const c of rightCables) {
      const f = c.fibers.find(f => f.id === portId)
      if (f) return { ...measured, color: FIBER_HEX[f.color] }
    }
  }
  // Fallback to calculated positions (used before first DOM measurement)
  for (let ci = 0; ci < leftCables.length; ci++) {
    const fi = leftCables[ci].fibers.findIndex(f => f.id === portId)
    if (fi !== -1) {
      const y = getCableStartY(leftCables, ci) + CABLE_HDR_H + fi * FIBER_ROW_H + FIBER_ROW_H / 2
      return { x: LEFT_PORT_X, y, color: FIBER_HEX[leftCables[ci].fibers[fi].color] }
    }
  }
  for (let ci = 0; ci < rightCables.length; ci++) {
    const fi = rightCables[ci].fibers.findIndex(f => f.id === portId)
    if (fi !== -1) {
      const y = getCableStartY(rightCables, ci) + CABLE_HDR_H + fi * FIBER_ROW_H + FIBER_ROW_H / 2
      return { x: RIGHT_PORT_X, y, color: FIBER_HEX[rightCables[ci].fibers[fi].color] }
    }
  }
  for (let si = 0; si < splitters.length; si++) {
    const sp = splitters[si]
    const pos = getSplitterPos(sp, splitters, si)
    if (sp.inputPortId === portId) {
      return { x: pos.x, y: pos.y + SPLITTER_HDR_H + SPLITTER_PORT_H / 2, color: '#60a5fa' }
    }
    const oi = sp.outputPortIds.indexOf(portId)
    if (oi !== -1) {
      return { x: pos.x + SPLITTER_W, y: pos.y + SPLITTER_HDR_H + (1 + oi) * SPLITTER_PORT_H + SPLITTER_PORT_H / 2, color: '#34d399' }
    }
  }
  return null
}

// ── Bezier Path ───────────────────────────────────────────────────────────────
function bezierPath(x1: number, y1: number, x2: number, y2: number): string {
  const cx = (x1 + x2) / 2
  return `M ${x1} ${y1} C ${cx} ${y1} ${cx} ${y2} ${x2} ${y2}`
}

// ── Add Cable Form ────────────────────────────────────────────────────────────
function AddCableForm({
  onAdd,
  onCancel,
}: {
  onAdd: (name: string, count: number) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [count, setCount] = useState(12)

  return (
    <div className="add-cable-form">
      <input
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Nombre del cable"
        autoFocus
        onKeyDown={e =>
          e.key === 'Enter' && name.trim() && onAdd(name.trim(), count)
        }
      />
      <select
        value={count}
        onChange={e => setCount(Number(e.target.value))}
      >
        {FIBER_COUNTS.map(n => (
          <option key={n} value={n}>
            {n} fibras
          </option>
        ))}
      </select>
      <button onClick={() => name.trim() && onAdd(name.trim(), count)}>
        Agregar
      </button>
      <button className="secondary" onClick={onCancel}>
        Cancelar
      </button>
    </div>
  )
}

function AddSplitterForm({
  onAdd,
  onCancel,
}: {
  onAdd: (name: string, ratio: number) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [ratio, setRatio] = useState(8)

  return (
    <div className="add-cable-form">
      <input
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Nombre del splitter"
        autoFocus
        onKeyDown={e =>
          e.key === 'Enter' && name.trim() && onAdd(name.trim(), ratio)
        }
      />
      <select
        value={ratio}
        onChange={e => setRatio(Number(e.target.value))}
      >
        {SPLITTER_RATIOS.map(n => (
          <option key={n} value={n}>
            1×{n}
          </option>
        ))}
      </select>
      <button onClick={() => name.trim() && onAdd(name.trim(), ratio)}>
        Agregar
      </button>
      <button className="secondary" onClick={onCancel}>
        Cancelar
      </button>
    </div>
  )
}

// ── Cable Link Picker ─────────────────────────────────────────────────────────
function CableLinkPicker({
  cable, linkableFeatures, linkableLines,
  onLinkFeature, onUnlinkFeature, onLinkLine, onUnlinkLine,
}: {
  cable: FiberCable
  linkableFeatures: import('./types').AppFeature[]
  linkableLines: import('./types').AppFeature[]
  onLinkFeature: (id: string) => void
  onUnlinkFeature: () => void
  onLinkLine: (id: string) => void
  onUnlinkLine: () => void
}) {
  return (
    <div className="cable-link-picker">
      {/* Endpoint feature */}
      <div className="cable-link-section">
        <span className="cable-link-picker-label">📍 Extremo (nodo/caja):</span>
        <div className="cable-link-opts">
          {linkableFeatures.length === 0
            ? <em className="cable-link-empty">Sin features disponibles</em>
            : linkableFeatures.map(f => (
                <button key={f.properties.id}
                  className={`cable-link-opt ${cable.linkedFeatureId === f.properties.id ? 'active' : ''}`}
                  onClick={() => onLinkFeature(f.properties.id)}
                >
                  {f.properties.featureType === 'node' ? '🖥' : f.properties.featureType === 'nap' ? '🔌' : '📦'} {f.properties.name}
                </button>
              ))
          }
          {cable.linkedFeatureId && (
            <button className="cable-link-opt danger-opt" onClick={onUnlinkFeature}>🗑</button>
          )}
        </div>
      </div>
      {/* Fiber line */}
      <div className="cable-link-section">
        <span className="cable-link-picker-label">〰 Línea en mapa:</span>
        <div className="cable-link-opts">
          {linkableLines.length === 0
            ? <em className="cable-link-empty">Sin líneas disponibles</em>
            : linkableLines.map(f => (
                <button key={f.properties.id}
                  className={`cable-link-opt ${cable.linkedLineId === f.properties.id ? 'active' : ''}`}
                  onClick={() => onLinkLine(f.properties.id)}
                >
                  〰 {f.properties.name}
                </button>
              ))
          }
          {cable.linkedLineId && (
            <button className="cable-link-opt danger-opt" onClick={onUnlinkLine}>🗑</button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Fiber Row ─────────────────────────────────────────────────────────────────
function FiberRow({
  fiber,
  side,
  connected,
  selected,
  connSelected,
  isClientCable,
  onClick,
  onLabelChange,
  onOpenClient,
  onTrace,
}: {
  fiber: Fiber
  side: 'left' | 'right'
  connected: boolean
  selected: boolean
  connSelected: boolean
  isClientCable: boolean
  onClick: () => void
  onLabelChange: (label: string) => void
  onOpenClient: () => void
  onTrace?: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(fiber.clientName ?? '')

  useEffect(() => {
    if (!editing) setDraft(fiber.clientName ?? '')
  }, [fiber.clientName, editing])

  function commitEdit() {
    setEditing(false)
    onLabelChange(draft.trim())
  }

  const dot = (
    <span
      className="fiber-dot"
      style={{ background: FIBER_HEX[fiber.color] }}
    />
  )
  const label = (
    <span className="fiber-label">
      F{fiber.index}{' '}
      <span className="fiber-color-name">{FIBER_LABEL[fiber.color]}</span>
    </span>
  )
  const ep = (
    <span
      className={`fiber-ep ${side}-ep ${connected ? 'ep-conn' : ''} ${
        selected ? 'ep-sel' : ''
      }`}
      data-fiber-id={fiber.id}
    />
  )
  const clientEl = (
    <span className="fiber-client-wrap">
      <span
        className="fiber-client"
        onClick={e => { e.stopPropagation(); if (!editing) setEditing(true) }}
      >
        {editing ? (
          <input
            className="fiber-client-input"
            value={draft}
            autoFocus
            onChange={e => setDraft(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={e => {
              if (e.key === 'Enter') commitEdit()
              if (e.key === 'Escape') { setEditing(false); setDraft(fiber.clientName ?? '') }
            }}
            onClick={e => e.stopPropagation()}
          />
        ) : (
          <span className={`fiber-client-text ${fiber.clientName ? 'has-label' : ''}`}>
            {fiber.clientName || '+ etiqueta'}
          </span>
        )}
      </span>
      {isClientCable && (
        <button
          className={`client-info-btn ${fiber.clientInfo ? 'has-info' : ''}`}
          title="Ver/editar datos del cliente"
          onClick={e => { e.stopPropagation(); onOpenClient() }}
        >
          {fiber.clientInfo ? '👤' : '➕'}
        </button>
      )}
      {(fiber.clientName || fiber.clientInfo) && onTrace && (
        <button
          className="client-info-btn trace-btn"
          title="Trazar camino óptico"
          onClick={e => { e.stopPropagation(); onTrace() }}
        >
          📍
        </button>
      )}
    </span>
  )

  return (
    <div
      className={`splice-fiber ${selected ? 'fiber-sel' : ''} ${
        connSelected ? 'fiber-conn-sel' : ''
      } ${connected ? 'fiber-conn' : ''}`}
      onClick={onClick}
    >
      {side === 'left' ? (
        <>
          {dot}
          {label}
          {clientEl}
          {ep}
        </>
      ) : (
        <>
          {ep}
          {clientEl}
          {label}
          {dot}
        </>
      )}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
interface Props {
  featureId: string
  featureName: string
  projectName: string
  subProjectName: string
  spliceCard: SpliceCard
  allFeatures?: AppFeature[]
  zabbixConfig?: ZabbixConfig | null
  zabbixOltHosts?: string[]
  onChange: (card: SpliceCard) => void
  onClose: () => void
  onTraceClient?: (fiberId: string) => void
}

export default function SpliceCardModal({
  featureId,
  featureName,
  projectName,
  subProjectName,
  spliceCard,
  allFeatures = [],
  zabbixConfig,
  zabbixOltHosts = [],
  onChange,
  onClose,
  onTraceClient,
}: Props) {
  const [card, setCard] = useState<SpliceCard>({ ...spliceCard })
  const [pendingPort, setPendingPort] = useState<string | null>(null)
  const [selectedConnId, setSelectedConnId] = useState<string | null>(null)
  const [addingCableSide, setAddingCableSide] = useState<
    'left' | 'right' | null
  >(null)
  const [addingSplitter, setAddingSplitter] = useState(false)

  const svgRef = useRef<SVGSVGElement>(null)
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const [exporting, setExporting] = useState(false)
  const dragRef = useRef<{ splitterId: string; offsetX: number; offsetY: number } | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [portPos, setPortPos] = useState<Record<string, { x: number; y: number }>>({})
  const [clientModalTarget, setClientModalTarget] = useState<{ cableId: string; fiberId: string } | null>(null)
  const [showTitleBlockForm, setShowTitleBlockForm] = useState(false)
  const [linkingCableId, setLinkingCableId] = useState<string | null>(null)

  const measurePortPos = useCallback(() => {
    const svgEl = svgRef.current
    const bodyEl = bodyRef.current
    if (!svgEl || !bodyEl) return
    const svgRect = svgEl.getBoundingClientRect()
    const map: Record<string, { x: number; y: number }> = {}
    bodyEl.querySelectorAll<HTMLElement>('[data-fiber-id]').forEach(el => {
      const fid = el.dataset.fiberId!
      const r = el.getBoundingClientRect()
      const x = el.classList.contains('left-ep')
        ? r.right - svgRect.left
        : r.left - svgRect.left
      const y = (r.top + r.bottom) / 2 - svgRect.top
      map[fid] = { x, y }
    })
    setPortPos(map)
  }, [])

  useLayoutEffect(() => {
    measurePortPos()
  }, [card.cables, measurePortPos])

  useEffect(() => {
    const bodyEl = bodyRef.current
    if (!bodyEl) return
    bodyEl.addEventListener('scroll', measurePortPos)
    window.addEventListener('resize', measurePortPos)
    return () => {
      bodyEl.removeEventListener('scroll', measurePortPos)
      window.removeEventListener('resize', measurePortPos)
    }
  }, [measurePortPos])

  const leftCables = card.cables.filter(c => c.side === 'left')
  const rightCables = card.cables.filter(c => c.side === 'right')
  const splitters = card.splitters ?? []
  const selectedConn = card.connections.find(
    c => c.id === selectedConnId
  ) ?? null

  function update(next: SpliceCard) {
    setCard(next)
    onChange(next)
  }

  function connOfPort(portId: string): SpliceConnection | null {
    return (
      card.connections.find(
        c => c.leftFiberId === portId || c.rightFiberId === portId
      ) ?? null
    )
  }

  function addCable(side: 'left' | 'right', name: string, count: number) {
    const cable: FiberCable = {
      id: uid(),
      name,
      side,
      fibers: makeFibers(count),
    }
    update({ ...card, cables: [...card.cables, cable] })
    setAddingCableSide(null)
  }

  function deleteCable(cableId: string) {
    if (!confirm('¿Eliminar este cable y sus conexiones?')) return
    const cable = card.cables.find(c => c.id === cableId)
    const fiberIds = new Set(cable?.fibers.map(f => f.id) ?? [])
    update({
      ...card,
      cables: card.cables.filter(c => c.id !== cableId),
      connections: card.connections.filter(
        c =>
          !fiberIds.has(c.leftFiberId) && !fiberIds.has(c.rightFiberId)
      ),
    })
  }

  function updateFiberLabel(cableId: string, fiberId: string, label: string) {
    update({
      ...card,
      cables: card.cables.map(c =>
        c.id !== cableId ? c : {
          ...c,
          fibers: c.fibers.map(f =>
            f.id !== fiberId ? f : { ...f, clientName: label || undefined }
          ),
        }
      ),
    })
  }

  function updateClientInfo(cableId: string, fiberId: string, info: ClientInfo) {
    update({
      ...card,
      cables: card.cables.map(c =>
        c.id !== cableId ? c : {
          ...c,
          fibers: c.fibers.map(f =>
            f.id !== fiberId ? f : {
              ...f,
              clientInfo: info,
              clientName: info.name || f.clientName,
            }
          ),
        }
      ),
    })
  }

  function linkCableToFeature(cableId: string, linkedFeatureId: string | undefined, linkedLineId?: string | null) {
    update({
      ...card,
      cables: card.cables.map(c => {
        if (c.id !== cableId) return c
        const next = { ...c, linkedFeatureId }
        if (linkedLineId !== undefined) next.linkedLineId = linkedLineId ?? undefined
        return next
      }),
    })
    if (linkedFeatureId === undefined) setLinkingCableId(null)
  }

  function linkCableLine(cableId: string, lineId: string | undefined) {
    update({
      ...card,
      cables: card.cables.map(c =>
        c.id !== cableId ? c : { ...c, linkedLineId: lineId }
      ),
    })
  }

  // Linkable endpoint features: nodes / splice_box / nap (not the current one)
  const linkableFeatures = allFeatures.filter(
    f => f.properties.id !== featureId &&
         ['splice_box', 'nap', 'node'].includes(f.properties.featureType)
  )

  // Linkable line features: fiber_line only
  const linkableLines = allFeatures.filter(
    f => f.properties.featureType === 'fiber_line'
  )

  function addSplitter(name: string, ratio: number) {
    const lastSP = splitters[splitters.length - 1]
    const lastPos = lastSP ? getSplitterPos(lastSP, splitters, splitters.length - 1) : null
    const newY = lastPos ? lastPos.y + splitterBoxH(lastSP) + SPLITTER_GAP : 0
    const sp = makeSplitter(name, ratio, DEFAULT_SP_X, newY)
    update({ ...card, splitters: [...splitters, sp] })
    setAddingSplitter(false)
  }

  function deleteSplitter(splitterId: string) {
    if (!confirm('¿Eliminar este splitter y sus conexiones?')) return
    const sp = splitters.find(s => s.id === splitterId)
    if (!sp) return
    const portIds = new Set([sp.inputPortId, ...sp.outputPortIds])
    update({
      ...card,
      splitters: splitters.filter(s => s.id !== splitterId),
      connections: card.connections.filter(
        c =>
          !portIds.has(c.leftFiberId) && !portIds.has(c.rightFiberId)
      ),
    })
  }

  function handlePortClick(portId: string) {
    const existing = connOfPort(portId)
    if (existing) {
      setSelectedConnId(existing.id)
      setPendingPort(null)
      return
    }
    if (!pendingPort) {
      setPendingPort(portId)
      return
    }
    if (pendingPort === portId) {
      setPendingPort(null)
      return
    }
    const a = pendingPort
    const b = portId
    const busy = card.connections.some(
      c =>
        c.leftFiberId === a ||
        c.rightFiberId === a ||
        c.leftFiberId === b ||
        c.rightFiberId === b
    )
    if (busy) {
      setPendingPort(portId)
      return
    }
    const conn: SpliceConnection = {
      id: uid(),
      leftFiberId: a,
      rightFiberId: b,
      active: false,
    }
    update({ ...card, connections: [...card.connections, conn] })
    setPendingPort(null)
    setSelectedConnId(conn.id)
  }

  function toggleActive(id: string) {
    update({
      ...card,
      connections: card.connections.map(c =>
        c.id === id ? { ...c, active: !c.active } : c
      ),
    })
  }

  function deleteConn(id: string) {
    update({
      ...card,
      connections: card.connections.filter(c => c.id !== id),
    })
    setSelectedConnId(null)
  }

  function dismiss() {
    setPendingPort(null)
    setSelectedConnId(null)
  }

  async function svgToCanvas(svgMarkup: string, w: number, h: number): Promise<HTMLCanvasElement> {
    // Embed any external images as data URLs is handled by SpliceExportView directly
    const svgBlob = new Blob(
      [`<?xml version="1.0" encoding="UTF-8"?>`, svgMarkup],
      { type: 'image/svg+xml;charset=utf-8' }
    )
    const url = URL.createObjectURL(svgBlob)
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const scale = 3
        canvas.width = w * scale
        canvas.height = h * scale
        const ctx = canvas.getContext('2d')!
        ctx.scale(scale, scale)
        ctx.fillStyle = 'white'
        ctx.fillRect(0, 0, w, h)
        ctx.drawImage(img, 0, 0, w, h)
        URL.revokeObjectURL(url)
        resolve(canvas)
      }
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('SVG render failed')) }
      img.src = url
    })
  }

  async function handleExport(titleBlock: TitleBlockData, format: 'png' | 'pdf') {
    setShowTitleBlockForm(false)
    setExporting(true)
    try {
      const PAGE_W = 794
      const PAGE_H = 1123

      const svgMarkup = renderToStaticMarkup(
        <SpliceExportView card={card} titleBlock={titleBlock} />
      )

      const canvas = await svgToCanvas(svgMarkup, PAGE_W, PAGE_H)
      const safeName = `empalme-${featureName.replace(/\s+/g, '-')}`

      if (format === 'png') {
        const link = document.createElement('a')
        link.download = `${safeName}.png`
        link.href = canvas.toDataURL('image/png')
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
      } else {
        const imgData = canvas.toDataURL('image/png')
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
        const pageW = pdf.internal.pageSize.getWidth()
        const pageH = pdf.internal.pageSize.getHeight()
        pdf.addImage(imgData, 'PNG', 0, 0, pageW, pageH)
        pdf.save(`${safeName}.pdf`)
      }
    } catch (err) {
      console.error('Export error:', err)
      alert('Error al exportar. Revisá la consola del navegador.')
    } finally {
      setExporting(false)
    }
  }

  function onSplitterMouseDown(e: React.MouseEvent, sp: Splitter, si: number) {
    e.stopPropagation()
    const svgEl = svgRef.current
    if (!svgEl) return
    const rect = svgEl.getBoundingClientRect()
    const pos = getSplitterPos(sp, splitters, si)
    dragRef.current = {
      splitterId: sp.id,
      offsetX: e.clientX - rect.left - pos.x,
      offsetY: e.clientY - rect.top - pos.y,
    }
    setDraggingId(sp.id)
  }

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (dragRef.current && svgRef.current) {
        const rect = svgRef.current.getBoundingClientRect()
        const newX = Math.max(0, Math.min(SVG_W - SPLITTER_W, e.clientX - rect.left - dragRef.current.offsetX))
        const newY = Math.max(0, e.clientY - rect.top - dragRef.current.offsetY)
        const { splitterId } = dragRef.current
        setCard(prev => {
          const next = {
            ...prev,
            splitters: prev.splitters.map(s =>
              s.id === splitterId ? { ...s, posX: newX, posY: newY } : s
            ),
          }
          setTimeout(() => onChange(next), 0)
          return next
        })
      }
    }
    function onMouseUp() {
      dragRef.current = null
      setDraggingId(null)
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [onChange])

  useEffect(() => {
    if (!selectedConn || !svgRef.current || !bodyRef.current) return
    const from = getPortInfo(
      selectedConn.leftFiberId,
      leftCables,
      rightCables,
      splitters,
      portPos
    )
    const to = getPortInfo(
      selectedConn.rightFiberId,
      leftCables,
      rightCables,
      splitters,
      portPos
    )
    if (!from || !to) return
    const body = bodyRef.current
    const svgRect = svgRef.current.getBoundingClientRect()
    const bodyRect = body.getBoundingClientRect()
    const targetY = (from.y + to.y) / 2
    const targetX = (from.x + to.x) / 2
    const scrollTop = Math.max(
      0,
      body.scrollTop +
        (svgRect.top + targetY - bodyRect.top) -
        bodyRect.height / 2
    )
    const scrollLeft = Math.max(
      0,
      body.scrollLeft +
        (svgRect.left + targetX - bodyRect.left) -
        bodyRect.width / 2
    )
    window.requestAnimationFrame(() => {
      body.scrollTo({ top: scrollTop, left: scrollLeft, behavior: 'smooth' })
    })
  }, [selectedConn, leftCables, rightCables, splitters, portPos])

  const splitterMaxBottom = splitters.reduce((max, sp, i) => {
    const pos = getSplitterPos(sp, splitters, i)
    return Math.max(max, pos.y + splitterBoxH(sp) + 20)
  }, 0)
  const cableCanvasHeight = Math.max(
    totalCableH(leftCables),
    totalCableH(rightCables)
  )
  const svgH = Math.max(cableCanvasHeight + 200, splitterMaxBottom + 200, 800)
  const activeCount = card.connections.filter(c => c.active).length

  return (
    <>
    <div className="splice-overlay" onClick={dismiss}>
      <div className="splice-modal" onClick={e => e.stopPropagation()}>
        <div className="splice-header">
          <div>
            <h2>Carta de empalme</h2>
            <p className="splice-subtitle">{featureName}</p>
          </div>
          <div className="splice-header-actions">
            <button className="secondary small" onClick={() => setShowTitleBlockForm(true)} disabled={exporting} title="Exportar PNG o PDF">
              {exporting ? '⏳ Generando...' : '📤 Exportar'}
            </button>
            <button className="secondary" onClick={onClose}>
              Cerrar
            </button>
          </div>
        </div>

        <div className="splice-statusbar">
          {!pendingPort && !selectedConn && (
            <span className="splice-hint-text">
              Clic en fibra 1 → clic en fibra 2 para conectar
            </span>
          )}
          {pendingPort && (
            <span className="splice-hint-text selecting">
              Fibra seleccionada — clic en otra para conectar
              <button
                className="secondary small"
                onClick={dismiss}
                style={{ marginLeft: 10 }}
              >
                Cancelar
              </button>
            </span>
          )}
          {selectedConn && (
            <span className="splice-hint-text conn-selected">
              <button
                className="secondary small"
                onClick={() => toggleActive(selectedConn.id)}
              >
                {selectedConn.active ? '⏸ Desactivar' : '▶ Activar'}
              </button>
              <button
                className="danger small"
                onClick={() => deleteConn(selectedConn.id)}
              >
                Eliminar
              </button>
              <button className="secondary small" onClick={dismiss}>
                Deseleccionar
              </button>
            </span>
          )}
          <span className="splice-stats">
            {activeCount} activa(s) · {card.connections.length} total · {splitters.length} splitter(s)
          </span>
        </div>

        <div className="splice-body" ref={bodyRef}>
          <div className="splice-panel">
            <div className="splice-panel-hdr">
              <strong>Entrada</strong>
              {addingCableSide !== 'left' ? (
                <button
                  className="secondary small"
                  onClick={() => setAddingCableSide('left')}
                >
                  + Cable
                </button>
              ) : (
                <AddCableForm
                  onAdd={(n, c) => addCable('left', n, c)}
                  onCancel={() => setAddingCableSide(null)}
                />
              )}
            </div>
            <div className="splice-cables">
              {leftCables.length === 0 && (
                <p className="splice-empty">Sin cables</p>
              )}
              {leftCables.map(cable => {
                const linkedFeat = cable.linkedFeatureId ? allFeatures.find(f => f.properties.id === cable.linkedFeatureId) : undefined
                return (
                <div key={cable.id} className="splice-cable">
                  <div className="splice-cable-hdr left">
                    <span className="cable-hdr-name">
                      {cable.name} <small>({cable.fibers.length}f)</small>
                      {linkedFeat && (
                        <span className="cable-link-badge" title={`Vinculado a: ${linkedFeat.properties.name}`}>
                          🔗 {linkedFeat.properties.name}
                        </span>
                      )}
                    </span>
                    <span className="cable-hdr-actions">
                      <button
                        className="secondary small"
                        title="Vincular al mapa"
                        onClick={() => setLinkingCableId(linkingCableId === cable.id ? null : cable.id)}
                      >🔗</button>
                      <button className="danger small" onClick={() => deleteCable(cable.id)}>✕</button>
                    </span>
                  </div>
                  {linkingCableId === cable.id && (
                    <CableLinkPicker
                      cable={cable}
                      linkableFeatures={linkableFeatures}
                      linkableLines={linkableLines}
                      onLinkFeature={id => linkCableToFeature(cable.id, id)}
                      onUnlinkFeature={() => linkCableToFeature(cable.id, undefined)}
                      onLinkLine={id => linkCableLine(cable.id, id)}
                      onUnlinkLine={() => linkCableLine(cable.id, undefined)}
                    />
                  )}
                  {cable.fibers.map(fiber => {
                    const conn = connOfPort(fiber.id)
                    return (
                      <FiberRow
                        key={fiber.id}
                        fiber={fiber}
                        side="left"
                        connected={!!conn}
                        selected={pendingPort === fiber.id}
                        connSelected={conn?.id === selectedConnId}
                        isClientCable={cable.fibers.length === 1}
                        onClick={() => handlePortClick(fiber.id)}
                        onLabelChange={label => updateFiberLabel(cable.id, fiber.id, label)}
                        onOpenClient={() => setClientModalTarget({ cableId: cable.id, fiberId: fiber.id })}
                        onTrace={onTraceClient ? () => onTraceClient(fiber.id) : undefined}
                      />
                    )
                  })}
                </div>
                )
              })}
            </div>
          </div>

          <div className="splice-svg-wrap">
            <svg
              ref={svgRef}
              width={SVG_W}
              height={svgH}
              className="splice-svg"
              style={{ display: 'block', overflow: 'visible' }}
              onClick={dismiss}
            >
              <defs>
                <filter id="glow">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {splitters.map((sp, si) => {
                const pos = getSplitterPos(sp, splitters, si)
                const boxH = splitterBoxH(sp)
                const inputY = pos.y + SPLITTER_HDR_H + SPLITTER_PORT_H / 2
                const isDragging = draggingId === sp.id
                const inputConn = connOfPort(sp.inputPortId)

                return (
                  <g key={sp.id}>
                    <rect
                      x={pos.x}
                      y={pos.y}
                      width={SPLITTER_W}
                      height={SPLITTER_HDR_H}
                      fill={isDragging ? '#1e4080' : '#0d2044'}
                      stroke="#3b82f6"
                      strokeWidth={isDragging ? 2 : 1.5}
                      rx={5}
                      ry={5}
                      style={{ cursor: 'grab' }}
                      onMouseDown={e => onSplitterMouseDown(e, sp, si)}
                      onClick={e => e.stopPropagation()}
                    />
                    <rect
                      x={pos.x}
                      y={pos.y + SPLITTER_HDR_H}
                      width={SPLITTER_W}
                      height={boxH - SPLITTER_HDR_H}
                      fill="#0a1628"
                      stroke="#3b82f6"
                      strokeWidth={1.5}
                      style={{ pointerEvents: 'none' }}
                    />
                    <text
                      x={pos.x + SPLITTER_W / 2}
                      y={pos.y + 17}
                      textAnchor="middle"
                      fill="#93c5fd"
                      fontSize={9}
                      fontWeight="bold"
                      style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >
                      1×{sp.ratio} {sp.name}
                    </text>
                    <text
                      x={pos.x + SPLITTER_W - 4}
                      y={pos.y + 12}
                      textAnchor="end"
                      fill="#f87171"
                      fontSize={11}
                      style={{ cursor: 'pointer', userSelect: 'none' }}
                      onClick={e => {
                        e.stopPropagation()
                        deleteSplitter(sp.id)
                      }}
                    >
                      ✕
                    </text>
                    <circle
                      cx={pos.x}
                      cy={inputY}
                      r={5}
                      fill={
                        inputConn
                          ? '#059669'
                          : pendingPort === sp.inputPortId
                            ? '#f59e0b'
                            : '#3b82f6'
                      }
                      stroke="white"
                      strokeWidth={1}
                      style={{ cursor: 'pointer' }}
                      onClick={e => {
                        e.stopPropagation()
                        handlePortClick(sp.inputPortId)
                      }}
                    />
                    {sp.outputPortIds.map((portId, oi) => {
                      const outY =
                        pos.y +
                        SPLITTER_HDR_H +
                        (1 + oi) * SPLITTER_PORT_H +
                        SPLITTER_PORT_H / 2
                      const outConn = connOfPort(portId)
                      return (
                        <circle
                          key={portId}
                          cx={pos.x + SPLITTER_W}
                          cy={outY}
                          r={5}
                          fill={
                            outConn
                              ? '#059669'
                              : pendingPort === portId
                                ? '#f59e0b'
                                : '#34d399'
                          }
                          stroke="white"
                          strokeWidth={1}
                          style={{ cursor: 'pointer' }}
                          onClick={e => {
                            e.stopPropagation()
                            handlePortClick(portId)
                          }}
                        />
                      )
                    })}
                  </g>
                )
              })}

              {card.connections.map(conn => {
                const from = getPortInfo(
                  conn.leftFiberId,
                  leftCables,
                  rightCables,
                  splitters,
                  portPos
                )
                const to = getPortInfo(
                  conn.rightFiberId,
                  leftCables,
                  rightCables,
                  splitters,
                  portPos
                )
                if (!from || !to) return null
                const d = bezierPath(from.x, from.y, to.x, to.y)
                const isSel = conn.id === selectedConnId
                return (
                  <g key={conn.id}>
                    <path
                      d={d}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={16}
                      style={{ cursor: 'pointer' }}
                      onClick={e => {
                        e.stopPropagation()
                        setSelectedConnId(conn.id)
                      }}
                    />
                    <path
                      d={d}
                      fill="none"
                      stroke={isSel ? '#f59e0b' : from.color}
                      strokeWidth={conn.active ? 8 : 3}
                      strokeOpacity={isSel ? 1 : conn.active ? 0.9 : 0.4}
                      strokeDasharray={conn.active ? undefined : '5 5'}
                      filter={isSel ? 'url(#glow)' : undefined}
                    />
                    {conn.active && (
                      <path
                        d={d}
                        fill="none"
                        stroke={from.color}
                        strokeWidth={8}
                        className="fiber-flow"
                        strokeDasharray="10 7"
                      />
                    )}
                    {conn.active && (
                      <path
                        d={d}
                        fill="none"
                        stroke="white"
                        strokeWidth={8}
                        strokeLinecap="round"
                        className="fiber-pulse"
                        strokeDasharray="5 600"
                        filter="url(#glow)"
                        style={{ pointerEvents: 'none' }}
                      />
                    )}
                  </g>
                )
              })}
            </svg>
          </div>

          <div className="splice-panel">
            <div className="splice-panel-hdr">
              <strong>Salida</strong>
              <div className="splice-panel-actions">
                {addingCableSide !== 'right' ? (
                  <button
                    className="secondary small"
                    onClick={() => setAddingCableSide('right')}
                  >
                    + Cable
                  </button>
                ) : (
                  <AddCableForm
                    onAdd={(n, c) => addCable('right', n, c)}
                    onCancel={() => setAddingCableSide(null)}
                  />
                )}
                {!addingSplitter && (
                  <button
                    className="secondary small"
                    onClick={() => setAddingSplitter(true)}
                  >
                    + Splitter
                  </button>
                )}
              </div>
            </div>
            {addingSplitter && (
              <div style={{ padding: '8px' }}>
                <AddSplitterForm
                  onAdd={addSplitter}
                  onCancel={() => setAddingSplitter(false)}
                />
              </div>
            )}
            <div className="splice-cables">
              {rightCables.length === 0 && (
                <p className="splice-empty">Sin cables</p>
              )}
              {rightCables.map(cable => {
                const linkedFeat = cable.linkedFeatureId ? allFeatures.find(f => f.properties.id === cable.linkedFeatureId) : undefined
                return (
                <div key={cable.id} className="splice-cable">
                  <div className="splice-cable-hdr right">
                    <span className="cable-hdr-actions">
                      <button className="danger small" onClick={() => deleteCable(cable.id)}>✕</button>
                      <button
                        className="secondary small"
                        title="Vincular al mapa"
                        onClick={() => setLinkingCableId(linkingCableId === cable.id ? null : cable.id)}
                      >🔗</button>
                    </span>
                    <span className="cable-hdr-name">
                      {linkedFeat && (
                        <span className="cable-link-badge" title={`Vinculado a: ${linkedFeat.properties.name}`}>
                          🔗 {linkedFeat.properties.name}
                        </span>
                      )}
                      {cable.name} <small>({cable.fibers.length}f)</small>
                    </span>
                  </div>
                  {linkingCableId === cable.id && (
                    <CableLinkPicker
                      cable={cable}
                      linkableFeatures={linkableFeatures}
                      linkableLines={linkableLines}
                      onLinkFeature={id => linkCableToFeature(cable.id, id)}
                      onUnlinkFeature={() => linkCableToFeature(cable.id, undefined)}
                      onLinkLine={id => linkCableLine(cable.id, id)}
                      onUnlinkLine={() => linkCableLine(cable.id, undefined)}
                    />
                  )}
                  {cable.fibers.map(fiber => {
                    const conn = connOfPort(fiber.id)
                    return (
                      <FiberRow
                        key={fiber.id}
                        fiber={fiber}
                        side="right"
                        connected={!!conn}
                        selected={pendingPort === fiber.id}
                        connSelected={conn?.id === selectedConnId}
                        isClientCable={cable.fibers.length === 1}
                        onClick={() => handlePortClick(fiber.id)}
                        onLabelChange={label => updateFiberLabel(cable.id, fiber.id, label)}
                        onOpenClient={() => setClientModalTarget({ cableId: cable.id, fiberId: fiber.id })}
                        onTrace={onTraceClient ? () => onTraceClient(fiber.id) : undefined}
                      />
                    )
                  })}
                </div>
              )
              })}
            </div>
          </div>
        </div>

        <div className="splice-legend">
          <span className="leg-item">
            <span className="leg-line inactive" />
            Inactiva
          </span>
          <span className="leg-item">
            <span className="leg-line active" />
            Activa
          </span>
          <span className="leg-item">
            <span className="leg-dot sel" />
            Seleccionada
          </span>
        </div>
      </div>
    </div>

    {showTitleBlockForm && (
      <TitleBlockFormModal
        defaults={{ titulo: featureName, proyecto: projectName, subProyecto: subProjectName }}
        onExport={handleExport}
        onClose={() => setShowTitleBlockForm(false)}
      />
    )}

    {clientModalTarget && (() => {
      const cable = card.cables.find(c => c.id === clientModalTarget.cableId)
      const fiber = cable?.fibers.find(f => f.id === clientModalTarget.fiberId)
      if (!cable || !fiber) return null
      return (
        <ClientModal
          cableName={cable.name}
          fiberLabel={`F${fiber.index} ${fiber.color}`}
          clientInfo={fiber.clientInfo ?? { name: fiber.clientName ?? '' }}
          zabbixConfig={zabbixConfig}
          zabbixOltHosts={zabbixOltHosts}
          onSave={info => updateClientInfo(cable.id, fiber.id, info)}
          onClose={() => setClientModalTarget(null)}
        />
      )
    })()}
    </>
  )
}
