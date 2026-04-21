import type { ZabbixConfig } from './types'

async function rpc(url: string, method: string, params: unknown, auth: string | null): Promise<unknown> {
  const res = await fetch(`${url.replace(/\/$/, '')}/api_jsonrpc.php`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, auth, id: 1 }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  if (data.error) throw new Error(data.error.data || data.error.message)
  return data.result
}

export async function zabbixLogin(config: ZabbixConfig): Promise<string> {
  if (config.authMethod === 'token') return config.apiToken!
  const result = await rpc(config.url, 'user.login', {
    user: config.username,
    password: config.password,
  }, null)
  return result as string
}

export async function getOltPortPower(
  config: ZabbixConfig,
  auth: string,
  zabbixHost: string,
  portIndex: number,
): Promise<string | null> {
  const key = config.ponPortItemKey.replace('{port}', String(portIndex))
  const items = await rpc(config.url, 'item.get', {
    host: zabbixHost,
    search: { key_: key },
    searchWildcardsEnabled: true,
    output: ['lastvalue', 'units'],
    limit: 1,
  }, auth) as Array<{ lastvalue: string; units: string }>
  if (!items[0]) return null
  const val = items[0].lastvalue
  const units = items[0].units
  return units ? `${val} ${units}` : val
}

export async function getOnuPower(
  config: ZabbixConfig,
  auth: string,
  serial: string,
): Promise<string | null> {
  const searchParam: Record<string, string> = {}
  searchParam[config.onuHostSearchField] = serial

  const hosts = await rpc(config.url, 'host.get', {
    search: searchParam,
    output: ['hostid'],
    limit: 1,
  }, auth) as Array<{ hostid: string }>
  if (!hosts[0]) return null

  const items = await rpc(config.url, 'item.get', {
    hostids: [hosts[0].hostid],
    search: { key_: config.onuItemKey },
    searchWildcardsEnabled: true,
    output: ['lastvalue', 'units'],
    limit: 1,
  }, auth) as Array<{ lastvalue: string; units: string }>
  if (!items[0]) return null
  const val = items[0].lastvalue
  const units = items[0].units
  return units ? `${val} ${units}` : val
}

export function loadZabbixConfig(): ZabbixConfig | null {
  try {
    const raw = localStorage.getItem('ftth_zabbix_config')
    return raw ? (JSON.parse(raw) as ZabbixConfig) : null
  } catch { return null }
}

export function saveZabbixConfig(config: ZabbixConfig): void {
  localStorage.setItem('ftth_zabbix_config', JSON.stringify(config))
}
