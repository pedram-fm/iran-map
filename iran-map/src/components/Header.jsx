export default function Header({
  sidebarOpen,
  onToggleSidebar,
  onClearAll,
  view,
  onGoBack,
  currentProvince,
  selectionCount,
  drawingMode,
  onToggleDrawing,
}) {
  return (
    <div className="header">
      <div className="header-right">
        {view === 'counties' && (
          <button className="btn btn-back" onClick={onGoBack}>
            → بازگشت
          </button>
        )}
        <h1>
          {view === 'provinces'
            ? '🇮🇷 نقشه ایران'
            : `نقشه ${currentProvince?.name_fa || ''}`}
        </h1>
      </div>

      <div className="header-left">
        {view === 'counties' && (
          <button
            className={`btn ${drawingMode ? 'btn-active' : ''}`}
            onClick={onToggleDrawing}
            title="رسم محدوده سفارشی"
          >
            ✏️ {drawingMode ? 'پایان رسم' : 'رسم محدوده'}
          </button>
        )}
        {selectionCount > 0 && (
          <span style={{ fontSize: '0.82rem', opacity: 0.9 }}>
            {selectionCount} شهرستان انتخاب شده
          </span>
        )}
        <button className="btn" onClick={onToggleSidebar}>
          {sidebarOpen ? '✕ بستن پنل' : '☰ پنل'}
        </button>
        {selectionCount > 0 && (
          <button className="btn btn-danger" onClick={onClearAll}>
            پاک کردن همه
          </button>
        )}
      </div>
    </div>
  )
}
