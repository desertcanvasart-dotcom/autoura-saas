// GET /api/whatsapp/media/[id] — short-lived signed URL for inbound WhatsApp
// media, where [id] is the whatsapp_messages row id.
//
// ============================================================================
// WHY THIS ROUTE EXISTS
// ============================================================================
// The webhook created the whatsapp-media bucket with `public: true` and stored
// `getPublicUrl()` on the message, which /conversations rendered as a link.
// A public Supabase bucket serves every object to anyone holding the URL — no
// session, no tenant check.
//
// What lives in that bucket is the CUSTOMER'S file: whatever a traveller sent
// into a WhatsApp thread, which in this product routinely means a passport
// page for a visa application or a payment receipt. And objects are written to
// `inbound/<message_sid>.<ext>` — one flat namespace with NO tenant prefix, so
// unlike the supplier-invoice case there is not even a tenant boundary encoded
// in the path.
//
// Permission is therefore re-derived here on every view: the message row is
// read with the CALLER'S RLS-bound client, so a caller who cannot see the
// message cannot mint a URL for its attachment. The service-role client only
// signs a path that check already authorised — the same split as
// lib/sender-tenant and the supplier-invoice document route.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/supabase-server'

const MEDIA_BUCKET = 'whatsapp-media'

// Long enough to open an image, short enough that a leaked URL is worthless by
// the time it is pasted anywhere.
const SIGNED_URL_TTL_SECONDS = 60

// Lazy service-role client: constructing at module scope crashes `next build`
// ("Collecting page data" evaluates every route module) when env vars aren't
// present at build time. Matches lib/supabase-server's build-safe convention.
let _admin: ReturnType<typeof createClient> | null = null
function admin() {
  if (!_admin) {
    _admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _admin
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth()
    if (auth.error || !auth.supabase) {
      return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: auth.status })
    }
    const { supabase } = auth
    const { id } = await params

    // THE permission check. RLS-bound client: a message the caller may not
    // read comes back empty, and this 404s before anything is signed.
    const { data: message, error } = await supabase
      .from('whatsapp_messages')
      .select('media_storage_path')
      .eq('id', id)
      .single()

    if (error || !message) {
      return NextResponse.json({ success: false, error: 'Message not found' }, { status: 404 })
    }

    const storagePath = message.media_storage_path
    if (!storagePath) {
      // Either no attachment, or one hosted elsewhere (Twilio's own media URL,
      // an outbound PDF) — those are in media_url and are not ours to sign.
      return NextResponse.json({ success: false, error: 'No stored attachment' }, { status: 404 })
    }

    const { data: signed, error: signError } = await admin()
      .storage.from(MEDIA_BUCKET)
      .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS)

    if (signError || !signed?.signedUrl) {
      console.error('whatsapp media sign error:', signError?.message)
      return NextResponse.json({ success: false, error: 'Failed to open attachment' }, { status: 500 })
    }

    // Redirect rather than returning the URL: the browser follows it straight
    // to the file and the signed URL never has to live in page state.
    return NextResponse.redirect(signed.signedUrl)
  } catch (e: any) {
    console.error('whatsapp media route error:', e?.message)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
