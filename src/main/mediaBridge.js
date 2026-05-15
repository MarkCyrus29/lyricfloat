/**
 * Platform-agnostic media bridge.
 * Routes to the correct OS-specific implementation.
 */

let _start, _stop

if (process.platform === 'darwin') {
  // macOS — AppleScript-based detection
  const mac = await import('./macMediaBridge.js')
  _start = mac.startMediaBridge
  _stop = mac.stopMediaBridge
} else {
  // Windows — PowerShell SMTC bridge
  const win = await import('./powerShellBridge.js')
  _start = win.startSMTCBridge
  _stop = win.stopSMTCBridge
}

export const startMediaBridge = _start
export const stopMediaBridge = _stop
