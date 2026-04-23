import { useState } from 'react'
import type { ClientInfo, ZabbixConfig } from './types'
import { zabbixLogin, getOnuPower, getOnuBandwidthHistory, diagnoseOnu } from './zabbix'
import type { HistoryPoint } from './zabbix'
import BandwidthChart from './BandwidthChart'

interface Props {
  fiberLabel: string
  cableName: string
  clientInfo: ClientInfo
  zabbixConfig?: ZabbixConfig | null
  zabbixOltHosts?: string[]
  onSave: (info: ClientInfo) => void
  onClose: () => void
}

type BwState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; msg: string }
  | { status: 'ok'; inData: HistoryPoint[]; outData: HistoryPoint[]; unit: string; hours: number }

const HOUR_OPTIONS = [1, 6, 24, 48] as const

export default function ClientModal({ fiberLabel, cableName, clientInfo, zabbixConfig, zabbixOltHosts = [], onSave, onClose }: Props) {
  const [form, setForm]           = useState<ClientInfo>({ ...clientInfo })
  const [fetchingPower, setFP]    = useState(false)
  const [powerError, setPowerErr] = useState<string | null>(null)
  const [bwState, setBwState]     = useState<BwState>({ status: 'idle' })
  const [bwHours, setBwHours]     = useState<number>(24)

  const hasZabbix   = !!zabbixConfig
  const hasSerial   = !!form.onuSerial?.trim()
  const hasBwKeys   = !!(zabbixConfig?.onuBandwidthInKey || zabbixConfig?.onuBandwidthOutKey)
  const activeOlt   = form.oltHost ?? (zabbixOltHosts.length === 1 ? zabbixOltHosts[0] : undefined)

  function set<K extends keyof ClientInfo>(key: K, value: ClientInfo[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  async function fetchZabbixPower() {
    if (!zabbixConfig || !hasSerial) return
    setFP(true)
    setPowerErr(null)
    try {
      const auth = await zabbixLogin(zabbixConfig)
      const val  = await getOnuPower(zabbixConfig, auth, form.onuSerial!.trim(), activeOlt)
      if (val === null) {
        const diag = activeOlt ? await diagnoseOnu(zabbixConfig, auth, activeOlt, form.onuSerial!.trim()) : 'Sin OLT asignada al cliente'
        setPowerErr(`No encontrado. ${diag}`)
      }
      else setForm(prev => ({ ...prev, onuPowerDbm: val }))
    } catch (e: unknown) {
      setPowerErr(e instanceof Error ? e.message : 'Error al consultar Zabbix')
    } finally {
      setFP(false)
    }
  }

  async function fetchBandwidth(hours: number) {
    if (!zabbixConfig || !hasSerial) return
    setBwState({ status: 'loading' })
    setBwHours(hours)
    try {
      const auth   = await zabbixLogin(zabbixConfig)
      const result = await getOnuBandwidthHistory(zabbixConfig, auth, form.onuSerial!.trim(), hours, activeOlt)
      if (!result) {
        setBwState({ status: 'error', msg: 'Host no encontrado en Zabbix' })
      } else {
        setBwState({ status: 'ok', ...result, hours })
      }
    } catch (e: unknown) {
      setBwState({ status: 'error', msg: e instanceof Error ? e.message : 'Error al consultar Zabbix' })
    }
  }

  function handleSave() {
    const cleaned: ClientInfo = {
      name: form.name,
      address:      form.address      || undefined,
      phone:        form.phone        || undefined,
      email:        form.email        || undefined,
      onuModel:     form.onuModel     || undefined,
      onuSerial:    form.onuSerial    || undefined,
      onuPowerDbm:  form.onuPowerDbm  || undefined,
      oltHost:      form.oltHost      || undefined,
      notes:        form.notes        || undefined,
    }
    onSave(cleaned)
    onClose()
  }

  return (
    <div className="client-modal-overlay" onClick={onClose}>
      <div className="client-modal client-modal-wide" onClick={e => e.stopPropagation()}>
        <div className="client-modal-header">
          <div>
            <h2>Datos del cliente</h2>
            <p className="client-modal-sub">{cableName} · {fiberLabel}</p>
          </div>
          <button className="secondary" onClick={onClose}>✕</button>
        </div>

        <div className="client-modal-body">
          <div className="client-section-title">Identificación</div>
          <div className="client-form-grid">
            <label>
              Nombre del cliente
              <input value={form.name} onChange={e => set('name', e.target.value)}
                placeholder="Ej: Juan García" autoFocus />
            </label>
            <label>
              Dirección
              <input value={form.address ?? ''} onChange={e => set('address', e.target.value)}
                placeholder="Ej: Av. Colón 1234, Córdoba" />
            </label>
            <label>
              Teléfono
              <input value={form.phone ?? ''} onChange={e => set('phone', e.target.value)}
                placeholder="Ej: +54 351 000-0000" />
            </label>
            <label>
              Email
              <input type="email" value={form.email ?? ''} onChange={e => set('email', e.target.value)}
                placeholder="Ej: cliente@email.com" />
            </label>
          </div>

          <div className="client-section-title">ONU / ONT</div>
          <div className="client-form-grid">
            <label>
              Modelo ONU
              <input value={form.onuModel ?? ''} onChange={e => set('onuModel', e.target.value)}
                placeholder="Ej: Huawei HG8310M" />
            </label>
            <label>
              Número de serie
              <input value={form.onuSerial ?? ''} onChange={e => set('onuSerial', e.target.value)}
                placeholder="Ej: HWTC1A2B3C4D" />
            </label>
            {zabbixOltHosts.length > 0 && (
              <label style={{ gridColumn: '1 / -1' }}>
                OLT (Zabbix)
                <select value={form.oltHost ?? ''} onChange={e => set('oltHost', e.target.value || undefined)}>
                  <option value="">— Sin asignar —</option>
                  {zabbixOltHosts.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </label>
            )}
            <label className="client-power-label">
              Potencia óptica recibida (dBm)
              <div className="client-power-row">
                <input type="number" step="0.1" value={form.onuPowerDbm ?? ''}
                  onChange={e => set('onuPowerDbm', e.target.value)}
                  placeholder="Ej: -22.5" className="client-power-input" />
                <span className={`client-power-badge ${getPowerClass(form.onuPowerDbm)}`}>
                  {getPowerLabel(form.onuPowerDbm)}
                </span>
                {hasZabbix && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 6 }}>
                    {activeOlt && (
                      <span style={{ fontSize: '0.72rem', color: '#60a5fa', background: '#0d1e3a', border: '1px solid #1e3a5f', borderRadius: 4, padding: '2px 6px', whiteSpace: 'nowrap' }}>
                        OLT: {activeOlt}
                      </span>
                    )}
                    <button type="button" className="secondary small"
                      title={hasSerial ? 'Consultar potencia en Zabbix' : 'Ingresá el número de serie primero'}
                      disabled={fetchingPower || !hasSerial}
                      onClick={fetchZabbixPower}
                      style={{ whiteSpace: 'nowrap' }}>
                      {fetchingPower ? '⏳' : '⚡ Zabbix'}
                    </button>
                  </div>
                )}
              </div>
              <span className="client-power-hint">
                Rango óptimo: −8 dBm a −27 dBm · Crítico: &lt; −30 dBm
              </span>
              {powerError && (
                <span className="client-power-hint" style={{ color: '#f87171' }}>✗ {powerError}</span>
              )}
            </label>
          </div>

          {/* ── Bandwidth charts ── */}
          {hasZabbix && hasBwKeys && (
            <>
              <div className="client-section-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Consumo de ancho de banda</span>
                <div style={{ display: 'flex', gap: 4 }}>
                  {HOUR_OPTIONS.map(h => (
                    <button key={h}
                      className={`secondary small${bwState.status === 'ok' && bwHours === h ? ' bw-hours-active' : ''}`}
                      onClick={() => fetchBandwidth(h)}>
                      {h < 24 ? `${h}h` : `${h / 24}d`}
                    </button>
                  ))}
                  <button className="secondary small"
                    title={hasSerial ? 'Cargar datos de Zabbix' : 'Ingresá el número de serie primero'}
                    disabled={bwState.status === 'loading' || !hasSerial}
                    onClick={() => fetchBandwidth(bwHours)}
                    style={{ marginLeft: 4 }}>
                    {bwState.status === 'loading' ? '⏳' : '⚡ Consultar'}
                  </button>
                </div>
              </div>

              <div className="bw-chart-container">
                {bwState.status === 'idle' && (
                  <div className="bw-empty-state">
                    Clic en "⚡ Consultar" para cargar los gráficos de tráfico desde Zabbix
                  </div>
                )}
                {bwState.status === 'loading' && (
                  <div className="bw-empty-state">Consultando Zabbix...</div>
                )}
                {bwState.status === 'error' && (
                  <div className="bw-empty-state" style={{ color: '#f87171' }}>
                    ✗ {bwState.msg}
                  </div>
                )}
                {bwState.status === 'ok' && (
                  <BandwidthChart
                    inData={bwState.inData}
                    outData={bwState.outData}
                    unit={bwState.unit}
                    hours={bwState.hours}
                  />
                )}
              </div>
            </>
          )}

          {hasZabbix && !hasBwKeys && (
            <p className="client-power-hint" style={{ marginTop: 8 }}>
              Configurá los item keys de ancho de banda en ⚡ Zabbix para ver gráficos de tráfico.
            </p>
          )}

          <div className="client-section-title">Observaciones</div>
          <textarea rows={3} value={form.notes ?? ''} onChange={e => set('notes', e.target.value)}
            placeholder="Notas adicionales..." style={{ width: '100%' }} />
        </div>

        <div className="client-modal-footer">
          <button className="secondary" onClick={onClose}>Cancelar</button>
          <button onClick={handleSave}>Guardar</button>
        </div>
      </div>
    </div>
  )
}

function getPowerClass(dbm: string | undefined): string {
  if (!dbm) return ''
  const v = parseFloat(dbm)
  if (isNaN(v)) return ''
  if (v >= -8)  return 'power-high'
  if (v >= -27) return 'power-ok'
  if (v >= -30) return 'power-warn'
  return 'power-crit'
}

function getPowerLabel(dbm: string | undefined): string {
  if (!dbm) return '—'
  const v = parseFloat(dbm)
  if (isNaN(v)) return '—'
  if (v >= -8)  return 'Alta'
  if (v >= -27) return 'OK'
  if (v >= -30) return 'Baja'
  return 'Crítica'
}
