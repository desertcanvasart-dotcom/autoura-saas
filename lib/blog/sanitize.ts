// Blog post HTML, made safe to render.
//
// Run on save (the API stores only clean HTML) and again on render, so a
// row written some other way still cannot inject script. Unlike
// lib/sanitize-html.ts this works on the server too (isomorphic-dompurify):
// posts are server-rendered for search engines.
//
// Allowed: the formatting the editor produces — headings, paragraphs, lists,
// quotes, code, links, images. Not allowed: script, style, iframes, forms,
// inline styles and event handlers; links and images only over http(s) (or
// site-relative), never javascript: or data:.

import DOMPurify from 'isomorphic-dompurify'

const ALLOWED_TAGS = [
  'p', 'br', 'hr', 'h2', 'h3', 'h4', 'strong', 'b', 'em', 'i', 'u', 's', 'code', 'pre',
  'blockquote', 'ul', 'ol', 'li', 'a', 'img', 'figure', 'figcaption',
]
const ALLOWED_ATTR = ['href', 'src', 'alt', 'title', 'target', 'rel']
const SAFE_URL = /^(?:https?:\/\/|\/(?!\/)|#)/i

let hooked = false
function hook() {
  if (hooked) return
  hooked = true
  DOMPurify.addHook('afterSanitizeAttributes', node => {
    for (const attr of ['href', 'src']) {
      const v = node.getAttribute?.(attr)
      if (v != null && !SAFE_URL.test(v.trim())) node.removeAttribute(attr)
    }
    if (node.tagName === 'A') {
      // Links out of the post open in a new tab, and never hand it our window.
      const href = node.getAttribute('href') ?? ''
      if (/^https?:\/\//i.test(href)) {
        node.setAttribute('target', '_blank')
        node.setAttribute('rel', 'noopener noreferrer')
      } else {
        node.removeAttribute('target')
        node.removeAttribute('rel')
      }
    }
    if (node.tagName === 'IMG' && !node.getAttribute('src')) node.remove()
  })
}

export function sanitizeBlogHtml(html: string | null | undefined): string {
  if (!html) return ''
  hook()
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR, ALLOW_DATA_ATTR: false })
}
