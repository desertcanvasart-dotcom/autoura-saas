import { NextResponse } from 'next/server'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

// The Noto Sans JP files (assets/fonts) for jsPDF documents built in the
// browser (lib/pdf/jspdf-font-browser). Only these two names are served;
// behind the session gate like every /api route.
const FILES = new Set(['NotoSansJP-Regular.ttf', 'NotoSansJP-Bold.ttf'])

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params
  if (!FILES.has(file)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  try {
    const bytes = await readFile(join(process.cwd(), 'assets', 'fonts', file))
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': 'font/ttf',
        'Cache-Control': 'private, max-age=604800, immutable',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Font unavailable' }, { status: 404 })
  }
}
