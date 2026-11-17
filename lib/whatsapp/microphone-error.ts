// Pure: the browser's getUserMedia error → what the operator can do about it.
/** Why the microphone could not be opened, in words the operator can act on. */
export function microphoneErrorMessage(err: unknown): string {
  const name = err && typeof err === 'object' && 'name' in err ? String((err as { name: unknown }).name) : ''
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'The microphone is blocked for this site. Click the icon at the left of the address bar, allow the microphone, then try again.'
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No microphone was found. Plug one in (or check your system sound settings) and try again.'
    case 'NotReadableError':
    case 'AbortError':
      return 'The microphone is busy or could not start — close other apps using it (Zoom, WhatsApp desktop…) and try again.'
    default:
      return 'The microphone could not be opened. Check it is connected and allowed for this site, then try again.'
  }
}
