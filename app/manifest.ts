import type { MetadataRoute } from 'next'

// PWA manifest — makes the app installable, landing on /ops: the phone-first
// surface for the person coordinating trips from the road. Next serves this
// at /manifest.webmanifest and injects the <link> tag site-wide; the path is
// on the middleware public allowlist (a manifest behind a login redirect is
// no manifest at all).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Autoura Ops',
    short_name: 'Ops',
    description: "Today's trips and their latest checkpoints — the on-the-ground view.",
    start_url: '/ops',
    display: 'standalone',
    background_color: '#111827',
    theme_color: '#111827',
    icons: [
      { src: '/icons/ops-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/ops-512.png', sizes: '512x512', type: 'image/png' },
    ],
  }
}
