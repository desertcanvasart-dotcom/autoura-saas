// /llms-full.txt — the summary plus every docs page and post (lib/seo/llms.ts).
import { listPublishedPosts } from '@/lib/blog/posts'
import { llmsFullTxt } from '@/lib/seo/llms'

// Rebuilt hourly, like the sitemap, so a new post is listed without a deploy.
export const revalidate = 3600

export async function GET() {
  const posts = await listPublishedPosts({ limit: 500 })
  return new Response(llmsFullTxt(posts), {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  })
}
