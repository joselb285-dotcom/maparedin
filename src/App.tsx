import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import L from 'leaflet'
import JSZip from 'jszip'
import { kml as kmlToGeoJSON } from '@tmcw/togeojson'
import 'leaflet/dist/leaflet.css'
import '@geoman-io/leaflet-geoman-free'
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'
import type {
  AppFeature, AppFeatureCollection, AppFeatureProperties,
  AppView, FeatureKind, FeatureStatus, NominatimResult,
  OdfConnectorType, Project, SubProject, SubProjectLocation, SpliceCard
} from './types'
import { dbGetAllProjects, dbSaveProject, dbDeleteProject } from './db'
import Dashboard from './Dashboard'
import SpliceCardModal from './SpliceCardModal'
import RackModal from './RackModal'
import OpticalPathPanel from './OpticalPathPanel'
import { traceOpticalPath } from './OpticalPath'
import type { OpticalPath } from './OpticalPath'
import ZabbixConfigModal from './ZabbixConfigModal'
import { loadZabbixConfig } from './zabbix'
import type { ZabbixConfig } from './types'

const defaultCenter: L.LatLngExpression = [-31.4201, -64.1888]
const defaultZoom = 13

const typeLabels: Record<FeatureKind, string> = {
  node: 'Nodo',
  splice_box: 'Caja de empalme',
  nap: 'Caja NAP',
  fiber_line: 'Línea de fibra'
}

const defaultColors: Record<FeatureKind, string> = {
  node: '#2563eb',
  splice_box: '#f97316',
  nap: '#16a34a',
  fiber_line: '#dc2626'
}

const statusLabels: Record<FeatureStatus, string> = {
  planned: 'Planificado',
  active: 'Activo',
  maintenance: 'Mantenimiento',
  damaged: 'Dañado'
}

function makeId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function now() { return new Date().toISOString() }

function makeProperties(featureType: FeatureKind): AppFeatureProperties {
  return {
    id: makeId(),
    featureType,
    name: `${typeLabels[featureType]} ${new Date().toLocaleTimeString('es-AR')}`,
    code: '',
    notes: '',
    status: 'planned',
    color: defaultColors[featureType]
  }
}

function normalizeFeature(feature: GeoJSON.Feature): AppFeature {
  const geometryType = feature.geometry?.type
  const featureType = geometryType === 'LineString' ? 'fiber_line' : 'node'
  const props = feature.properties ?? {}
  return {
    type: 'Feature',
    geometry: feature.geometry as GeoJSON.Geometry,
    properties: {
      id: String(props.id ?? makeId()),
      featureType: (props.featureType as FeatureKind) ?? featureType,
      name: String(props.name ?? typeLabels[featureType]),
      code: String(props.code ?? ''),
      notes: String(props.notes ?? ''),
      status: (props.status as FeatureStatus) ?? 'planned',
      color: String(props.color ?? defaultColors[featureType]),
      oltModel: props.oltModel ? String(props.oltModel) : undefined,
      mikrotikModel: props.mikrotikModel ? String(props.mikrotikModel) : undefined,
      odfConnectorType: props.odfConnectorType ? (props.odfConnectorType as OdfConnectorType) : undefined,
      odfCount: props.odfCount != null ? Number(props.odfCount) : undefined,
      batteryCount: props.batteryCount != null ? Number(props.batteryCount) : undefined,
      spliceCard: props.spliceCard as SpliceCard | undefined
    }
  }
}

function featureCollection(features: AppFeature[]): AppFeatureCollection {
  return { type: 'FeatureCollection', features }
}

function downloadTextFile(filename: string, contents: string, mimeType: string) {
  const blob = new Blob([contents], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

async function geocodeLocation(query: string): Promise<NominatimResult[]> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=6&addressdetails=0`
  const res = await fetch(url, { headers: { 'Accept-Language': 'es', 'User-Agent': 'ftth-gis-editor/1.0' } })
  if (!res.ok) throw new Error('Error al consultar el servicio de geocodificación.')
  return res.json()
}

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`
    const res = await fetch(url, { headers: { 'Accept-Language': 'es', 'User-Agent': 'ftth-gis-editor/1.0' } })
    if (!res.ok) return `${lat.toFixed(5)}, ${lng.toFixed(5)}`
    const data = await res.json()
    return data.display_name ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`
  } catch {
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`
  }
}

// ─── Map layer names ─────────────────────────────────────────────────────────
const LAYER_NAMES = [
  'OSM', 'Topográfico',
  'Google Calles', 'Google Satélite', 'Google Híbrido',
  'Esri Satélite', 'CartoDB Oscuro',
] as const
type LayerName = typeof LAYER_NAMES[number]

// ─── Dropdown menu component ─────────────────────────────────────────────────
function DropdownMenu({ label, children, align = 'right' }: {
  label: React.ReactNode
  children: React.ReactNode
  align?: 'left' | 'right'
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function onOut(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onOut)
    return () => document.removeEventListener('mousedown', onOut)
  }, [])
  return (
    <div className="dropdown" ref={ref}>
      <button className="dropdown-btn" onClick={() => setOpen(o => !o)}>
        {label} <span className="dd-caret">▾</span>
      </button>
      {open && (
        <div className={`dropdown-panel${align === 'left' ? ' dd-panel-left' : ''}`} onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  )
}

// ─── Save status indicator ───────────────────────────────────────────────────
type SaveStatus = 'saved' | 'unsaved' | 'saving' | 'error'

export default function App() {
  // Map refs
  const mapElementRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const editableLayerGroupRef = useRef<L.FeatureGroup | null>(null)
  const layerIndexRef = useRef<Map<string, L.Layer>>(new Map())
  const baseLayersRef = useRef<Record<string, L.TileLayer>>({})
  const pathHighlightGroupRef = useRef<L.LayerGroup | null>(null)
  const highlightedLineLayers = useRef<L.Layer[]>([])
  const initialCenterRef = useRef<{ lat: number; lng: number } | null>(null)

  // Modal map refs
  const modalMapElementRef = useRef<HTMLDivElement | null>(null)
  const modalMapRef = useRef<L.Map | null>(null)
  const modalMarkerRef = useRef<L.Marker | null>(null)

  // Navigation
  const [view, setView] = useState<AppView>('home')
  const [projects, setProjects] = useState<Project[]>([])
  const [dbLoaded, setDbLoaded] = useState(false)
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null)
  const [currentSubProjectId, setCurrentSubProjectId] = useState<string | null>(null)

  // Save status
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Modal
  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'project' | 'subproject'>('project')
  const [modalName, setModalName] = useState('')
  const [modalDesc, setModalDesc] = useState('')
  const [modalError, setModalError] = useState('')
  const [modalSaving, setModalSaving] = useState(false)

  // Location search
  const [locationQuery, setLocationQuery] = useState('')
  const [locationResults, setLocationResults] = useState<NominatimResult[]>([])
  const [locationSearching, setLocationSearching] = useState(false)
  const [locationError, setLocationError] = useState('')
  const [selectedLocation, setSelectedLocation] = useState<SubProjectLocation | null>(null)

  // Active map layer
  const [activeLayer, setActiveLayer] = useState<LayerName>('OSM')

  // Hidden file input ref for import dropdown
  const importFileRef = useRef<HTMLInputElement>(null)

  // Zabbix
  const [zabbixConfig, setZabbixConfig] = useState<ZabbixConfig | null>(() => loadZabbixConfig())
  const [showZabbixConfig, setShowZabbixConfig] = useState(false)

  // Editor
  const [showSpliceCard, setShowSpliceCard] = useState(false)
  const [showRack, setShowRack] = useState(false)
  const [features, setFeatures] = useState<AppFeature[]>([])
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null)
  const [opticalPath, setOpticalPath] = useState<OpticalPath | null>(null)
  const [drawModeType, setDrawModeType] = useState<FeatureKind>('node')
  const drawModeTypeRef = useRef<FeatureKind>('node')
  const [message, setMessage] = useState('Listo para dibujar o importar KML/KMZ.')
  const [expandedSections, setExpandedSections] = useState({
    import: true,
    draw: true,
    export: false,
    elements: true,
    properties: true
  })

  const currentProject = projects.find(p => p.id === currentProjectId) ?? null
  const currentSubProject = currentProject?.subProjects.find(sp => sp.id === currentSubProjectId) ?? null
  const selectedFeature = useMemo(
    () => features.find(f => f.properties.id === selectedFeatureId) ?? null,
    [features, selectedFeatureId]
  )

  useEffect(() => {
    if (selectedFeature) {
      setExpandedSections(current => ({ ...current, properties: true }))
    }
  }, [selectedFeature])

  function togglePanelSection(section: keyof typeof expandedSections) {
    setExpandedSections(current => ({ ...current, [section]: !current[section] }))
  }

  function handleDrawModeChange(value: FeatureKind) {
    setDrawModeType(value)
    drawModeTypeRef.current = value
  }

  // ── Load all projects from IndexedDB on startup ───────────────────────────
  useEffect(() => {
    dbGetAllProjects()
      .then(loaded => {
        setProjects(loaded)
        setDbLoaded(true)
      })
      .catch(() => setDbLoaded(true))
  }, [])

  // ── Auto-save current project to IndexedDB whenever features change ───────
  const scheduleSave = useCallback((updatedProject: Project) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    setSaveStatus('unsaved')
    saveTimerRef.current = setTimeout(async () => {
      setSaveStatus('saving')
      try {
        await dbSaveProject(updatedProject)
        setSaveStatus('saved')
      } catch {
        setSaveStatus('error')
      }
    }, 800)
  }, [])

  // Sync features into project state and trigger save
  useEffect(() => {
    if (!currentProjectId || !currentSubProjectId || !dbLoaded) return
    setProjects(prev => {
      const updated = prev.map(p =>
        p.id !== currentProjectId ? p : {
          ...p,
          updatedAt: now(),
          subProjects: p.subProjects.map(sp =>
            sp.id !== currentSubProjectId ? sp : { ...sp, updatedAt: now(), features }
          )
        }
      )
      const updatedProject = updated.find(p => p.id === currentProjectId)
      if (updatedProject) scheduleSave(updatedProject)
      return updated
    })
  }, [features])

  // ── Optical path map highlighting ────────────────────────────────────────
  useEffect(() => {
    const group = pathHighlightGroupRef.current
    if (!group) return

    // Clear overlay group
    group.clearLayers()

    // Remove animation classes from previously highlighted lines
    highlightedLineLayers.current.forEach(layer => {
      const el = (layer as any)._path as SVGElement | undefined
      if (el) {
        el.classList.remove('optical-path-line')
        el.removeAttribute('data-op-idx')
      }
    })
    highlightedLineLayers.current = []

    if (!opticalPath) return

    // 1. Collect lat/lng of each path point feature (for badges + fit bounds)
    const pathPoints: { id: string; lat: number; lng: number }[] = []
    opticalPath.allFeatureIds.forEach(fid => {
      const feat = features.find(f => f.properties.id === fid)
      if (!feat || feat.geometry.type !== 'Point') return
      const [lng, lat] = (feat.geometry as GeoJSON.Point).coordinates
      pathPoints.push({ id: fid, lat, lng })
    })

    // 2. Animate ONLY the fiber_lines explicitly linked via cable.linkedLineId
    //    — no proximity fallback so other cables on the same feature stay dark
    opticalPath.lineFeatureIds.forEach(lineId => {
      const layer = layerIndexRef.current.get(lineId)
      if (!layer) return
      const el = (layer as any)._path as SVGElement | undefined
      if (!el) return
      el.classList.add('optical-path-line')
      el.style.animationDelay = '0s'
      highlightedLineLayers.current.push(layer)
    })

    // 3. Overlay badges + pulse rings on point features
    opticalPath.allFeatureIds.forEach((fid, idx) => {
      const layer = layerIndexRef.current.get(fid)
      if (!layer) return

      let latlng: L.LatLng | null = null
      if ((layer as any).getLatLng) latlng = (layer as any).getLatLng()
      else if ((layer as any).getBounds) latlng = (layer as any).getBounds().getCenter()
      if (!latlng) return

      const feat = features.find(f => f.properties.id === fid)
      const isNode = feat?.properties.featureType === 'node'
      const isLast = idx === opticalPath.allFeatureIds.length - 1

      // Pulse ring (animated via CSS)
      L.circleMarker(latlng, {
        radius: 20,
        color: isNode ? '#3b82f6' : isLast ? '#22c55e' : '#f59e0b',
        weight: 2.5,
        opacity: 0,
        fillOpacity: 0,
        className: `path-pulse-ring path-pulse-ring-${idx % 3}`,
      }).addTo(group)

      // Solid step badge
      const icon = L.divIcon({
        className: '',
        html: `<div class="path-step-badge ${isNode ? 'path-step-node' : isLast ? 'path-step-client' : ''}">${isNode ? '🖥' : isLast ? '🔌' : idx + 1}</div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      })
      L.marker(latlng, { icon, interactive: false }).addTo(group)
    })

    // 4. Auto-fit map to show the full path
    if (pathPoints.length >= 2) {
      const bounds = L.latLngBounds(pathPoints.map(p => L.latLng(p.lat, p.lng)))
      mapRef.current?.fitBounds(bounds.pad(0.25), { animate: true, duration: 0.8 })
    }
  }, [opticalPath, features])


  // ── Map initialization ────────────────────────────────────────────────────
  useEffect(() => {
    if (mapRef.current || !mapElementRef.current) return

    const center: L.LatLngExpression = initialCenterRef.current
      ? [initialCenterRef.current.lat, initialCenterRef.current.lng]
      : defaultCenter

    const map = L.map(mapElementRef.current, { center, zoom: defaultZoom, zoomControl: true })

    const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 20, attribution: '&copy; OpenStreetMap'
    }).addTo(map)

    baseLayersRef.current = {
      'OSM': osm,
      'Topográfico': L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        maxZoom: 17, attribution: '&copy; OpenTopoMap'
      }),
      'Google Calles': L.tileLayer('https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
        maxZoom: 22, subdomains: '0123', attribution: '&copy; Google Maps'
      }),
      'Google Satélite': L.tileLayer('https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
        maxZoom: 22, subdomains: '0123', attribution: '&copy; Google Maps'
      }),
      'Google Híbrido': L.tileLayer('https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
        maxZoom: 22, subdomains: '0123', attribution: '&copy; Google Maps'
      }),
      'Esri Satélite': L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19, attribution: '&copy; Esri'
      }),
      'CartoDB Oscuro': L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 20, attribution: '&copy; CartoDB'
      }),
    }
    editableLayerGroupRef.current = L.featureGroup().addTo(map)
    pathHighlightGroupRef.current = L.layerGroup().addTo(map)

    ;(map as any).pm.addControls({
      position: 'topleft',
      drawCircle: false, drawCircleMarker: false, drawRectangle: false,
      drawPolygon: false, drawText: false, cutPolygon: false,
      rotateMode: false, oneBlock: true
    })

    map.on('pm:create', (event: any) => {
      const layer = event.layer as L.Layer
      editableLayerGroupRef.current?.addLayer(layer)
      const feature = layerToFeature(layer, drawModeTypeRef.current)
      bindFeatureLayer(layer, feature)
      setFeatures(current => [...current, feature])
      setSelectedFeatureId(feature.properties.id)
      setMessage(`${typeLabels[feature.properties.featureType]} creado.`)
    })

    mapRef.current = map

    // Navigate to subproject location or fit existing features
    if (features.length > 0) {
      const bounds = L.geoJSON(featureCollection(features) as any).getBounds()
      if (bounds.isValid()) {
        map.fitBounds(bounds.pad(0.2))
      } else if (initialCenterRef.current) {
        map.setView([initialCenterRef.current.lat, initialCenterRef.current.lng], 15)
      }
    } else if (initialCenterRef.current) {
      map.setView([initialCenterRef.current.lat, initialCenterRef.current.lng], 15)
    }

    return () => {
      map.remove()
      mapRef.current = null
      editableLayerGroupRef.current = null
      pathHighlightGroupRef.current = null
      layerIndexRef.current.clear()
    }
  }, [view])

  useEffect(() => {
    syncMapLayers(features, selectedFeatureId)
  }, [features, selectedFeatureId])

  // ── Modal map ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!modalOpen || modalMode !== 'subproject') return
    if (!modalMapElementRef.current || modalMapRef.current) return

    const map = L.map(modalMapElementRef.current, { center: defaultCenter, zoom: 6 })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 20, attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map)

    map.on('click', async (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng
      if (modalMarkerRef.current) {
        modalMarkerRef.current.setLatLng([lat, lng])
      } else {
        modalMarkerRef.current = L.marker([lat, lng]).addTo(map)
      }
      const displayName = await reverseGeocode(lat, lng)
      setSelectedLocation({ lat, lng, displayName })
      setLocationQuery('')
      setLocationResults([])
      setLocationError('')
    })

    modalMapRef.current = map

    return () => {
      map.remove()
      modalMapRef.current = null
      modalMarkerRef.current = null
    }
  }, [modalOpen, modalMode])

  useEffect(() => {
    const map = modalMapRef.current
    if (!map || !selectedLocation) return
    const { lat, lng } = selectedLocation
    if (modalMarkerRef.current) {
      modalMarkerRef.current.setLatLng([lat, lng])
    } else {
      modalMarkerRef.current = L.marker([lat, lng]).addTo(map)
    }
    map.setView([lat, lng], 13)
  }, [selectedLocation])

  // ── Navigation ────────────────────────────────────────────────────────────
  function openSubProjects(projectId: string) {
    setCurrentProjectId(projectId)
    setView('subprojects')
  }

  function openEditor(subProjectId: string) {
    const project = projects.find(p => p.id === currentProjectId)
    const subProject = project?.subProjects.find(sp => sp.id === subProjectId)
    initialCenterRef.current = subProject?.location ?? null
    setCurrentSubProjectId(subProjectId)
    setFeatures(subProject?.features ?? [])
    setSelectedFeatureId(null)
    setSaveStatus('saved')
    setMessage('Listo para dibujar o importar KML/KMZ.')
    setView('editor')
  }

  function goHome() {
    setCurrentProjectId(null)
    setCurrentSubProjectId(null)
    setFeatures([])
    setView('home')
  }

  function goToSubProjects() {
    setCurrentSubProjectId(null)
    setFeatures([])
    setView('subprojects')
  }

  // ── Manual save ───────────────────────────────────────────────────────────
  async function saveNow() {
    if (!currentProject) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    setSaveStatus('saving')
    try {
      await dbSaveProject(currentProject)
      setSaveStatus('saved')
      setMessage('Proyecto guardado.')
    } catch {
      setSaveStatus('error')
      setMessage('Error al guardar.')
    }
  }

  // ── Modal ─────────────────────────────────────────────────────────────────
  function openCreateModal(mode: 'project' | 'subproject') {
    setModalMode(mode)
    setModalName('')
    setModalDesc('')
    setModalError('')
    setModalSaving(false)
    setLocationQuery('')
    setLocationResults([])
    setLocationError('')
    setSelectedLocation(null)
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setModalError('')
    setModalSaving(false)
  }

  async function submitModal() {
    if (!modalName.trim()) return
    setModalError('')
    setModalSaving(true)
    try {
      if (modalMode === 'project') {
        const newProject: Project = {
          id: makeId(),
          name: modalName.trim(),
          description: modalDesc.trim(),
          createdAt: now(),
          updatedAt: now(),
          subProjects: []
        }
        await dbSaveProject(newProject)
        setProjects(prev => [...prev, newProject])
      } else {
        if (!currentProjectId) return
        const newSP: SubProject = {
          id: makeId(),
          name: modalName.trim(),
          description: modalDesc.trim(),
          createdAt: now(),
          updatedAt: now(),
          location: selectedLocation ?? undefined,
          features: []
        }
        const updatedProject = projects.find(p => p.id === currentProjectId)
        if (!updatedProject) return
        const saved = { ...updatedProject, updatedAt: now(), subProjects: [...updatedProject.subProjects, newSP] }
        await dbSaveProject(saved)
        setProjects(prev => prev.map(p => p.id === currentProjectId ? saved : p))
      }
      closeModal()
    } catch (err) {
      console.error('Error guardando:', err)
      setModalError('Error al guardar: ' + String(err))
      setModalSaving(false)
    }
  }

  async function handleSearchLocation() {
    if (!locationQuery.trim()) return
    setLocationSearching(true)
    setLocationError('')
    setLocationResults([])
    try {
      const results = await geocodeLocation(locationQuery)
      if (results.length === 0) setLocationError('No se encontraron resultados. Probá con otro nombre.')
      else setLocationResults(results)
    } catch {
      setLocationError('No se pudo conectar al servicio de geocodificación.')
    } finally {
      setLocationSearching(false)
    }
  }

  function selectLocation(result: NominatimResult) {
    setSelectedLocation({ lat: parseFloat(result.lat), lng: parseFloat(result.lon), displayName: result.display_name })
    setLocationResults([])
  }

  function clearSelectedLocation() {
    setSelectedLocation(null)
    setLocationResults([])
    setLocationQuery('')
  }

  async function deleteProject(id: string) {
    if (!confirm('¿Eliminar este proyecto y todos sus sub-proyectos?')) return
    await dbDeleteProject(id)
    setProjects(prev => prev.filter(p => p.id !== id))
  }

  async function deleteSubProject(id: string) {
    if (!confirm('¿Eliminar este sub-proyecto y todos sus elementos?')) return
    const updatedProject = projects.find(p => p.id === currentProjectId)
    if (!updatedProject) return
    const saved = { ...updatedProject, updatedAt: now(), subProjects: updatedProject.subProjects.filter(sp => sp.id !== id) }
    await dbSaveProject(saved)
    setProjects(prev => prev.map(p => p.id === currentProjectId ? saved : p))
  }

  // ── Editor ────────────────────────────────────────────────────────────────
  function layerToFeature(layer: L.Layer, featureType: FeatureKind): AppFeature {
    const geoJson = (layer as any).toGeoJSON() as GeoJSON.Feature
    return normalizeFeature({
      ...geoJson,
      properties: {
        ...geoJson.properties,
        ...makeProperties(featureType),
        featureType: geoJson.geometry?.type === 'LineString' ? 'fiber_line' : featureType
      }
    })
  }

  function featureToLayer(feature: AppFeature): L.Layer {
    if (feature.geometry.type === 'Point') {
      const [lng, lat] = feature.geometry.coordinates
      return L.circleMarker([lat, lng], {
        radius: 8, color: feature.properties.color, weight: 2,
        fillColor: feature.properties.color, fillOpacity: 0.8
      })
    }
    if (feature.geometry.type === 'LineString') {
      const latLngs = feature.geometry.coordinates.map(([lng, lat]) => [lat, lng]) as L.LatLngExpression[]
      return L.polyline(latLngs, {
        color: feature.properties.color, weight: 4,
        opacity: feature.properties.status === 'damaged' ? 0.5 : 0.9,
        dashArray: feature.properties.status === 'planned' ? '8 6' : undefined
      })
    }
    throw new Error('Solo se soportan Point y LineString.')
  }

  function bindFeatureLayer(layer: L.Layer, feature: AppFeature) {
    layerIndexRef.current.set(feature.properties.id, layer)
    layer.on('click', () => setSelectedFeatureId(feature.properties.id))
    layer.on('pm:edit', () => {
      const layerGeoJson = (layer as any).toGeoJSON() as GeoJSON.Feature
      setFeatures(current =>
        current.map(item =>
          item.properties.id === feature.properties.id
            ? normalizeFeature({ ...layerGeoJson, properties: item.properties })
            : item
        )
      )
      setMessage('Geometría actualizada.')
    })
  }

  function syncMapLayers(currentFeatures: AppFeature[], currentSelectionId: string | null) {
    const group = editableLayerGroupRef.current
    if (!group) return
    const validIds = new Set(currentFeatures.map(f => f.properties.id))
    for (const [id, layer] of layerIndexRef.current.entries()) {
      if (!validIds.has(id)) { group.removeLayer(layer); layerIndexRef.current.delete(id) }
    }
    for (const feature of currentFeatures) {
      const existing = layerIndexRef.current.get(feature.properties.id)
      if (existing) { group.removeLayer(existing); layerIndexRef.current.delete(feature.properties.id) }
      const layer = featureToLayer(feature)
      bindFeatureLayer(layer, feature)
      group.addLayer(layer)
      if (currentSelectionId === feature.properties.id && 'bringToFront' in layer)
        (layer as any).bringToFront()
    }
  }

  function switchLayer(name: LayerName) {
    const map = mapRef.current
    if (!map) return
    Object.values(baseLayersRef.current).forEach(l => { if (map.hasLayer(l)) map.removeLayer(l) })
    baseLayersRef.current[name]?.addTo(map)
    setActiveLayer(name)
  }

  function activateDrawMode(mode: FeatureKind) {
    const map = mapRef.current
    if (!map) return
    ;(map as any).pm.disableDraw()
    setDrawModeType(mode)
    drawModeTypeRef.current = mode
    if (mode === 'fiber_line') {
      ;(map as any).pm.enableDraw('Line', {
        snappable: true,
        templineStyle: { color: defaultColors.fiber_line },
        pathOptions: { color: defaultColors.fiber_line, weight: 4 }
      })
      setMessage('Modo dibujo de línea de fibra activado.')
      return
    }
    ;(map as any).pm.enableDraw('Marker', { snappable: true })
    setMessage(`Modo creación de ${typeLabels[mode].toLowerCase()} activado.`)
  }

  function stopDrawing() {
    ;(mapRef.current as any)?.pm.disableDraw()
    setMessage('Modo dibujo desactivado.')
  }

  function updateSelectedFeature<K extends keyof AppFeatureProperties>(key: K, value: AppFeatureProperties[K]) {
    if (!selectedFeature) return
    setFeatures(current =>
      current.map(item =>
        item.properties.id === selectedFeature.properties.id
          ? { ...item, properties: { ...item.properties, [key]: value } }
          : item
      )
    )
  }

  function removeSelectedFeature() {
    if (!selectedFeature) return
    setFeatures(current => current.filter(f => f.properties.id !== selectedFeature.properties.id))
    setSelectedFeatureId(null)
    setMessage('Elemento eliminado.')
  }

  function exportGeoJSON() {
    const safeName = (currentSubProject?.name ?? 'sub-proyecto').replace(/\s+/g, '-').toLowerCase()
    downloadTextFile(
      `${safeName}-${new Date().toISOString().slice(0, 10)}.geojson`,
      JSON.stringify(featureCollection(features), null, 2),
      'application/geo+json'
    )
    setMessage('Exportado a GeoJSON.')
  }

  function clearSubProject() {
    if (!confirm('¿Borrar todos los elementos de este sub-proyecto?')) return
    setFeatures([])
    setSelectedFeatureId(null)
    setMessage('Elementos borrados.')
  }

  async function importFile(file: File) {
    try {
      let imported: GeoJSON.FeatureCollection
      if (file.name.toLowerCase().endsWith('.kml')) {
        const text = await file.text()
        const dom = new DOMParser().parseFromString(text, 'text/xml')
        imported = kmlToGeoJSON(dom) as GeoJSON.FeatureCollection
      } else if (file.name.toLowerCase().endsWith('.kmz')) {
        const arrayBuffer = await file.arrayBuffer()
        const zip = await JSZip.loadAsync(arrayBuffer)
        const kmlEntry = Object.values(zip.files).find(e => e.name.toLowerCase().endsWith('.kml'))
        if (!kmlEntry) throw new Error('El archivo KMZ no contiene un KML legible.')
        const kmlText = await kmlEntry.async('string')
        const dom = new DOMParser().parseFromString(kmlText, 'text/xml')
        imported = kmlToGeoJSON(dom) as GeoJSON.FeatureCollection
      } else if (file.name.toLowerCase().endsWith('.geojson') || file.name.toLowerCase().endsWith('.json')) {
        imported = JSON.parse(await file.text()) as GeoJSON.FeatureCollection
      } else {
        throw new Error('Formato no soportado. Usá KML, KMZ o GeoJSON.')
      }
      const normalized = imported.features
        .filter(f => f.geometry && ['Point', 'LineString'].includes(f.geometry.type))
        .map(normalizeFeature)
      if (normalized.length === 0) throw new Error('No se encontraron puntos o líneas importables.')
      setFeatures(current => [...current, ...normalized])
      const bounds = L.geoJSON(imported as any).getBounds()
      if (bounds.isValid()) mapRef.current?.fitBounds(bounds.pad(0.15))
      setMessage(`${normalized.length} elemento(s) importado(s) desde ${file.name}.`)
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Error desconocido'
      setMessage(`No se pudo importar: ${reason}`)
    }
  }

  // ── Save status label ─────────────────────────────────────────────────────
  const saveLabel: Record<SaveStatus, string> = {
    saved: '✓ Guardado',
    unsaved: '● Sin guardar',
    saving: '↑ Guardando...',
    error: '✕ Error al guardar'
  }
  const saveClass: Record<SaveStatus, string> = {
    saved: 'save-badge saved',
    unsaved: 'save-badge unsaved',
    saving: 'save-badge saving',
    error: 'save-badge error'
  }

  // ── Modal JSX ─────────────────────────────────────────────────────────────
  const modalJsx = modalOpen ? (
    <div className="modal-overlay" onClick={closeModal}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>{modalMode === 'project' ? 'Nuevo proyecto' : 'Nuevo sub-proyecto'}</h2>
        <div className="form-stack">
          <label>
            Nombre
            <input
              value={modalName}
              onChange={e => setModalName(e.target.value)}
              placeholder={modalMode === 'project' ? 'Ej: Telecom Argentina SA' : 'Ej: Córdoba Capital'}
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter' && modalMode === 'project') submitModal() }}
            />
          </label>
          <label>
            Descripción (opcional)
            <input
              value={modalDesc}
              onChange={e => setModalDesc(e.target.value)}
              placeholder="Descripción breve..."
            />
          </label>
          {modalMode === 'subproject' && (
            <>
              <label>
                Buscar localidad / ciudad
                <div className="location-search">
                  <input
                    value={locationQuery}
                    onChange={e => { setLocationQuery(e.target.value); setLocationError('') }}
                    placeholder="Ej: Córdoba, Argentina"
                    onKeyDown={e => e.key === 'Enter' && handleSearchLocation()}
                  />
                  <button type="button" className="secondary" onClick={handleSearchLocation}
                    disabled={locationSearching || !locationQuery.trim()}>
                    {locationSearching ? 'Buscando...' : 'Buscar'}
                  </button>
                </div>
              </label>
              {locationError && <p className="location-error">{locationError}</p>}
              {locationResults.length > 0 && !selectedLocation && (
                <div className="location-results">
                  {locationResults.map(result => (
                    <button key={result.place_id} type="button" className="location-result-item"
                      onClick={() => selectLocation(result)}>
                      {result.display_name}
                    </button>
                  ))}
                </div>
              )}
              <div className="modal-map-label">O hacé clic directamente en el mapa:</div>
              <div ref={modalMapElementRef} className="modal-map" />
              {selectedLocation && (
                <div className="location-selected">
                  <span>📍 {selectedLocation.displayName}</span>
                  <button type="button" className="secondary small" onClick={clearSelectedLocation}>Quitar</button>
                </div>
              )}
            </>
          )}
        </div>
        {modalError && (
          <div className="modal-error">{modalError}</div>
        )}
        <div className="modal-footer">
          <button className="secondary" onClick={closeModal} disabled={modalSaving}>Cancelar</button>
          <button onClick={submitModal} disabled={!modalName.trim() || modalSaving}>
            {modalSaving ? 'Guardando...' : 'Crear'}
          </button>
        </div>
      </div>
    </div>
  ) : null

  // ── Loading screen ────────────────────────────────────────────────────────
  if (!dbLoaded) {
    return <div className="screen"><p className="empty-state">Cargando base de datos...</p></div>
  }

  // ── Home ──────────────────────────────────────────────────────────────────
  if (view === 'home') {
    return (
      <>
        <Dashboard
          projects={projects}
          onOpenProject={openSubProjects}
          onCreateProject={() => openCreateModal('project')}
          onDeleteProject={deleteProject}
        />
        {modalJsx}
      </>
    )
  }

  // ── Sub-projects ──────────────────────────────────────────────────────────
  if (view === 'subprojects') {
    return (
      <div className="screen">
        <div className="screen-header">
          <div>
            <button className="back-btn" onClick={goHome}>← Proyectos</button>
            <h1>{currentProject?.name}</h1>
            {currentProject?.description && <p className="subtitle">{currentProject.description}</p>}
          </div>
          <button onClick={() => openCreateModal('subproject')}>+ Nuevo sub-proyecto</button>
        </div>
        {(currentProject?.subProjects.length ?? 0) === 0
          ? <p className="empty-state">No hay sub-proyectos todavía. Creá uno para comenzar.</p>
          : (
            <div className="card-grid">
              {currentProject?.subProjects.map(sp => (
                <div key={sp.id} className="card" onClick={() => openEditor(sp.id)}>
                  <div className="card-title">{sp.name}</div>
                  {sp.description && <p className="card-desc">{sp.description}</p>}
                  {sp.location && (
                    <p className="card-location">📍 {sp.location.displayName.split(',').slice(0, 2).join(',')}</p>
                  )}
                  <div className="card-meta">
                    <span>{sp.features.length} elemento(s)</span>
                    <span>Actualizado: {new Date(sp.updatedAt).toLocaleDateString('es-AR')}</span>
                  </div>
                  <button className="danger small" onClick={e => { e.stopPropagation(); deleteSubProject(sp.id) }}>
                    Eliminar
                  </button>
                </div>
              ))}
            </div>
          )}
        {modalJsx}
      </div>
    )
  }

  // ── Editor ────────────────────────────────────────────────────────────────
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <button className="back-btn" onClick={goToSubProjects}>← {currentProject?.name}</button>
          <h1>{currentSubProject?.name}</h1>
          {currentSubProject?.location && (
            <p className="subtitle">📍 {currentSubProject.location.displayName.split(',').slice(0, 2).join(',')}</p>
          )}
        </div>

        {/* Hidden file input for import */}
        <input
          ref={importFileRef}
          type="file"
          accept=".kml,.kmz,.geojson,.json"
          style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) importFile(f); e.currentTarget.value = '' }}
        />

        {/* Compact action toolbar */}
        <div className="sidebar-toolbar">
          <DropdownMenu label="📂 Importar" align="left">
            <button className="dropdown-item" onClick={() => importFileRef.current?.click()}>
              KML / KMZ / GeoJSON
            </button>
          </DropdownMenu>

          <DropdownMenu label="✏ Dibujar" align="left">
            <button className="dropdown-item" onClick={() => activateDrawMode('node')}>
              📍 Nodo
            </button>
            <button className="dropdown-item" onClick={() => activateDrawMode('splice_box')}>
              📦 Caja empalme
            </button>
            <button className="dropdown-item" onClick={() => activateDrawMode('nap')}>
              🔌 Caja NAP
            </button>
            <button className="dropdown-item" onClick={() => activateDrawMode('fiber_line')}>
              〰 Línea de fibra
            </button>
            <div className="dropdown-divider" />
            <button className="dropdown-item" onClick={stopDrawing}>
              ⏹ Detener dibujo
            </button>
          </DropdownMenu>

          <DropdownMenu label="···" align="left">
            <button className="dropdown-item" onClick={exportGeoJSON}>
              ⬇ Exportar GeoJSON
            </button>
            <button className="dropdown-item danger" onClick={clearSubProject}>
              🗑 Limpiar todo
            </button>
          </DropdownMenu>
        </div>

        <section className={`panel-block panel-section ${expandedSections.elements ? 'expanded' : ''}`}>
          <button type="button" className="panel-toggle" onClick={() => togglePanelSection('elements')}>
            <span>Elementos ({features.length})</span>
            <span>{expandedSections.elements ? '▾' : '▸'}</span>
          </button>
          {expandedSections.elements && (
            <div className="panel-content feature-list">
              {features.length === 0 && <p className="empty-state">Todavía no hay elementos.</p>}
              {features.map(feature => (
                <button key={feature.properties.id}
                  className={`feature-row compact ${selectedFeatureId === feature.properties.id ? 'selected' : ''}`}
                  onClick={() => setSelectedFeatureId(feature.properties.id)}>
                  <span className="badge" style={{ background: feature.properties.color }} />
                  <span>
                    <strong>{feature.properties.name || typeLabels[feature.properties.featureType]}</strong>
                    <small>{typeLabels[feature.properties.featureType]} · {statusLabels[feature.properties.status]}</small>
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb">
            <span className="breadcrumb-link" onClick={goHome}>Proyectos</span>
            <span className="breadcrumb-sep">/</span>
            <span className="breadcrumb-link" onClick={goToSubProjects}>{currentProject?.name}</span>
            <span className="breadcrumb-sep">/</span>
            <span>{currentSubProject?.name}</span>
          </div>
          <div className="topbar-right">
            <button
              className={`secondary${zabbixConfig ? ' zabbix-configured' : ''}`}
              title={zabbixConfig ? 'Zabbix configurado — clic para editar' : 'Configurar Zabbix'}
              onClick={() => setShowZabbixConfig(true)}
              style={{ fontSize: '0.78rem' }}
            >
              ⚡ Zabbix{zabbixConfig ? ' ✓' : ''}
            </button>
            <DropdownMenu label="🗺 Capas">
              {LAYER_NAMES.map(name => (
                <button
                  key={name}
                  className={`dropdown-item${activeLayer === name ? ' dd-active' : ''}`}
                  onClick={() => switchLayer(name)}
                >
                  {name}
                </button>
              ))}
            </DropdownMenu>
            <DropdownMenu label="Acciones">
              <button className="dropdown-item" onClick={saveNow} disabled={saveStatus === 'saving'}>
                💾 Guardar ahora
              </button>
              <button className="dropdown-item" onClick={exportGeoJSON}>
                ⬇ Exportar GeoJSON
              </button>
              <button className="dropdown-item danger" onClick={clearSubProject}>
                🗑 Limpiar todo
              </button>
            </DropdownMenu>
            <span className={saveClass[saveStatus]}>{saveLabel[saveStatus]}</span>
            <span className="topbar-status">{message}</span>
          </div>
        </header>
        <div ref={mapElementRef} className="map-container" />
      </main>

      <aside className="properties-panel">
        <h2>Propiedades</h2>
        {!selectedFeature && <p className="empty-state">Seleccioná un elemento del mapa o de la lista.</p>}
        {selectedFeature && (
          <div className="form-stack compact-form">
            <label>
              Tipo
              <input value={typeLabels[selectedFeature.properties.featureType]} readOnly />
            </label>
            <label>
              Nombre
              <input value={selectedFeature.properties.name}
                onChange={e => updateSelectedFeature('name', e.target.value)} />
            </label>
            <label>
              Código
              <input value={selectedFeature.properties.code}
                onChange={e => updateSelectedFeature('code', e.target.value)} />
            </label>
            <label>
              Estado
              <select value={selectedFeature.properties.status}
                onChange={e => updateSelectedFeature('status', e.target.value as FeatureStatus)}>
                {Object.entries(statusLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label>
              Color
              <input type="color" value={selectedFeature.properties.color}
                onChange={e => updateSelectedFeature('color', e.target.value)} />
            </label>
            <label>
              Observaciones
              <textarea rows={3} value={selectedFeature.properties.notes}
                onChange={e => updateSelectedFeature('notes', e.target.value)} />
            </label>

            {selectedFeature.properties.featureType === 'node' && (
              <button className="secondary compact" onClick={() => setShowRack(true)}>
                Ver rack
              </button>
            )}

            {selectedFeature.properties.featureType === 'node' && (
              <div className="node-extras compact-form">
                <div className="node-extras-title">Nodo</div>
                <label>
                  OLT
                  <input value={selectedFeature.properties.oltModel ?? ''}
                    onChange={e => updateSelectedFeature('oltModel', e.target.value || undefined)}
                    placeholder="Ej: Huawei..." />
                </label>
                <label>
                  Mikrotik
                  <input value={selectedFeature.properties.mikrotikModel ?? ''}
                    onChange={e => updateSelectedFeature('mikrotikModel', e.target.value || undefined)}
                    placeholder="Ej: CCR1036..." />
                </label>
                <label>
                  Conectores ODF
                  <select value={selectedFeature.properties.odfConnectorType ?? ''}
                    onChange={e => updateSelectedFeature('odfConnectorType', (e.target.value as OdfConnectorType) || undefined)}>
                    <option value="">Sin especificar</option>
                    <option value="SC/UPC">SC/UPC</option>
                    <option value="SC/APC">SC/APC</option>
                    <option value="LC/UPC">LC/UPC</option>
                    <option value="LC/APC">LC/APC</option>
                  </select>
                </label>
                <label>
                  ODF armados
                  <input type="number" min="0"
                    value={selectedFeature.properties.odfCount ?? ''}
                    onChange={e => updateSelectedFeature('odfCount', e.target.value ? Number(e.target.value) : undefined)}
                    placeholder="0" />
                </label>
                <label>
                  Baterías
                  <input type="number" min="0"
                    value={selectedFeature.properties.batteryCount ?? ''}
                    onChange={e => updateSelectedFeature('batteryCount', e.target.value ? Number(e.target.value) : undefined)}
                    placeholder="0" />
                </label>
              </div>
            )}

            {(selectedFeature.properties.featureType === 'splice_box' ||
              selectedFeature.properties.featureType === 'nap') && (
              <button className="secondary compact" onClick={() => setShowSpliceCard(true)}>
                Ver carta de empalme
              </button>
            )}

            <button className="danger compact" onClick={removeSelectedFeature}>Eliminar</button>
          </div>
        )}
      </aside>

      {showRack && selectedFeature && selectedFeature.properties.featureType === 'node' && (
        <RackModal
          featureName={selectedFeature.properties.name}
          rack={selectedFeature.properties.rack ?? { totalUnits: 12, panels: [], connections: [] }}
          zabbixConfig={zabbixConfig}
          onChange={rack => updateSelectedFeature('rack', rack)}
          onClose={() => setShowRack(false)}
        />
      )}

      {showSpliceCard && selectedFeature &&
        (selectedFeature.properties.featureType === 'splice_box' ||
         selectedFeature.properties.featureType === 'nap') && (
        <SpliceCardModal
          featureId={selectedFeature.properties.id}
          featureName={selectedFeature.properties.name}
          projectName={currentProject?.name ?? ''}
          subProjectName={currentSubProject?.name ?? ''}
          spliceCard={selectedFeature.properties.spliceCard ?? { cables: [], connections: [], splitters: [] }}
          allFeatures={features}
          zabbixConfig={zabbixConfig}
          onChange={(card) => updateSelectedFeature('spliceCard', card)}
          onClose={() => setShowSpliceCard(false)}
          onTraceClient={(fiberId) => {
            const path = traceOpticalPath(fiberId, features)
            setOpticalPath(path)
          }}
        />
      )}

      {opticalPath && (
        <OpticalPathPanel
          path={opticalPath}
          onClose={() => setOpticalPath(null)}
        />
      )}

      {showZabbixConfig && (
        <ZabbixConfigModal
          initial={zabbixConfig}
          onSaved={cfg => setZabbixConfig(cfg)}
          onClose={() => setShowZabbixConfig(false)}
        />
      )}
    </div>
  )
}
