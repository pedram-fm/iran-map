import { useEffect, useRef, useState, useCallback } from 'react'
import L from 'leaflet'

const PROVINCE_STYLE = { color: '#1b4f72', weight: 2, fillColor: '#2e86c1', fillOpacity: 0.12 }
const PROVINCE_HOVER = { color: '#e74c3c', weight: 3, fillColor: '#e74c3c', fillOpacity: 0.22 }
const COUNTY_STYLE   = { color: '#5d6d7e', weight: 1.5, fillColor: '#85929e', fillOpacity: 0.08 }
const COUNTY_HOVER   = { color: '#2980b9', weight: 2.5, fillColor: '#2980b9', fillOpacity: 0.22 }
const COUNTY_SELECTED = { color: '#1e8449', weight: 3, fillColor: '#27ae60', fillOpacity: 0.32 }

const ZONE_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#9b59b6', '#f39c12', '#1abc9c', '#e67e22', '#34495e']

// ── Simplify freehand points (Ramer–Douglas–Peucker) ──
function rdpSimplify(points, epsilon) {
  if (points.length <= 2) return points
  let maxDist = 0, index = 0
  const start = points[0], end = points[points.length - 1]
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDist(points[i], start, end)
    if (d > maxDist) { maxDist = d; index = i }
  }
  if (maxDist > epsilon) {
    const left = rdpSimplify(points.slice(0, index + 1), epsilon)
    const right = rdpSimplify(points.slice(index), epsilon)
    return left.slice(0, -1).concat(right)
  }
  return [start, end]
}

function perpendicularDist(point, lineStart, lineEnd) {
  const dx = lineEnd[0] - lineStart[0]
  const dy = lineEnd[1] - lineStart[1]
  const mag = Math.sqrt(dx * dx + dy * dy)
  if (mag === 0) return Math.sqrt((point[0] - lineStart[0]) ** 2 + (point[1] - lineStart[1]) ** 2)
  const u = ((point[0] - lineStart[0]) * dx + (point[1] - lineStart[1]) * dy) / (mag * mag)
  const ix = lineStart[0] + u * dx
  const iy = lineStart[1] + u * dy
  return Math.sqrt((point[0] - ix) ** 2 + (point[1] - iy) ** 2)
}

export default function MapView({
  view,
  currentProvince,
  selectedCounties,
  customZones,
  drawingMode,
  onDrillInto,
  onToggleCounty,
  onGoBack,
  onAddCustomZone,
  onRemoveCustomZone,
  sidebarOpen,
  onSetDrawingMode,
}) {
  const mapContainerRef = useRef(null)
  const mapRef = useRef(null)
  const provincesLayerRef = useRef(null)
  const countiesLayerRef = useRef(null)
  const customZonesLayerRef = useRef(null)
  const provincesDataRef = useRef(null)
  const countiesCacheRef = useRef({})
  const selectedRef = useRef(selectedCounties)

  // Freehand drawing state
  const isDrawingRef = useRef(false)          // currently dragging to draw
  const freehandPointsRef = useRef([])        // collected latlngs
  const freehandPolylineRef = useRef(null)    // live preview polyline
  const pendingPolygonRef = useRef(null)       // finished polygon layer

  const [hoverInfo, setHoverInfo] = useState(null)
  const [showNamePrompt, setShowNamePrompt] = useState(false)
  const [zoneName, setZoneName] = useState('')

  useEffect(() => { selectedRef.current = selectedCounties }, [selectedCounties])

  // ── Initialize map ──
  useEffect(() => {
    if (mapRef.current) return

    const map = L.map(mapContainerRef.current, {
      center: [32.5, 53.5],
      zoom: 6,
      minZoom: 4,
      maxZoom: 18,
      zoomControl: false,
    })

    L.control.zoom({ position: 'topleft' }).addTo(map)

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | CARTO',
      maxZoom: 19,
    }).addTo(map)

    // Layer for rendering saved custom zones
    const customZonesLayer = new L.FeatureGroup()
    map.addLayer(customZonesLayer)
    customZonesLayerRef.current = customZonesLayer

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // ── Sidebar toggle ──
  useEffect(() => {
    const timer = setTimeout(() => mapRef.current?.invalidateSize(), 350)
    return () => clearTimeout(timer)
  }, [sidebarOpen])

  // ── Freehand drawing mode toggle ──
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const container = map.getContainer()

    if (drawingMode) {
      // Disable map interactions while in drawing mode
      map.dragging.disable()
      map.doubleClickZoom.disable()
      container.style.cursor = 'crosshair'
      container.classList.add('freehand-active')

      const onMouseDown = (e) => {
        // Don't start drawing if name prompt is open
        if (isDrawingRef.current) return

        // Ignore clicks on controls
        if (e.originalEvent?.target !== container && !container.contains(e.originalEvent?.target)) return

        isDrawingRef.current = true
        freehandPointsRef.current = [e.latlng]

        // Create a live preview polyline
        freehandPolylineRef.current = L.polyline([e.latlng], {
          color: '#e74c3c',
          weight: 3,
          dashArray: '6, 4',
          fillOpacity: 0,
        }).addTo(map)
      }

      const onMouseMove = (e) => {
        if (!isDrawingRef.current) return
        freehandPointsRef.current.push(e.latlng)
        if (freehandPolylineRef.current) {
          freehandPolylineRef.current.addLatLng(e.latlng)
        }
      }

      const onMouseUp = () => {
        if (!isDrawingRef.current) return
        isDrawingRef.current = false

        const points = freehandPointsRef.current
        // Remove the preview polyline
        if (freehandPolylineRef.current) {
          map.removeLayer(freehandPolylineRef.current)
          freehandPolylineRef.current = null
        }

        // Need at least 3 points for a polygon
        if (points.length < 3) {
          freehandPointsRef.current = []
          return
        }

        // Simplify the points to reduce vertex count
        const rawPts = points.map(p => [p.lat, p.lng])
        const simplified = rdpSimplify(rawPts, 0.001) // ~100m tolerance
        const latlngs = simplified.length >= 3 ? simplified : rawPts

        // Create the polygon
        const polygon = L.polygon(latlngs, {
          color: '#e74c3c',
          weight: 2,
          fillColor: '#e74c3c',
          fillOpacity: 0.2,
        }).addTo(map)

        pendingPolygonRef.current = polygon
        freehandPointsRef.current = []
        setZoneName('')
        setShowNamePrompt(true)
      }

      map.on('mousedown', onMouseDown)
      map.on('mousemove', onMouseMove)
      map.on('mouseup', onMouseUp)

      return () => {
        map.off('mousedown', onMouseDown)
        map.off('mousemove', onMouseMove)
        map.off('mouseup', onMouseUp)
        map.dragging.enable()
        map.doubleClickZoom.enable()
        container.style.cursor = ''
        container.classList.remove('freehand-active')
        isDrawingRef.current = false
        if (freehandPolylineRef.current) {
          map.removeLayer(freehandPolylineRef.current)
          freehandPolylineRef.current = null
        }
      }
    } else {
      map.dragging.enable()
      map.doubleClickZoom.enable()
      container.style.cursor = ''
      container.classList.remove('freehand-active')
    }
  }, [drawingMode])

  // ── Save pending zone ──
  const saveZone = useCallback(() => {
    const polygon = pendingPolygonRef.current
    if (!polygon || !zoneName.trim()) return

    const colorIndex = customZones.length % ZONE_COLORS.length
    const color = ZONE_COLORS[colorIndex]

    const geoJson = polygon.toGeoJSON()
    const zone = {
      id: `zone-${Date.now()}`,
      name: zoneName.trim(),
      type: 'polygon',
      color,
      geoJson,
      provinceId: currentProvince?.id || null,
      provinceName: currentProvince?.name_fa || null,
      createdAt: new Date().toISOString(),
    }

    // Remove the temporary polygon from map
    if (mapRef.current) mapRef.current.removeLayer(polygon)
    pendingPolygonRef.current = null

    onAddCustomZone(zone)
    setShowNamePrompt(false)
    setZoneName('')
  }, [zoneName, customZones, currentProvince, onAddCustomZone])

  const cancelZone = useCallback(() => {
    // Remove the pending polygon
    if (pendingPolygonRef.current && mapRef.current) {
      mapRef.current.removeLayer(pendingPolygonRef.current)
    }
    pendingPolygonRef.current = null
    setShowNamePrompt(false)
    setZoneName('')
  }, [])

  // ── Render custom zones on map ──
  useEffect(() => {
    const layer = customZonesLayerRef.current
    if (!layer) return
    layer.clearLayers()

    customZones.forEach(zone => {
      let zoneLayer
      if (zone.type === 'circle' && zone.geoJson?.center) {
        // Legacy support for old circle zones
        zoneLayer = L.circle(zone.geoJson.center, {
          radius: zone.geoJson.radius,
          color: zone.color,
          weight: 2,
          fillColor: zone.color,
          fillOpacity: 0.2,
        })
      } else if (zone.geoJson?.geometry) {
        zoneLayer = L.geoJSON(zone.geoJson, {
          style: () => ({
            color: zone.color,
            weight: 2,
            fillColor: zone.color,
            fillOpacity: 0.2,
          }),
        })
      }

      if (zoneLayer) {
        zoneLayer.bindTooltip(zone.name, {
          permanent: false,
          sticky: true,
          direction: 'top',
          className: 'zone-tooltip',
        })
        zoneLayer.on('click', () => {
          if (confirm(`آیا منطقه «${zone.name}» حذف شود؟`)) {
            onRemoveCustomZone(zone.id)
          }
        })
        layer.addLayer(zoneLayer)
      }
    })
  }, [customZones, onRemoveCustomZone])

  // ── Clear layers helper ──
  const clearLayers = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    if (provincesLayerRef.current) { map.removeLayer(provincesLayerRef.current); provincesLayerRef.current = null }
    if (countiesLayerRef.current) { map.removeLayer(countiesLayerRef.current); countiesLayerRef.current = null }
  }, [])

  // ── Show provinces ──
  const showProvinces = useCallback(async () => {
    const map = mapRef.current
    if (!map) return
    clearLayers()

    if (!provincesDataRef.current) {
      try {
        const res = await fetch('/data/provinces.geojson')
        if (!res.ok) throw new Error('Failed to load provinces')
        provincesDataRef.current = await res.json()
      } catch (err) {
        console.error('Error loading provinces:', err)
        return
      }
    }

    provincesLayerRef.current = L.geoJSON(provincesDataRef.current, {
      style: () => ({ ...PROVINCE_STYLE }),
      onEachFeature: (feature, layer) => {
        const { name_fa, name_en, id } = feature.properties || {}
        if (!name_fa) return

        layer.on('mouseover', () => {
          layer.setStyle(PROVINCE_HOVER)
          layer.bringToFront()
          setHoverInfo({ title: name_fa, sub: name_en || '' })
        })

        layer.on('mouseout', () => {
          layer.setStyle(PROVINCE_STYLE)
          setHoverInfo(null)
        })

        layer.on('click', () => {
          onDrillInto({ id, name_fa, name_en: name_en || '' })
        })
      },
    }).addTo(map)

    map.fitBounds(provincesLayerRef.current.getBounds(), { padding: [20, 20] })
  }, [onDrillInto, clearLayers])

  // ── Show counties ──
  const showCounties = useCallback(async (province) => {
    const map = mapRef.current
    if (!map || !province) return
    clearLayers()

    if (!countiesCacheRef.current[province.id]) {
      try {
        const res = await fetch(`/data/counties/${province.id}.geojson`)
        if (!res.ok) throw new Error(`Failed to load counties for ${province.id}`)
        countiesCacheRef.current[province.id] = await res.json()
      } catch (err) {
        console.error('Error loading counties:', err)
        return
      }
    }

    const data = countiesCacheRef.current[province.id]

    countiesLayerRef.current = L.geoJSON(data, {
      style: (feature) => {
        const name = feature.properties?.name_fa
        if (!name) return { weight: 0, fillOpacity: 0 }  // hide empty features
        const key = `${province.id}::${name}`
        return selectedRef.current.has(key) ? { ...COUNTY_SELECTED } : { ...COUNTY_STYLE }
      },
      filter: (feature) => {
        // Only show features with a name
        return !!feature.properties?.name_fa
      },
      onEachFeature: (feature, layer) => {
        const { name_fa, name_en, province_fa } = feature.properties || {}
        if (!name_fa) return

        layer.on('mouseover', () => {
          const key = `${province.id}::${name_fa}`
          if (!selectedRef.current.has(key)) {
            layer.setStyle(COUNTY_HOVER)
          }
          layer.bringToFront()
          setHoverInfo({ title: name_fa, sub: name_en || '' })
        })

        layer.on('mouseout', () => {
          const key = `${province.id}::${name_fa}`
          layer.setStyle(selectedRef.current.has(key) ? COUNTY_SELECTED : COUNTY_STYLE)
          setHoverInfo(null)
        })

        layer.on('click', () => {
          onToggleCounty(province.id, province.name_fa, name_fa, name_en || '')
        })
      },
    }).addTo(map)

    map.fitBounds(countiesLayerRef.current.getBounds(), { padding: [30, 30] })
  }, [onToggleCounty, clearLayers])

  // ── React to view changes ──
  useEffect(() => {
    if (view === 'provinces') {
      showProvinces()
    } else if (view === 'counties' && currentProvince) {
      showCounties(currentProvince)
    }
  }, [view, currentProvince, showProvinces, showCounties])

  // ── Update county styles on selection change ──
  useEffect(() => {
    if (view !== 'counties' || !countiesLayerRef.current || !currentProvince) return
    countiesLayerRef.current.eachLayer(layer => {
      if (!layer.feature?.properties?.name_fa) return
      const key = `${currentProvince.id}::${layer.feature.properties.name_fa}`
      layer.setStyle(selectedCounties.has(key) ? COUNTY_SELECTED : COUNTY_STYLE)
    })
  }, [selectedCounties, view, currentProvince])

  // ── Escape key ──
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        if (showNamePrompt) {
          cancelZone()
        } else if (drawingMode) {
          onSetDrawingMode(false)
        } else if (view !== 'provinces') {
          onGoBack()
        }
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [view, onGoBack, drawingMode, showNamePrompt, cancelZone, onSetDrawingMode])

  return (
    <div className="map-wrapper">
      <div ref={mapContainerRef} className="map-container" />

      {hoverInfo && !drawingMode && (
        <div className="hover-info">
          <h3>{hoverInfo.title}</h3>
          <p>{hoverInfo.sub}</p>
        </div>
      )}

      {drawingMode && !showNamePrompt && (
        <div className="freehand-hint">
          ✏️ با کلیک و کشیدن، محدوده دلخواه خود را رسم کنید
        </div>
      )}

      {/* Zone naming dialog */}
      {showNamePrompt && (
        <div className="zone-dialog-overlay">
          <div className="zone-dialog">
            <h3>نام منطقه سفارشی</h3>
            <input
              className="zone-dialog-input"
              type="text"
              placeholder="مثلاً: منطقه ۱ شیراز"
              value={zoneName}
              onChange={e => setZoneName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') saveZone()
                if (e.key === 'Escape') cancelZone()
              }}
              autoFocus
            />
            <div className="zone-dialog-actions">
              <button className="zone-dialog-btn primary" onClick={saveZone} disabled={!zoneName.trim()}>
                ذخیره
              </button>
              <button className="zone-dialog-btn" onClick={cancelZone}>
                انصراف
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
