(function () {
  const sdk = window.eekoSDK
  if (!sdk) return

  const state = sdk.getState()
  const cfg = state.globalConfig || {}
  const target = Number(cfg.goalTarget || 100) || 100
  const variableName = cfg.variableName || ''

  const fill = document.getElementById('fill')
  const currentEl = document.getElementById('current')

  function render(current) {
    const pct = Math.max(0, Math.min(100, (current / target) * 100))
    if (fill) fill.style.width = pct + '%'
    if (currentEl) currentEl.textContent = String(current)
  }

  // Drive the bar from a tracked variable. `data.variable.value` is already
  // parsed server-side — no JSON.parse needed.
  sdk.on('variable_updated', (data) => {
    const v = data && data.variable
    if (!v) return
    if (variableName && v.name !== variableName) return
    const value = Number(v.value)
    if (!Number.isNaN(value)) render(value)
  })
})()
