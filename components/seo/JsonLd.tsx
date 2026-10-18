// Structured data for crawlers and AI assistants: one or more schema.org
// objects as <script type="application/ld+json">. Server-rendered, so the
// data is in the HTML a crawler receives. `<` is escaped so a value can
// never close the script tag.

type Schema = Record<string, unknown>

export default function JsonLd({ data }: { data: Schema | Schema[] }) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c')
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />
}
