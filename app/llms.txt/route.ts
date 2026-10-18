// /llms.txt — what Autoura is, for AI assistants (lib/seo/llms.ts).
import { llmsTxt } from '@/lib/seo/llms'

export const dynamic = 'force-static'

export function GET() {
  return new Response(llmsTxt(), {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  })
}
