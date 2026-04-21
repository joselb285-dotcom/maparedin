import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type {
  OdfConnectorType, Rack, RackConnection,
  RackPanel, RackPanelKind, RackPort, RackPortGroup, RackPortStatus,
  ZabbixConfig,
} from './types'
import { zabbixLogin, getOltPortPower } from './zabbix'
import { templatesByKind } from './rackTemplates'
import type { RackTemplate } from './rackTemplates'
import EquipmentPanel, { InteractiveEquipmentPanel } from './EquipmentPanel'

// ── Constants ─────────────────────────────────────────────────────────────────
const UNIT_H        = 104
const ODF_GROUP_SZ  = 12   // ports per ODF sub-group
const RACK_SIZES    = [8, 12, 16, 24, 42]
const ODF_PORTS     = [8, 12, 16, 24, 48, 96]
const PON_PORTS     = [2, 4, 8, 16]
const UPLINK_PORTS  = [1, 2, 4]
const SWITCH_ACCESS = [8, 16, 24, 48]
const MK_WAN        = [1, 2, 4, 8]
const MK_LAN        = [4, 8, 16, 24, 48]
const CONN_TYPES: (OdfConnectorType | '')[] = ['', 'SC/APC', 'SC/UPC', 'LC/APC', 'LC/UPC']

const STATUS_COLOR: Record<RackPortStatus, string> = {
  free: '#1e293b', active: '#15803d', reserved: '#b45309',
}
const STATUS_LABEL: Record<RackPortStatus, string> = {
  free: 'Libre', active: 'Activo', reserved: 'Reservado',
}
const SPLITTER_COUNTS = [1, 2, 4, 8, 16]
const SPLITTER_RATIOS = [2, 4]   // outputs per splitter (1:2 or 1:4)

const KIND_LABEL: Record<RackPanelKind, string> = {
  odf: 'ODF', switch: 'Switch', olt: 'OLT',
  mikrotik: 'Mikrotik', splitter: 'Panel Splitter', blank: 'Blanking',
}
const KIND_BG: Record<RackPanelKind, string> = {
  odf: '#0d1e3a', switch: '#0d1e14', olt: '#1a0d0d',
  mikrotik: '#0d1a2a', splitter: '#1a0d2e', blank: '#111',
}
const KIND_ACCENT: Record<RackPanelKind, string> = {
  odf: '#2563eb', switch: '#16a34a', olt: '#dc2626',
  mikrotik: '#0ea5e9', splitter: '#a855f7', blank: '#374151',
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function uid() { return crypto.randomUUID() }

function makePorts(count: number, offset = 0): RackPort[] {
  return Array.from({ length: count }, (_, i) => ({
    id: uid(), index: offset + i + 1, label: '', status: 'free',
  }))
}

function makeGroup(label: string, count: number, offset = 0): RackPortGroup {
  return { id: uid(), label, ports: makePorts(count, offset) }
}

function allPorts(panel: RackPanel): RackPort[] {
  return [
    ...panel.ports,
    ...(panel.portGroups ?? []).flatMap(g => g.ports),
  ]
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size))
  return chunks
}

function panelHeightU(panel: RackPanel): number {
  if (panel.kind === 'odf') {
    const groups = chunkArray(panel.ports, ODF_GROUP_SZ)
    const rows   = Math.ceil(groups.length / 2)   // 2 groups per row
    return Math.max(panel.heightU, rows)
  }
  if (panel.kind === 'splitter') {
    // ~3 splitter units fit per U at double height
    const count = (panel.portGroups ?? []).length
    return Math.max(panel.heightU, Math.ceil(count / 3))
  }
  return panel.heightU
}

// ── TemplatePickerModal (fixed overlay, escapes overflow:hidden parents) ──────
function TemplatePickerModal({ kind, onPick, onClose }: {
  kind: RackPanelKind
  onPick: (t: RackTemplate) => void
  onClose: () => void
}) {
  const templates = templatesByKind(kind)
  const [filter, setFilter] = useState('')
  const filtered = filter
    ? templates.filter(t =>
        `${t.brand} ${t.model} ${t.description ?? ''}`.toLowerCase().includes(filter.toLowerCase()))
    : templates

  return createPortal(
    <div className="rack-tpl-modal-overlay" onClick={onClose}>
      <div className="rack-tpl-modal" onClick={e => e.stopPropagation()}>
        <div className="rack-tpl-modal-header">
          <div>
            <span className="rack-tpl-modal-title">📋 Plantillas — {KIND_LABEL[kind]}</span>
            <span className="rack-tpl-modal-count">{filtered.length} modelos</span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              className="rack-tpl-search"
              placeholder="Buscar marca o modelo..."
              value={filter}
              onChange={e => setFilter(e.target.value)}
              autoFocus
            />
            <button className="secondary small" onClick={onClose}>✕</button>
          </div>
        </div>
        <div className="rack-tpl-modal-grid">
          {filtered.map(t => (
            <button
              key={t.id}
              className="rack-template-card"
              onClick={() => { onPick(t); onClose() }}
            >
              <div className="rack-tpl-panel-preview">
                <EquipmentPanel t={t} />
              </div>
              <span className="rack-tpl-brand">{t.brand}</span>
              <span className="rack-tpl-model">{t.model}</span>
              {t.description && <span className="rack-tpl-desc">{t.description}</span>}
            </button>
          ))}
          {filtered.length === 0 && (
            <p style={{ color: '#475569', fontSize: '0.82rem', padding: '16px' }}>
              Sin resultados para "{filter}"
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

// ── PanelConfigForm (shared by Add and Edit) ──────────────────────────────────
interface PanelFormProps {
  title: string
  initial?: Partial<RackPanel>
  unit: number
  onSubmit: (p: Omit<RackPanel, 'id'>) => void
  onCancel: () => void
  onOpenTemplates: (kind: RackPanelKind, apply: (t: RackTemplate) => void) => void
}

function PanelConfigForm({ title, initial, unit, onSubmit, onCancel, onOpenTemplates }: PanelFormProps) {
  const [kind, setKind]     = useState<RackPanelKind>(initial?.kind ?? 'odf')
  const [name, setName]     = useState(initial?.name ?? '')
  const [heightU, setH]     = useState(initial?.heightU ?? 1)
  const [connType, setConn] = useState<OdfConnectorType | ''>(initial?.connectorType ?? 'SC/APC')
  const [portCount, setPC]  = useState(initial?.portCount ?? 24)
  // OLT
  const pg = initial?.portGroups ?? []
  const [ponPorts, setPon]     = useState(pg[0]?.ports.length ?? 8)
  const [uplinkPorts, setUL]   = useState(pg[1]?.ports.length ?? 2)
  const [zabbixHost, setZHost] = useState(initial?.zabbixHost ?? '')
  // Switch
  const [swUp, setSwUp]     = useState(pg[0]?.ports.length ?? 2)
  const [swAcc, setSwAcc]   = useState(pg[1]?.ports.length ?? 24)
  // Mikrotik
  const [mkWan, setMkWan]   = useState(pg[0]?.ports.length ?? 2)
  const [mkLan, setMkLan]   = useState(pg[1]?.ports.length ?? 8)
  // Splitter
  const existingRatio = pg.length > 0 ? (pg[0].ports.length - 1) : 2
  const [splCount, setSplCount] = useState(pg.length || 4)
  const [splRatio, setSplRatio] = useState(existingRatio > 0 ? existingRatio : 2)
  const [panelBrand, setPanelBrand] = useState(initial?.brand ?? '')

  function applyTemplate(t: RackTemplate) {
    if (t.kind !== kind) setKind(t.kind)
    setName(`${t.brand} ${t.model}`)
    setPanelBrand(t.brand)
    setH(t.heightU)
    if (t.ponPorts      !== undefined) setPon(t.ponPorts)
    if (t.uplinkPorts   !== undefined) setUL(t.uplinkPorts)
    if (t.portCount     !== undefined) setPC(t.portCount)
    if (t.connectorType !== undefined) setConn(t.connectorType)
    if (t.switchUplink  !== undefined) setSwUp(t.switchUplink)
    if (t.switchAccess  !== undefined) setSwAcc(t.switchAccess)
    if (t.mkWan         !== undefined) setMkWan(t.mkWan)
    if (t.mkLan         !== undefined) setMkLan(t.mkLan)
    if (t.splitterCount !== undefined) setSplCount(t.splitterCount)
    if (t.splitterRatio !== undefined) setSplRatio(t.splitterRatio)
  }

  const hasTemplates = templatesByKind(kind).length > 0

  function submit() {
    if (!name.trim()) return
    let base: Omit<RackPanel, 'id'> = {
      unit, heightU, kind, name: name.trim(),
      brand: panelBrand || undefined,
      ports: initial?.ports ?? [], portGroups: initial?.portGroups,
    }
    if (kind === 'odf') {
      const existing = initial?.ports ?? []
      let ports = existing
      if (existing.length !== portCount) {
        ports = makePorts(portCount)
        existing.forEach((ep, i) => { if (ports[i]) ports[i] = { ...ports[i], label: ep.label, status: ep.status, clientName: ep.clientName } })
      }
      base = { ...base, connectorType: connType, portCount, ports, portGroups: undefined }
    } else if (kind === 'olt') {
      base = { ...base, ports: [], zabbixHost: zabbixHost.trim() || undefined, portGroups: [
        makeGroup(`PON (${ponPorts})`, ponPorts),
        makeGroup(`Uplink (${uplinkPorts})`, uplinkPorts),
      ]}
    } else if (kind === 'switch') {
      base = { ...base, ports: [], portGroups: [
        makeGroup(`Uplink (${swUp})`, swUp),
        makeGroup(`Access (${swAcc})`, swAcc),
      ]}
    } else if (kind === 'mikrotik') {
      base = { ...base, ports: [], portGroups: [
        makeGroup(`WAN / Entrada (${mkWan})`, mkWan),
        makeGroup(`LAN / Salida (${mkLan})`, mkLan),
      ]}
    } else if (kind === 'splitter') {
      // Each group = one splitter: ports[0]=input, ports[1..N]=outputs
      const existing = initial?.portGroups ?? []
      const groups = Array.from({ length: splCount }, (_, i) => {
        const ex = existing[i]
        // Reuse existing group if ratio matches
        if (ex && ex.ports.length === splRatio + 1) return { ...ex, label: `1:${splRatio}` }
        return { id: uid(), label: `1:${splRatio}`, ports: makePorts(splRatio + 1) }
      })
      base = { ...base, heightU: 1, ports: [], portGroups: groups }
    }
    onSubmit(base)
  }

  return (
    <div className="rack-add-form" onClick={e => e.stopPropagation()}>
      <div className="rack-add-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>{title}</span>
        {hasTemplates && (
          <button
            type="button"
            className="secondary small"
            onClick={() => onOpenTemplates(kind, applyTemplate)}
            style={{ fontSize: '0.72rem' }}
          >
            📋 Plantillas ({templatesByKind(kind).length})
          </button>
        )}
      </div>

      <div className="rack-add-row">
        <label>Tipo
          <select value={kind} onChange={e => setKind(e.target.value as RackPanelKind)}>
            {(Object.keys(KIND_LABEL) as RackPanelKind[]).map(k =>
              <option key={k} value={k}>{KIND_LABEL[k]}</option>
            )}
          </select>
        </label>
        <label>Nombre
          <input value={name} onChange={e => setName(e.target.value)}
            placeholder={`Ej: ${KIND_LABEL[kind]} 01`} autoFocus
            onKeyDown={e => e.key === 'Enter' && submit()} />
        </label>
        {kind !== 'splitter' && (
          <label>Alto (U)
            <select value={heightU} onChange={e => setH(Number(e.target.value))}>
              {[1,2,3,4].map(n => <option key={n} value={n}>{n}U</option>)}
            </select>
          </label>
        )}
      </div>

      {kind === 'odf' && (
        <div className="rack-add-row">
          <label>Conector
            <select value={connType} onChange={e => setConn(e.target.value as OdfConnectorType | '')}>
              {CONN_TYPES.map(t => <option key={t} value={t}>{t || '—'}</option>)}
            </select>
          </label>
          <label>Puertos
            <select value={portCount} onChange={e => setPC(Number(e.target.value))}>
              {ODF_PORTS.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </div>
      )}
      {kind === 'olt' && (
        <>
          <div className="rack-add-row">
            <label>Puertos PON
              <select value={ponPorts} onChange={e => setPon(Number(e.target.value))}>
                {PON_PORTS.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <label>Puertos Uplink
              <select value={uplinkPorts} onChange={e => setUL(Number(e.target.value))}>
                {UPLINK_PORTS.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          </div>
          <div className="rack-add-row">
            <label style={{ flex: 1 }}>Host en Zabbix
              <input
                value={zabbixHost}
                onChange={e => setZHost(e.target.value)}
                placeholder="Ej: OLT-NORTE-01"
              />
            </label>
          </div>
        </>
      )}
      {kind === 'switch' && (
        <div className="rack-add-row">
          <label>Uplink
            <select value={swUp} onChange={e => setSwUp(Number(e.target.value))}>
              {UPLINK_PORTS.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label>Access
            <select value={swAcc} onChange={e => setSwAcc(Number(e.target.value))}>
              {SWITCH_ACCESS.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </div>
      )}
      {kind === 'mikrotik' && (
        <div className="rack-add-row">
          <label>WAN / Entrada
            <select value={mkWan} onChange={e => setMkWan(Number(e.target.value))}>
              {MK_WAN.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label>LAN / Salida
            <select value={mkLan} onChange={e => setMkLan(Number(e.target.value))}>
              {MK_LAN.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </div>
      )}
      {kind === 'splitter' && (
        <div className="rack-add-row">
          <label>Cantidad de splitters
            <select value={splCount} onChange={e => setSplCount(Number(e.target.value))}>
              {SPLITTER_COUNTS.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label>Salidas por splitter
            <select value={splRatio} onChange={e => setSplRatio(Number(e.target.value))}>
              {SPLITTER_RATIOS.map(n => <option key={n} value={n}>1:{n}</option>)}
            </select>
          </label>
        </div>
      )}
      <div className="rack-add-actions">
        <button onClick={submit} disabled={!name.trim()}>Guardar</button>
        <button className="secondary" onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  )
}

// ── PortPopover ───────────────────────────────────────────────────────────────
function PortPopover({ port, isPon, onChange, onClose }: {
  port: RackPort; isPon?: boolean; onChange: (p: RackPort) => void; onClose: () => void
}) {
  const [label, setLabel]       = useState(port.label)
  const [status, setStatus]     = useState<RackPortStatus>(port.status)
  const [client, setClient]     = useState(port.clientName ?? '')
  const [zabbixKey, setZKey]    = useState(port.zabbixItemKey ?? '')

  function save() {
    onChange({
      ...port,
      label,
      status,
      clientName: client || undefined,
      zabbixItemKey: isPon && zabbixKey.trim() ? zabbixKey.trim() : undefined,
    })
    onClose()
  }

  return (
    <div className="port-popover" onClick={e => e.stopPropagation()}>
      <div className="port-popover-title">Puerto PON {port.index}</div>
      <label>Etiqueta<input value={label} onChange={e => setLabel(e.target.value)} placeholder="Ej: NAP-01-P1" autoFocus onKeyDown={e => e.key === 'Enter' && save()} /></label>
      <label>Estado
        <select value={status} onChange={e => setStatus(e.target.value as RackPortStatus)}>
          {(Object.keys(STATUS_LABEL) as RackPortStatus[]).map(s =>
            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
          )}
        </select>
      </label>
      {status === 'active' && (
        <label>Cliente<input value={client} onChange={e => setClient(e.target.value)} placeholder="Nombre del cliente" /></label>
      )}
      {isPon && (
        <label style={{ marginTop: 4 }}>
          Item key Zabbix
          <input
            value={zabbixKey}
            onChange={e => setZKey(e.target.value)}
            placeholder="Ej: olt.pon[1].rx  (vacío = usa plantilla)"
          />
        </label>
      )}
      <div className="port-popover-actions">
        <button onClick={save}>Guardar</button>
        <button className="secondary" onClick={onClose}>Cancelar</button>
      </div>
    </div>
  )
}

// ── PortButton ────────────────────────────────────────────────────────────────
function PortButton({ port, pending, connSelected, isPon, onPortClick, onEdit }: {
  port: RackPort; pending: boolean; connSelected: boolean; isPon?: boolean
  onPortClick: (p: RackPort) => void; onEdit: (p: RackPort) => void
}) {
  const [showEdit, setShowEdit] = useState(false)
  const hasZabbix = isPon && !!port.zabbixItemKey
  return (
    <div className="rack-port-wrap">
      <button
        data-port-id={port.id}
        className={`rack-port ${pending ? 'port-pending' : ''} ${connSelected ? 'port-conn-sel' : ''} ${hasZabbix ? 'port-zabbix-set' : ''}`}
        style={{ background: STATUS_COLOR[port.status] }}
        title={[`P${port.index}`, port.label, port.clientName, hasZabbix ? `⚡ ${port.zabbixItemKey}` : ''].filter(Boolean).join(' · ')}
        onClick={e => { e.stopPropagation(); onPortClick(port) }}
        onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setShowEdit(true) }}
      >
        {port.index}
      </button>
      {port.status === 'active' && <span className="port-active-dot" />}
      {port.label && <span className="port-label-text">{port.label}</span>}
      {showEdit && (
        <PortPopover port={port} isPon={isPon}
          onChange={updated => { onEdit(updated); setShowEdit(false) }}
          onClose={() => setShowEdit(false)} />
      )}
    </div>
  )
}

// ── PanelRow ──────────────────────────────────────────────────────────────────
function PanelRow({ panel, isFirst, isLast, onMoveUp, onMoveDown, onEdit, onDelete, onPortClick, onPortEdit, pendingPortId, connectedPortIds }: {
  panel: RackPanel; isFirst: boolean; isLast: boolean
  onMoveUp: () => void; onMoveDown: () => void
  onEdit: () => void; onDelete: () => void
  onPortClick: (p: RackPort) => void
  onPortEdit: (portId: string, updated: RackPort) => void
  pendingPortId: string | null; connectedPortIds: Set<string>
}) {
  const [svgPopover, setSvgPopover] = useState<{ port: RackPort; isPon: boolean; cx: number; cy: number } | null>(null)

  const accent      = KIND_ACCENT[panel.kind]
  const height      = panelHeightU(panel) * UNIT_H
  const isOdfLike   = panel.kind === 'odf'
  const hasSplit    = panel.kind === 'olt' || panel.kind === 'switch'
  const isSplitter  = panel.kind === 'splitter'

  // ODF: split into groups of ODF_GROUP_SZ, display 2 per row
  const odfGroups = isOdfLike ? chunkArray(panel.ports, ODF_GROUP_SZ) : []
  const odfRows   = isOdfLike ? chunkArray(odfGroups, 2) : []

  // OLT / Switch: separate uplink group to right column
  const allGroups    = panel.portGroups ?? []
  const uplinkGroup  = hasSplit ? allGroups.find(g => g.label.toLowerCase().includes('uplink')) ?? null : null
  const mainGroups   = hasSplit ? allGroups.filter(g => g !== uplinkGroup) : allGroups

  function portBtn(port: RackPort, isPon = false) {
    return (
      <PortButton key={port.id} port={port}
        pending={pendingPortId === port.id}
        connSelected={connectedPortIds.has(port.id)}
        isPon={isPon}
        onPortClick={onPortClick}
        onEdit={updated => onPortEdit(port.id, updated)} />
    )
  }

  return (
    <div className="rack-panel" style={{ height, background: KIND_BG[panel.kind], borderLeft: `3px solid ${accent}` }}>
      {/* Left ear */}
      <div className="rack-panel-ear">
        <span className="rack-panel-screws">●<br />●</span>
      </div>

      {/* Body */}
      <div className="rack-panel-body" style={panel.brand && panel.kind !== 'blank' ? { padding: '4px 8px', gap: 3 } : undefined}>

        {/* Interactive front panel illustration — ports are the SVG elements */}
        {panel.brand && panel.kind !== 'blank' && (
          <div className="rack-panel-illustration">
            <InteractiveEquipmentPanel
              panel={panel}
              pendingPortId={pendingPortId}
              connectedPortIds={connectedPortIds}
              onPortClick={onPortClick}
              onPortRightClick={(port, cx, cy) => {
                const ponGroup = (panel.portGroups ?? []).find(g => g.label.toLowerCase().includes('pon'))
                const isPon = panel.kind === 'olt' && !!ponGroup?.ports.find(p => p.id === port.id)
                setSvgPopover({ port, isPon, cx, cy })
              }}
            />
          </div>
        )}

        <div className="rack-panel-name">
          <span className="rack-panel-kind-badge" style={{ background: accent + '33', color: accent }}>
            {KIND_LABEL[panel.kind]}
          </span>
          <span className="rack-panel-title">{panel.name}</span>
          {panel.connectorType && <span className="rack-panel-conn">{panel.connectorType}</span>}
        </div>

        {/* ODF / Patch: grouped layout — only shown when no interactive illustration */}
        {isOdfLike && !panel.brand && odfRows.map((row, ri) => (
          <div key={ri} className="odf-port-row">
            {row.map((group, gi) => (
              <div key={gi} className="odf-port-group">
                <span className="odf-group-label">
                  {ri * 2 * ODF_GROUP_SZ + gi * ODF_GROUP_SZ + 1}–{ri * 2 * ODF_GROUP_SZ + gi * ODF_GROUP_SZ + group.length}
                </span>
                <div className="rack-ports-row">
                  {group.map(p => portBtn(p))}
                </div>
              </div>
            ))}
          </div>
        ))}

        {/* OLT / Switch: main ports left, uplink right — only shown when no interactive illustration */}
        {hasSplit && !panel.brand && (
          <div className="rack-body-split">
            <div className="rack-body-main">
              {mainGroups.map(group => {
                const isPonGroup = panel.kind === 'olt' && group.label.toLowerCase().includes('pon')
                return (
                  <div key={group.id} className="rack-port-group">
                    <span className="rack-port-group-label">{group.label}</span>
                    <div className="rack-ports-row">{group.ports.map(p => portBtn(p, isPonGroup))}</div>
                  </div>
                )
              })}
            </div>
            {uplinkGroup && (
              <div className="rack-body-uplink">
                <span className="rack-body-uplink-label">{uplinkGroup.label}</span>
                <div className="rack-ports-col">
                  {uplinkGroup.ports.map(p => portBtn(p, false))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Mikrotik: stacked groups — only shown when no interactive illustration */}
        {panel.kind === 'mikrotik' && !panel.brand && allGroups.map(group => (
          <div key={group.id} className="rack-port-group">
            <span className="rack-port-group-label">{group.label}</span>
            <div className="rack-ports-row">{group.ports.map(p => portBtn(p))}</div>
          </div>
        ))}

        {/* Splitter panel — only shown when no interactive illustration */}
        {isSplitter && !panel.brand && (
          <div className="splitter-panel-list">
            {allGroups.map((group, gi) => {
              const inputPort   = group.ports[0]
              const outputPorts = group.ports.slice(1)
              return (
                <div key={group.id} className="splitter-card">
                  <div className="splitter-card-header">
                    <span className="splitter-unit-idx">#{gi + 1}</span>
                    <span className="splitter-unit-ratio">{group.label}</span>
                  </div>
                  <div className="splitter-card-in">
                    <span className="splitter-in-label">IN</span>
                    {inputPort && portBtn(inputPort)}
                  </div>
                  <span className="splitter-arrow-icon">▼</span>
                  <div className="splitter-card-outs">
                    {outputPorts.map(p => portBtn(p))}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {panel.kind === 'blank' && (
          <span className="rack-panel-blank-label">{panel.name}</span>
        )}
      </div>

      {/* Port edit popover for SVG interactive ports (fixed position) */}
      {svgPopover && (
        <div style={{ position: 'fixed', left: svgPopover.cx + 8, top: svgPopover.cy - 8, zIndex: 10300 }}
          onClick={e => e.stopPropagation()}>
          <PortPopover
            port={svgPopover.port}
            isPon={svgPopover.isPon}
            onChange={updated => { onPortEdit(updated.id, updated); setSvgPopover(null) }}
            onClose={() => setSvgPopover(null)}
          />
        </div>
      )}

      {/* Right ear: controls */}
      <div className="rack-panel-ear right" style={{ width: 52 }}>
        <div className="rack-panel-controls">
          <button className="rack-ctrl-btn" title="Mover arriba" disabled={isFirst} onClick={e => { e.stopPropagation(); onMoveUp() }}>↑</button>
          <button className="rack-ctrl-btn" title="Editar" onClick={e => { e.stopPropagation(); onEdit() }}>✎</button>
          <button className="rack-ctrl-btn rack-ctrl-del" title="Eliminar" onClick={e => { e.stopPropagation(); onDelete() }}>✕</button>
          <button className="rack-ctrl-btn" title="Mover abajo" disabled={isLast} onClick={e => { e.stopPropagation(); onMoveDown() }}>↓</button>
        </div>
        <span className="rack-panel-screws" style={{ marginTop: 'auto' }}>●<br />●</span>
      </div>
    </div>
  )
}

// ── ConnectionOverlay ─────────────────────────────────────────────────────────
function ConnectionOverlay({ connections, portPositions, selectedConnId, onSelect, onBend }: {
  connections: RackConnection[]
  portPositions: Map<string, { x: number; y: number }>
  selectedConnId: string | null
  onSelect: (id: string) => void
  onBend: (id: string, bx: number, by: number) => void
}) {
  const [dragging, setDragging] = useState<{
    id: string; startX: number; startY: number; origBX: number; origBY: number
  } | null>(null)
  const onBendRef = useRef(onBend)
  onBendRef.current = onBend

  useEffect(() => {
    if (!dragging) return
    function onMove(e: MouseEvent) {
      const dx = e.clientX - dragging!.startX
      const dy = e.clientY - dragging!.startY
      onBendRef.current(dragging!.id, dragging!.origBX + dx, dragging!.origBY + dy)
    }
    function onUp() { setDragging(null) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [dragging])

  return (
    <svg className="rack-conn-svg" style={{ pointerEvents: 'none' }}>
      <defs>
        <filter id="rack-glow">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      {connections.map(conn => {
        const from = portPositions.get(conn.fromPortId)
        const to   = portPositions.get(conn.toPortId)
        if (!from || !to) return null
        const bx    = conn.bendX ?? 0
        const by    = conn.bendY ?? 0
        const midX  = (from.x + to.x) / 2
        const midY  = (from.y + to.y) / 2
        const isSel = conn.id === selectedConnId
        const isDrag = dragging?.id === conn.id
        const d     = `M ${from.x} ${from.y} C ${midX+bx} ${from.y+by} ${midX+bx} ${to.y+by} ${to.x} ${to.y}`
        const hx    = midX + bx
        const hy    = midY + by
        const color = conn.active ? '#4ade80' : '#475569'
        return (
          <g key={conn.id}>
            <path d={d} fill="none" stroke="transparent" strokeWidth={14}
              style={{ pointerEvents: 'auto', cursor: 'pointer' }}
              onClick={e => { e.stopPropagation(); onSelect(conn.id) }} />
            <path d={d} fill="none"
              stroke={isSel ? '#f59e0b' : color}
              strokeWidth={conn.active ? 3 : 1.5}
              strokeOpacity={conn.active ? 0.9 : 0.5}
              strokeDasharray={conn.active ? undefined : '5 4'}
              filter={isSel ? 'url(#rack-glow)' : undefined} />
            {conn.active && (
              <path d={d} fill="none" stroke="#4ade80" strokeWidth={3}
                strokeDasharray="8 6" className="fiber-flow" />
            )}
            {conn.active && (
              <path d={d} fill="none" stroke="white" strokeWidth={3}
                strokeLinecap="round" strokeDasharray="4 600"
                className="fiber-pulse" filter="url(#rack-glow)"
                style={{ pointerEvents: 'none' }} />
            )}
            {/* Drag handle */}
            <circle cx={hx} cy={hy} r={isDrag ? 7 : 5}
              fill={isSel ? '#f59e0b44' : '#0f172a'}
              stroke={isSel ? '#f59e0b' : '#60a5fa'}
              strokeWidth={isDrag ? 2.5 : 1.5}
              style={{ pointerEvents: 'auto', cursor: isDrag ? 'grabbing' : 'grab' }}
              onMouseDown={e => {
                e.stopPropagation(); e.preventDefault()
                setDragging({ id: conn.id, startX: e.clientX, startY: e.clientY, origBX: bx, origBY: by })
              }} />
          </g>
        )
      })}
    </svg>
  )
}

// ── ZabbixPowerPanel ──────────────────────────────────────────────────────────
function ZabbixPowerPanel({ panels, config, onClose }: {
  panels: RackPanel[]
  config: ZabbixConfig
  onClose: () => void
}) {
  type PortPower = { portIndex: number; label: string; value: string | null; error?: string }
  type PanelResult = { panelName: string; host: string; ports: PortPower[]; loading: boolean }

  const oltPanels = panels.filter(p => p.kind === 'olt' && p.zabbixHost)
  const [results, setResults] = useState<PanelResult[]>(
    oltPanels.map(p => {
      const ponGroup = (p.portGroups ?? []).find(g => g.label.toLowerCase().includes('pon'))
      return {
        panelName: p.name,
        host: p.zabbixHost!,
        ports: (ponGroup?.ports ?? []).map(pt => ({ portIndex: pt.index, label: pt.label || `P${pt.index}`, value: null })),
        loading: true,
      }
    })
  )

  useEffect(() => {
    if (oltPanels.length === 0) return
    ;(async () => {
      try {
        const auth = await zabbixLogin(config)
        setResults(prev => prev.map((res, i) => {
          const panel = oltPanels[i]
          const ponGroup = (panel.portGroups ?? []).find(g => g.label.toLowerCase().includes('pon'))
          const ports = ponGroup?.ports ?? []
          Promise.all(
            ports.map(pt =>
              getOltPortPower(config, auth, res.host, pt.index, pt.zabbixItemKey)
                .then(val => ({ portIndex: pt.index, label: pt.label || `P${pt.index}`, value: val }))
                .catch(e => ({ portIndex: pt.index, label: pt.label || `P${pt.index}`, value: null, error: e instanceof Error ? e.message : 'Error' }))
            )
          ).then(portResults => {
            setResults(cur => cur.map((r, j) => j === i ? { ...r, ports: portResults, loading: false } : r))
          })
          return res
        }))
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Error de autenticación'
        setResults(prev => prev.map(r => ({
          ...r,
          loading: false,
          ports: r.ports.map(p => ({ ...p, error: msg })),
        })))
      }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function powerColor(val: string | null) {
    if (!val) return '#475569'
    const n = parseFloat(val)
    if (isNaN(n)) return '#475569'
    if (n >= -8)  return '#f59e0b'
    if (n >= -27) return '#4ade80'
    if (n >= -30) return '#fb923c'
    return '#f87171'
  }

  if (oltPanels.length === 0) {
    return (
      <div className="zabbix-power-panel">
        <div className="zabbix-power-header">
          <span>⚡ Potencias PON — Zabbix</span>
          <button className="secondary small" onClick={onClose}>✕</button>
        </div>
        <p style={{ color: '#64748b', fontSize: '0.82rem', padding: '12px 16px' }}>
          Ningún panel OLT tiene configurado un host de Zabbix.<br />
          Editar el panel OLT y completar el campo "Host en Zabbix".
        </p>
      </div>
    )
  }

  return (
    <div className="zabbix-power-panel">
      <div className="zabbix-power-header">
        <span>⚡ Potencias PON — Zabbix</span>
        <button className="secondary small" onClick={onClose}>✕</button>
      </div>
      {results.map((res, i) => (
        <div key={i} className="zabbix-power-block">
          <div className="zabbix-power-block-title">
            {res.panelName} <span style={{ color: '#64748b', fontWeight: 400 }}>({res.host})</span>
          </div>
          {res.loading ? (
            <span style={{ color: '#64748b', fontSize: '0.8rem' }}>Consultando...</span>
          ) : (
            <div className="zabbix-port-grid">
              {res.ports.map(pt => (
                <div key={pt.portIndex} className="zabbix-port-item" title={pt.label}>
                  <span className="zabbix-port-idx">P{pt.portIndex}</span>
                  <span className="zabbix-port-val" style={{ color: powerColor(pt.value) }}>
                    {pt.error ? '✗' : (pt.value ?? '—')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
interface Props {
  featureName: string
  rack: Rack
  zabbixConfig?: ZabbixConfig | null
  onChange: (rack: Rack) => void
  onClose: () => void
}

export default function RackModal({ featureName, rack, zabbixConfig, onChange, onClose }: Props) {
  const [r, setR] = useState<Rack>({ ...rack })
  const [addingToUnit, setAddingToUnit]     = useState<number | null>(null)
  const [editingPanelId, setEditingPanelId] = useState<string | null>(null)
  const [pendingPortId, setPendingPortId]   = useState<string | null>(null)
  const [selectedConnId, setSelectedConnId] = useState<string | null>(null)
  const [portPositions, setPortPositions]   = useState<Map<string, { x: number; y: number }>>(new Map())
  const [maximized, setMaximized]           = useState(false)
  const [showZabbix, setShowZabbix]         = useState(false)
  const [templatePicker, setTemplatePicker] = useState<{ kind: RackPanelKind; apply: (t: RackTemplate) => void } | null>(null)
  const slotsWrapRef = useRef<HTMLDivElement>(null)

  function openTemplates(kind: RackPanelKind, apply: (t: RackTemplate) => void) {
    setTemplatePicker({ kind, apply })
  }

  function update(next: Rack) { setR(next); onChange(next) }

  // Measure port positions
  useLayoutEffect(() => {
    const wrap = slotsWrapRef.current
    if (!wrap) return
    const wRect = wrap.getBoundingClientRect()
    const map   = new Map<string, { x: number; y: number }>()
    wrap.querySelectorAll<HTMLElement>('[data-port-id]').forEach(el => {
      const pid  = el.getAttribute('data-port-id')!
      const rect = el.getBoundingClientRect()
      map.set(pid, { x: rect.left + rect.width / 2 - wRect.left, y: rect.top + rect.height / 2 - wRect.top })
    })
    setPortPositions(map)
  }, [r])

  // ── Panel management ──────────────────────────────────────────────────────
  function changeSize(units: number) {
    update({ ...r, totalUnits: units, panels: r.panels.filter(p => p.unit + panelHeightU(p) - 1 <= units) })
  }

  function addPanel(panel: Omit<RackPanel, 'id'>) {
    update({ ...r, panels: [...r.panels, { ...panel, id: uid() }] })
    setAddingToUnit(null)
  }

  function editPanel(panelId: string, updated: Omit<RackPanel, 'id'>) {
    update({ ...r, panels: r.panels.map(p => p.id === panelId ? { ...updated, id: panelId } : p) })
    setEditingPanelId(null)
  }

  function deletePanel(id: string) {
    if (!confirm('¿Eliminar este panel y sus conexiones?')) return
    const panel   = r.panels.find(p => p.id === id)
    const portIds = new Set(panel ? allPorts(panel).map(p => p.id) : [])
    update({
      ...r,
      panels: r.panels.filter(p => p.id !== id),
      connections: r.connections.filter(c => !portIds.has(c.fromPortId) && !portIds.has(c.toPortId)),
    })
  }

  function movePanel(id: string, dir: -1 | 1) {
    // Sort panels by unit, swap adjacent in sorted order
    const sorted = [...r.panels].sort((a, b) => a.unit - b.unit)
    const idx    = sorted.findIndex(p => p.id === id)
    const nIdx   = idx + dir
    if (nIdx < 0 || nIdx >= sorted.length) return
    // Swap units
    const unitA = sorted[idx].unit
    const unitB = sorted[nIdx].unit
    update({
      ...r,
      panels: r.panels.map(p =>
        p.id === sorted[idx].id ? { ...p, unit: unitB }
        : p.id === sorted[nIdx].id ? { ...p, unit: unitA }
        : p
      ),
    })
  }

  function updatePort(panelId: string, portId: string, updated: RackPort) {
    update({
      ...r,
      panels: r.panels.map(p => {
        if (p.id !== panelId) return p
        return {
          ...p,
          ports: p.ports.map(pt => pt.id === portId ? updated : pt),
          portGroups: (p.portGroups ?? []).map(g => ({
            ...g, ports: g.ports.map(pt => pt.id === portId ? updated : pt),
          })),
        }
      }),
    })
  }

  // ── Connection management ─────────────────────────────────────────────────
  function handlePortClick(port: RackPort) {
    setSelectedConnId(null)
    const existing = r.connections.find(c => c.fromPortId === port.id || c.toPortId === port.id)
    if (existing) { setSelectedConnId(existing.id); setPendingPortId(null); return }
    if (!pendingPortId) { setPendingPortId(port.id); return }
    if (pendingPortId === port.id) { setPendingPortId(null); return }
    const busy = r.connections.some(c =>
      c.fromPortId === port.id || c.toPortId === port.id ||
      c.fromPortId === pendingPortId || c.toPortId === pendingPortId
    )
    if (busy) { setPendingPortId(port.id); return }
    update({ ...r, connections: [...r.connections, { id: uid(), fromPortId: pendingPortId, toPortId: port.id, active: false }] })
    setPendingPortId(null)
  }

  function toggleActive(id: string) {
    update({ ...r, connections: r.connections.map(c => c.id === id ? { ...c, active: !c.active } : c) })
  }

  function deleteConn(id: string) {
    update({ ...r, connections: r.connections.filter(c => c.id !== id) })
    setSelectedConnId(null)
  }

  function bendConn(id: string, bx: number, by: number) {
    setR(prev => {
      const next = { ...prev, connections: prev.connections.map(c => c.id === id ? { ...c, bendX: bx, bendY: by } : c) }
      setTimeout(() => onChange(next), 0)
      return next
    })
  }

  function dismiss() { setPendingPortId(null); setSelectedConnId(null) }

  const selectedConn    = r.connections.find(c => c.id === selectedConnId) ?? null
  const connectedPortIds = new Set(selectedConn ? [selectedConn.fromPortId, selectedConn.toPortId] : [])

  // Build grid
  const sortedPanels = [...r.panels].sort((a, b) => a.unit - b.unit)
  const panelAtUnit  = new Map<number, RackPanel>()
  for (const panel of r.panels)
    for (let u = panel.unit; u < panel.unit + panelHeightU(panel); u++)
      panelAtUnit.set(u, panel)

  const occupied = new Set<number>()
  for (const p of r.panels)
    for (let u = p.unit; u < p.unit + panelHeightU(p); u++) occupied.add(u)

  const units          = Array.from({ length: r.totalUnits }, (_, i) => i + 1)
  const totalPorts     = r.panels.reduce((s, p) => s + allPorts(p).length, 0)
  const activePorts    = r.panels.reduce((s, p) => s + allPorts(p).filter(pt => pt.status === 'active').length, 0)
  const resvPorts      = r.panels.reduce((s, p) => s + allPorts(p).filter(pt => pt.status === 'reserved').length, 0)
  const renderedPanels = new Set<string>()

  return (
    <div className={`rack-overlay ${maximized ? 'rack-overlay-max' : ''}`} onClick={dismiss}>
      <div className={`rack-modal ${maximized ? 'rack-modal-max' : ''}`} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="rack-header">
          <div>
            <h2>Rack del Nodo</h2>
            <p className="rack-subtitle">{featureName}</p>
          </div>
          <div className="rack-header-controls">
            <label className="rack-size-label">Tamaño:
              <select value={r.totalUnits} onChange={e => changeSize(Number(e.target.value))}>
                {RACK_SIZES.map(n => <option key={n} value={n}>{n}U</option>)}
              </select>
            </label>
            {zabbixConfig && (
              <button
                className={`secondary rack-maximize-btn${showZabbix ? ' rack-zabbix-active' : ''}`}
                title="Ver potencias PON en Zabbix"
                onClick={e => { e.stopPropagation(); setShowZabbix(v => !v) }}
              >
                ⚡ Potencias
              </button>
            )}
            <button className="secondary rack-maximize-btn"
              title={maximized ? 'Restaurar' : 'Maximizar'}
              onClick={e => { e.stopPropagation(); setMaximized(m => !m) }}>
              {maximized ? '⊡' : '⊞'}
            </button>
            <button className="secondary" onClick={onClose}>Cerrar</button>
          </div>
        </div>

        {/* Status bar */}
        <div className="rack-stats">
          {!pendingPortId && !selectedConn && (
            <span style={{ color: '#64748b', fontSize: '0.82rem' }}>
              Clic en puerto para conectar · Clic derecho para editar · ↑↓ para mover panel · ✎ para editar panel
            </span>
          )}
          {pendingPortId && (
            <span style={{ color: '#fbbf24', fontSize: '0.82rem' }}>
              Puerto seleccionado — clic en otro para conectar
              <button className="secondary small" style={{ marginLeft: 10 }} onClick={dismiss}>Cancelar</button>
            </span>
          )}
          {selectedConn && (
            <span style={{ color: '#34d399', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 8 }}>
              Conexión seleccionada:
              <button className="secondary small" onClick={() => toggleActive(selectedConn.id)}>
                {selectedConn.active ? '⏸ Desactivar' : '▶ Activar'}
              </button>
              <button className="danger small" onClick={() => deleteConn(selectedConn.id)}>Eliminar</button>
              <button className="secondary small" onClick={dismiss}>Deseleccionar</button>
            </span>
          )}
          <span className="rstat-sep" />
          <span className="rstat"><span className="rstat-dot" style={{ background: '#15803d' }} />{activePorts} activos</span>
          <span className="rstat"><span className="rstat-dot" style={{ background: '#b45309' }} />{resvPorts} reservados</span>
          <span className="rstat"><span className="rstat-dot" style={{ background: '#1e293b' }} />{totalPorts - activePorts - resvPorts} libres</span>
          <span className="rstat">| {r.connections.length} conexión(es) | {r.totalUnits - occupied.size}U libre(s)</span>
        </div>

        {/* Rack */}
        <div className="rack-scroll" onClick={dismiss}>
          <div className="rack-frame">
            <div className="rack-rail left">
              {units.map(u => (
                <div key={u} className="rack-unit-num" style={{ height: UNIT_H }}>{r.totalUnits - u + 1}</div>
              ))}
            </div>

            <div ref={slotsWrapRef} className="rack-slots-wrap">
              <div className="rack-slots">
                {units.map(u => {
                  const panel = panelAtUnit.get(u)
                  if (panel && renderedPanels.has(panel.id)) return null
                  if (!panel) return (
                    <div key={u} className="rack-slot-empty" style={{ height: UNIT_H }}
                      onClick={e => { e.stopPropagation(); setAddingToUnit(addingToUnit === u ? null : u) }}>
                      <span className="rack-slot-label">U{r.totalUnits - u + 1} — clic para agregar</span>
                      {addingToUnit === u && (
                        <PanelConfigForm title={`Agregar panel en U${r.totalUnits - u + 1}`}
                          unit={u} onSubmit={addPanel} onCancel={() => setAddingToUnit(null)}
                          onOpenTemplates={openTemplates} />
                      )}
                    </div>
                  )
                  renderedPanels.add(panel.id)
                  const si   = sortedPanels.findIndex(p => p.id === panel.id)
                  return (
                    <div key={panel.id}>
                      <PanelRow
                        panel={panel}
                        isFirst={si === 0}
                        isLast={si === sortedPanels.length - 1}
                        onMoveUp={() => movePanel(panel.id, -1)}
                        onMoveDown={() => movePanel(panel.id, 1)}
                        onEdit={() => setEditingPanelId(panel.id)}
                        onDelete={() => deletePanel(panel.id)}
                        onPortClick={handlePortClick}
                        onPortEdit={(portId, updated) => updatePort(panel.id, portId, updated)}
                        pendingPortId={pendingPortId}
                        connectedPortIds={connectedPortIds}
                      />
                      {editingPanelId === panel.id && (
                        <div className="rack-edit-panel-form">
                          <PanelConfigForm
                            title={`Editar: ${panel.name}`}
                            initial={panel}
                            unit={panel.unit}
                            onSubmit={updated => editPanel(panel.id, updated)}
                            onCancel={() => setEditingPanelId(null)}
                            onOpenTemplates={openTemplates}
                          />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              <ConnectionOverlay
                connections={r.connections}
                portPositions={portPositions}
                selectedConnId={selectedConnId}
                onSelect={id => { setSelectedConnId(id); setPendingPortId(null) }}
                onBend={bendConn}
              />
            </div>

            <div className="rack-rail right">
              {units.map(u => (
                <div key={u} className="rack-unit-num" style={{ height: UNIT_H }}>{r.totalUnits - u + 1}</div>
              ))}
            </div>
          </div>
        </div>

        {/* Zabbix power panel */}
        {showZabbix && zabbixConfig && (
          <ZabbixPowerPanel
            panels={r.panels}
            config={zabbixConfig}
            onClose={() => setShowZabbix(false)}
          />
        )}

        {/* Legend */}
        <div className="rack-legend">
          {(Object.keys(STATUS_LABEL) as RackPortStatus[]).map(s => (
            <span key={s} className="rack-leg-item">
              <span className="rack-leg-dot" style={{ background: STATUS_COLOR[s] }} />
              {STATUS_LABEL[s]}
            </span>
          ))}
          <span className="rack-leg-item">
            <svg width="28" height="8"><line x1="0" y1="4" x2="28" y2="4" stroke="#4ade80" strokeWidth="2.5"/></svg>
            Conexión activa
          </span>
          <span className="rack-leg-item">
            <svg width="28" height="8"><line x1="0" y1="4" x2="28" y2="4" stroke="#475569" strokeWidth="1.5" strokeDasharray="4 3"/></svg>
            Inactiva
          </span>
        </div>
      </div>

      {/* Template picker — fixed overlay escapes overflow:hidden parents */}
      {templatePicker && (
        <TemplatePickerModal
          kind={templatePicker.kind}
          onPick={t => { templatePicker.apply(t); setTemplatePicker(null) }}
          onClose={() => setTemplatePicker(null)}
        />
      )}
    </div>
  )
}
