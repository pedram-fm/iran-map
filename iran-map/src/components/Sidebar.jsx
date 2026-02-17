import { useState, useEffect, useMemo } from 'react'

export default function Sidebar({
  open,
  view,
  currentProvince,
  selectedCounties,
  customZones,
  onDrillInto,
  onGoBack,
  onToggleCounty,
  onRemoveSelection,
  onRemoveCustomZone,
  onClearCustomZones,
}) {
  const [search, setSearch] = useState('')
  const [provinces, setProvinces] = useState([])
  const [counties, setCounties] = useState([])

  useEffect(() => { setSearch('') }, [view, currentProvince?.id])

  // Load provinces list
  useEffect(() => {
    fetch('/data/provinces.geojson')
      .then(r => r.json())
      .then(data => {
        const list = data.features
          .map(f => f.properties)
          .filter(p => p.name_fa && p.id)
          .sort((a, b) => a.name_fa.localeCompare(b.name_fa, 'fa'))
        setProvinces(list)
      })
      .catch(() => {})
  }, [])

  // Load counties when province changes
  useEffect(() => {
    if (view === 'counties' && currentProvince) {
      fetch(`/data/counties/${currentProvince.id}.geojson`)
        .then(r => r.json())
        .then(data => {
          const list = data.features
            .map(f => f.properties)
            .filter(c => c.name_fa)
            .sort((a, b) => a.name_fa.localeCompare(b.name_fa, 'fa'))
          setCounties(list)
        })
        .catch(() => setCounties([]))
    }
  }, [view, currentProvince])

  const filteredProvinces = useMemo(() => {
    if (!search) return provinces
    return provinces.filter(
      p => p.name_fa.includes(search) || (p.name_en && p.name_en.toLowerCase().includes(search.toLowerCase()))
    )
  }, [provinces, search])

  const filteredCounties = useMemo(() => {
    if (!search) return counties
    return counties.filter(
      c => c.name_fa.includes(search) || (c.name_en && c.name_en.toLowerCase().includes(search.toLowerCase()))
    )
  }, [counties, search])

  const getProvinceSelectionCount = (provinceId) => {
    let count = 0
    for (const [, val] of selectedCounties) {
      if (val.province_id === provinceId) count++
    }
    return count
  }

  const selectionGroups = useMemo(() => {
    const groups = {}
    for (const [key, val] of selectedCounties) {
      if (!groups[val.province_fa]) groups[val.province_fa] = []
      groups[val.province_fa].push({ key, ...val })
    }
    return groups
  }, [selectedCounties])

  // Custom zones for current province
  const contextZones = useMemo(() => {
    if (view === 'counties' && currentProvince) {
      return customZones.filter(z => z.provinceId === currentProvince.id)
    }
    return customZones
  }, [customZones, view, currentProvince])

  return (
    <div className={`sidebar ${open ? '' : 'collapsed'}`}>
      {/* Title */}
      <div className="sidebar-section" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="sidebar-title">
          {view === 'provinces' ? 'استان‌ها' : `شهرستان‌های ${currentProvince?.name_fa || ''}`}
        </span>
        <span className="sidebar-count">
          {view === 'provinces'
            ? `${filteredProvinces.length} استان`
            : `${filteredCounties.length} شهرستان`}
        </span>
      </div>

      {/* Breadcrumb */}
      <div className="breadcrumb">
        <button className="breadcrumb-link" onClick={onGoBack} disabled={view === 'provinces'}>
          🏠 ایران
        </button>
        {view === 'counties' && (
          <>
            <span className="breadcrumb-sep">‹</span>
            <span>{currentProvince?.name_fa}</span>
          </>
        )}
      </div>

      {/* Search */}
      <div className="search-box">
        <input
          className="search-input"
          type="text"
          placeholder={view === 'provinces' ? 'جستجوی استان...' : 'جستجوی شهرستان...'}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* List */}
      <div className="list-container">
        {view === 'provinces' ? (
          filteredProvinces.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">🔍</div>
              نتیجه‌ای یافت نشد
            </div>
          ) : (
            filteredProvinces.map(p => {
              const count = getProvinceSelectionCount(p.id)
              return (
                <div key={p.id} className="list-item" onClick={() => onDrillInto(p)}>
                  <div className="list-item-info">
                    <div className="list-item-name">
                      {p.name_fa}
                      {count > 0 && <span className="list-item-badge">{count}</span>}
                    </div>
                    <div className="list-item-sub">{p.name_en}</div>
                  </div>
                  <div className="list-item-arrow">◀</div>
                </div>
              )
            })
          )
        ) : (
          filteredCounties.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">🔍</div>
              نتیجه‌ای یافت نشد
            </div>
          ) : (
            filteredCounties.map(c => {
              const key = `${currentProvince?.id}::${c.name_fa}`
              const isSelected = selectedCounties.has(key)
              return (
                <div
                  key={key}
                  className={`list-item ${isSelected ? 'selected' : ''}`}
                  onClick={() => onToggleCounty(currentProvince.id, currentProvince.name_fa, c.name_fa, c.name_en || '')}
                >
                  <div className="list-item-checkbox">✓</div>
                  <div className="list-item-info">
                    <div className="list-item-name">{c.name_fa}</div>
                    <div className="list-item-sub">{c.name_en || ''}</div>
                  </div>
                </div>
              )
            })
          )
        )}
      </div>

      {/* Custom Zones */}
      {view === 'counties' && contextZones.length > 0 && (
        <div className="zones-section">
          <div className="sidebar-section" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="sidebar-title">مناطق سفارشی ({contextZones.length})</span>
            <button className="btn-clear-zones-sm" onClick={onClearCustomZones}>پاک کردن</button>
          </div>
          {contextZones.map(z => (
            <div key={z.id} className="list-item zone-item">
              <div className="zone-color" style={{ background: z.color || '#3498db' }} />
              <div className="list-item-info">
                <div className="list-item-name">{z.name}</div>
                <div className="list-item-sub">
                  {z.type === 'circle' ? 'دایره' : z.type === 'rectangle' ? 'مستطیل' : 'چندضلعی'}
                </div>
              </div>
              <button className="zone-remove-btn" onClick={() => onRemoveCustomZone(z.id)} title="حذف">✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Selection Summary */}
      {selectedCounties.size > 0 && (
        <div className="selection-summary">
          <div className="summary-title">
            انتخاب‌شده‌ها ({selectedCounties.size})
          </div>
          {Object.entries(selectionGroups).map(([prov, items]) => (
            <div key={prov} className="summary-group">
              <div className="summary-group-title">{prov}:</div>
              <div className="chips">
                {items.map(item => (
                  <span key={item.key} className="chip">
                    {item.county_fa}
                    <button
                      className="chip-remove"
                      onClick={e => { e.stopPropagation(); onRemoveSelection(item.key) }}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
