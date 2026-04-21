export type FeatureKind = 'node' | 'splice_box' | 'nap' | 'fiber_line'

export type FiberColor =
  | 'blue' | 'orange' | 'green' | 'brown' | 'slate' | 'white'
  | 'red'  | 'black'  | 'yellow'| 'violet'| 'rose'  | 'aqua'

export type ClientInfo = {
  name: string
  address?: string
  phone?: string
  email?: string
  onuModel?: string
  onuSerial?: string
  onuPowerDbm?: string
  notes?: string
}

export type Fiber = { id: string; index: number; color: FiberColor; clientName?: string; clientInfo?: ClientInfo }

export type FiberCable = {
  id: string
  name: string
  side: 'left' | 'right'
  fibers: Fiber[]
  linkedFeatureId?: string   // ID del nodo/caja/NAP en el otro extremo
  linkedLineId?: string      // ID de la fiber_line del mapa que representa este cable
}

export type SpliceConnection = {
  id: string
  leftFiberId: string
  rightFiberId: string
  active: boolean
  bendX?: number
  bendY?: number
}

export type Splitter = {
  id: string
  name: string
  ratio: number          // N in 1xN
  inputPortId: string
  outputPortIds: string[]
  posX?: number
  posY?: number
}

export type SpliceCard = {
  cables: FiberCable[]
  connections: SpliceConnection[]
  splitters: Splitter[]
}
export type FeatureStatus = 'planned' | 'active' | 'maintenance' | 'damaged'
export type OdfConnectorType = 'SC/UPC' | 'SC/APC' | 'LC/UPC' | 'LC/APC'

export type AppFeatureProperties = {
  id: string
  featureType: FeatureKind
  name: string
  code: string
  notes: string
  status: FeatureStatus
  color: string
  // Elementos activos (solo Nodo)
  oltModel?: string
  mikrotikModel?: string
  odfConnectorType?: OdfConnectorType | ''
  odfCount?: number
  batteryCount?: number
  // Carta de empalme (splice_box y nap)
  spliceCard?: SpliceCard
  // Rack (solo Nodo)
  rack?: Rack
}

// ── Rack types ────────────────────────────────────────────────────────────────
export type RackPortStatus = 'free' | 'active' | 'reserved'

export type RackPort = {
  id: string
  index: number
  label: string
  status: RackPortStatus
  clientName?: string
}

export type RackPanelKind = 'odf' | 'switch' | 'olt' | 'mikrotik' | 'splitter' | 'blank'

export type RackPortGroup = {
  id: string
  label: string
  ports: RackPort[]
}

export type RackPanel = {
  id: string
  unit: number
  heightU: number
  kind: RackPanelKind
  name: string
  connectorType?: OdfConnectorType | ''
  portCount?: number
  ports: RackPort[]           // ODF / patch
  portGroups?: RackPortGroup[] // OLT / switch / mikrotik
  zabbixHost?: string          // hostname en Zabbix para este panel OLT
}

export type RackConnection = {
  id: string
  fromPortId: string
  toPortId: string
  active: boolean
  bendX?: number
  bendY?: number
}

export type Rack = {
  totalUnits: number
  panels: RackPanel[]
  connections: RackConnection[]
}

export type AppFeature = GeoJSON.Feature<GeoJSON.Geometry, AppFeatureProperties>
export type AppFeatureCollection = GeoJSON.FeatureCollection<GeoJSON.Geometry, AppFeatureProperties>

export type SubProjectLocation = {
  lat: number
  lng: number
  displayName: string
}

export type SubProject = {
  id: string
  name: string
  description: string
  createdAt: string
  updatedAt: string
  location?: SubProjectLocation
  features: AppFeature[]
}

export type Project = {
  id: string
  name: string
  description: string
  createdAt: string
  updatedAt: string
  subProjects: SubProject[]
}

export type AppView = 'home' | 'subprojects' | 'editor'

export type ZabbixAuthMethod = 'token' | 'credentials'

export type ZabbixConfig = {
  url: string
  authMethod: ZabbixAuthMethod
  apiToken?: string
  username?: string
  password?: string
  ponPortItemKey: string       // key template, {port} = número de puerto PON
  onuItemKey: string           // key del item de potencia ONU
  onuHostSearchField: 'name' | 'host'
}

export type NominatimResult = {
  place_id: number
  display_name: string
  lat: string
  lon: string
  type: string
}
