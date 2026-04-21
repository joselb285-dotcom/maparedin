import { useState } from 'react'
import type { ZabbixAuthMethod, ZabbixConfig } from './types'
import { saveZabbixConfig, zabbixLogin } from './zabbix'

interface Props {
  initial: ZabbixConfig | null
  onClose: () => void
  onSaved: (cfg: ZabbixConfig) => void
}

const DEFAULT: ZabbixConfig = {
  url: '',
  authMethod: 'token',
  apiToken: '',
  username: '',
  password: '',
  ponPortItemKey: 'olt.pon[{port}].rx',
  onuItemKey: 'onu.rx.signal',
  onuHostSearchField: 'name',
}

export default function ZabbixConfigModal({ initial, onClose, onSaved }: Props) {
  const [cfg, setCfg] = useState<ZabbixConfig>(initial ?? DEFAULT)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)

  function set<K extends keyof ZabbixConfig>(k: K, v: ZabbixConfig[K]) {
    setCfg(prev => ({ ...prev, [k]: v }))
    setTestResult(null)
  }

  async function testConnection() {
    setTesting(true)
    setTestResult(null)
    try {
      await zabbixLogin(cfg)
      setTestResult({ ok: true, msg: 'Conexión exitosa' })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error desconocido'
      setTestResult({ ok: false, msg })
    } finally {
      setTesting(false)
    }
  }

  function handleSave() {
    saveZabbixConfig(cfg)
    onSaved(cfg)
    onClose()
  }

  return (
    <div className="client-modal-overlay" onClick={onClose}>
      <div className="client-modal" style={{ maxWidth: 540 }} onClick={e => e.stopPropagation()}>
        <div className="client-modal-header">
          <div>
            <h2>Configuración Zabbix</h2>
            <p className="client-modal-sub">Monitoreo de potencias ópticas</p>
          </div>
          <button className="secondary" onClick={onClose}>✕</button>
        </div>

        <div className="client-modal-body">
          <div className="client-section-title">Conexión al servidor</div>
          <div className="client-form-grid">
            <label style={{ gridColumn: '1 / -1' }}>
              URL del servidor Zabbix
              <input
                value={cfg.url}
                onChange={e => set('url', e.target.value)}
                placeholder="http://zabbix.miservidor.com"
              />
            </label>
            <label style={{ gridColumn: '1 / -1' }}>
              Método de autenticación
              <select
                value={cfg.authMethod}
                onChange={e => set('authMethod', e.target.value as ZabbixAuthMethod)}
              >
                <option value="token">API Token (Zabbix 5.4+)</option>
                <option value="credentials">Usuario / Contraseña</option>
              </select>
            </label>
            {cfg.authMethod === 'token' ? (
              <label style={{ gridColumn: '1 / -1' }}>
                API Token
                <input
                  type="password"
                  value={cfg.apiToken ?? ''}
                  onChange={e => set('apiToken', e.target.value)}
                  placeholder="Token generado en Zabbix → Administration → API tokens"
                />
              </label>
            ) : (
              <>
                <label>
                  Usuario
                  <input
                    value={cfg.username ?? ''}
                    onChange={e => set('username', e.target.value)}
                    placeholder="Admin"
                  />
                </label>
                <label>
                  Contraseña
                  <input
                    type="password"
                    value={cfg.password ?? ''}
                    onChange={e => set('password', e.target.value)}
                  />
                </label>
              </>
            )}
          </div>

          <div className="client-section-title">Items de monitoreo</div>
          <div className="client-form-grid">
            <label style={{ gridColumn: '1 / -1' }}>
              Item key — Potencia por puerto PON (OLT)
              <input
                value={cfg.ponPortItemKey}
                onChange={e => set('ponPortItemKey', e.target.value)}
                placeholder="olt.pon[{port}].rx"
              />
              <span className="client-power-hint">
                Usar <code style={{ color: '#60a5fa' }}>{'{port}'}</code> como placeholder
                del número de puerto (ej: <code style={{ color: '#60a5fa' }}>olt.pon[1].rx</code>)
              </span>
            </label>
            <label>
              Item key — Potencia ONU/ONT
              <input
                value={cfg.onuItemKey}
                onChange={e => set('onuItemKey', e.target.value)}
                placeholder="onu.rx.signal"
              />
            </label>
            <label>
              Identificar ONU por número de serie en
              <select
                value={cfg.onuHostSearchField}
                onChange={e => set('onuHostSearchField', e.target.value as 'name' | 'host')}
              >
                <option value="name">Nombre visible del host</option>
                <option value="host">Technical name (host)</option>
              </select>
            </label>
          </div>

          {testResult && (
            <div style={{
              marginTop: 12, padding: '8px 12px', borderRadius: 6,
              background: testResult.ok ? '#14532d44' : '#450a0a44',
              border: `1px solid ${testResult.ok ? '#4ade80' : '#f87171'}`,
              color: testResult.ok ? '#4ade80' : '#f87171',
              fontSize: '0.82rem',
            }}>
              {testResult.ok ? '✓ ' : '✗ '}{testResult.msg}
            </div>
          )}
        </div>

        <div className="client-modal-footer">
          <button
            className="secondary"
            onClick={testConnection}
            disabled={testing || !cfg.url}
          >
            {testing ? 'Probando...' : '🔌 Probar conexión'}
          </button>
          <button className="secondary" onClick={onClose}>Cancelar</button>
          <button onClick={handleSave} disabled={!cfg.url}>Guardar</button>
        </div>
      </div>
    </div>
  )
}
