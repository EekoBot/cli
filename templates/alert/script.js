(function () {
  const sdk = window.eekoSDK
  if (!sdk) return

  const el = document.getElementById('alert')
  const state = sdk.getState()
  const duration = Number((state.globalConfig && state.globalConfig.durationMs) || 5000)
  let hideTimer = null

  function show() {
    if (!el) return
    el.classList.add('show')
    if (hideTimer) clearTimeout(hideTimer)
    hideTimer = setTimeout(() => el.classList.remove('show'), duration)
  }

  // {username} / {message} in the markup are variant tokens — the SDK fills
  // them from the trigger data before this fires. Here we just animate.
  sdk.on('component_trigger', () => show())
})()
