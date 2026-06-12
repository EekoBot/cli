// Widget script — runs inside the sandboxed iframe.
// You receive events through window.eekoSDK. Fill in the handler bodies below;
// keep these window.eekoSDK.on(...) subscriptions — they are the only way in.
// Full surface: window.eekoSDK.on(type, handler), .off(type, handler),
// .getState(), .isReady(). There is no window.widget and no .onShow/.onHide.
;(function () {
  var sdk = window.eekoSDK
  if (!sdk) return

  // Fired when an automation triggers this widget (alerts). `data` is the flat
  // payload of canonical data points: data.username, data.displayName,
  // data.message, data.amount, data.formattedAmount, data.tier, data.giftCount,
  // data.months, data.type, ... (call list_trigger_types for the exact set).
  sdk.on('component_trigger', function (data) {
    // TODO: render the alert from `data`.
  })

  // Fired when the alert should dismiss / animate out.
  sdk.on('component_dismiss', function () {
    // TODO: hide and clean up.
  })

  // Other available events — uncomment the ones this widget needs:
  // sdk.on('chat_message', function (msg) {})        // chat overlays
  // sdk.on('variable_updated', function (v) {})      // goal bars / counters
  // sdk.on('component_update', function (data) {})   // live config/data change
})()
