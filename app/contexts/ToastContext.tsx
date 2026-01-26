'use client'

// Simple toast utility - logs to console
// TODO: Replace with proper toast library (react-hot-toast or sonner)

export const showToast = (
  message: string,
  type: 'success' | 'error' | 'warning' | 'info' = 'success'
) => {
  const emoji = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️'
  }[type]

  console.log(`${emoji} [${type.toUpperCase()}] ${message}`)

  // Also show browser alert for errors so they're visible
  if (type === 'error') {
    alert(`Error: ${message}`)
  }
}

export default showToast
