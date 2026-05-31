(function () {
  const sdk = window.eekoSDK
  if (!sdk) return

  const chat = document.getElementById('chat')
  const state = sdk.getState()
  const max = Number((state.globalConfig && state.globalConfig.maxMessages) || 8)

  function esc(s) {
    const d = document.createElement('div')
    d.textContent = String(s == null ? '' : s)
    return d.innerHTML
  }

  sdk.on('chat_message', (data) => {
    if (!chat) return
    const name = (data.user && (data.user.displayName || data.user.username)) || 'viewer'
    const text = (data.message && data.message.text) || ''
    const row = document.createElement('div')
    row.className = 'msg'
    row.innerHTML = '<span class="name">' + esc(name) + '</span>' + esc(text)
    chat.appendChild(row)
    while (chat.children.length > max) chat.removeChild(chat.firstChild)
  })
})()
