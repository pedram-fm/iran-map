import { useState, useCallback, useEffect } from 'react'
import Header from './components/Header'
import Sidebar from './components/Sidebar'
import MapView from './components/MapView'
import ToastContainer from './components/ToastContainer'

function loadCustomZones() {
  try {
    const raw = localStorage.getItem('iran-map-custom-zones')
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

export default function App() {
  const [view, setView] = useState('provinces')   // 'provinces' | 'counties'
  const [currentProvince, setCurrentProvince] = useState(null)
  const [selectedCounties, setSelectedCounties] = useState(new Map())
  const [customZones, setCustomZones] = useState(loadCustomZones)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [toasts, setToasts] = useState([])
  const [drawingMode, setDrawingMode] = useState(false)

  useEffect(() => {
    localStorage.setItem('iran-map-custom-zones', JSON.stringify(customZones))
  }, [customZones])

  const showToast = useCallback((message) => {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev, { id, message }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 2800)
  }, [])

  const drillInto = useCallback((province) => {
    setCurrentProvince(province)
    setView('counties')
    setDrawingMode(false)
    showToast(`استان ${province.name_fa}`)
  }, [showToast])

  const goBack = useCallback(() => {
    setView('provinces')
    setCurrentProvince(null)
    setDrawingMode(false)
  }, [])

  const toggleCounty = useCallback((provinceId, provinceFa, countyFa, countyEn) => {
    const key = `${provinceId}::${countyFa}`
    setSelectedCounties(prev => {
      const next = new Map(prev)
      if (next.has(key)) {
        next.delete(key)
        showToast(`${countyFa} حذف شد`)
      } else {
        next.set(key, { province_id: provinceId, province_fa: provinceFa, county_fa: countyFa, county_en: countyEn })
        showToast(`${countyFa} انتخاب شد ✓`)
      }
      return next
    })
  }, [showToast])

  const removeSelection = useCallback((key) => {
    setSelectedCounties(prev => {
      const next = new Map(prev)
      const item = next.get(key)
      if (item) {
        next.delete(key)
        showToast(`${item.county_fa} حذف شد`)
      }
      return next
    })
  }, [showToast])

  const clearAll = useCallback(() => {
    setSelectedCounties(new Map())
    showToast('همه انتخاب‌ها پاک شدند')
  }, [showToast])

  const addCustomZone = useCallback((zone) => {
    setCustomZones(prev => [...prev, zone])
    showToast(`منطقه «${zone.name}» اضافه شد ✓`)
  }, [showToast])

  const removeCustomZone = useCallback((zoneId) => {
    setCustomZones(prev => {
      const zone = prev.find(z => z.id === zoneId)
      if (zone) showToast(`منطقه «${zone.name}» حذف شد`)
      return prev.filter(z => z.id !== zoneId)
    })
  }, [showToast])

  const clearCustomZones = useCallback(() => {
    setCustomZones([])
    showToast('همه مناطق سفارشی پاک شدند')
  }, [showToast])

  return (
    <>
      <Header
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen(s => !s)}
        onClearAll={clearAll}
        view={view}
        onGoBack={goBack}
        currentProvince={currentProvince}
        selectionCount={selectedCounties.size}
        drawingMode={drawingMode}
        onToggleDrawing={() => setDrawingMode(d => !d)}
      />

      <div className="main-layout">
        <Sidebar
          open={sidebarOpen}
          view={view}
          currentProvince={currentProvince}
          selectedCounties={selectedCounties}
          customZones={customZones}
          onDrillInto={drillInto}
          onGoBack={goBack}
          onToggleCounty={toggleCounty}
          onRemoveSelection={removeSelection}
          onRemoveCustomZone={removeCustomZone}
          onClearCustomZones={clearCustomZones}
        />

        <MapView
          view={view}
          currentProvince={currentProvince}
          selectedCounties={selectedCounties}
          customZones={customZones}
          drawingMode={drawingMode}
          onDrillInto={drillInto}
          onToggleCounty={toggleCounty}
          onGoBack={goBack}
          onAddCustomZone={addCustomZone}
          onRemoveCustomZone={removeCustomZone}
          sidebarOpen={sidebarOpen}
          onSetDrawingMode={setDrawingMode}
        />
      </div>

      <ToastContainer toasts={toasts} />
    </>
  )
}
