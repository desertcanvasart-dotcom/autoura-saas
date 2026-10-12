import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Tip } from '../layout'
import { DocPager } from '../pager'
import { VOCABULARY_GROUPS, VOCABULARY_KIND_INFO, SUPPLIER_BEHAVIORS } from '@/lib/vocabulary'

const KINDS = Object.values(VOCABULARY_KIND_INFO)

export default function VocabularyPage() {
  return (
    <div>
      <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <Link href="/docs" className="hover:text-primary-600 transition-colors">Docs</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Your Vocabulary</span>
      </nav>

      <h1 className="text-3xl font-bold text-gray-900 mb-4">Your Vocabulary</h1>
      <p className="text-gray-600 mb-8">
        The choices in your dropdowns &mdash; service tiers, supplier types, vehicles, meal types, guide languages and the
        rest &mdash; are your own lists. <strong>Settings &rarr; Your Vocabulary</strong> (admins) is where you rename,
        add, hide, reorder and remove them. They start from a set of Egypt defaults; each company keeps its own.
      </p>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">The lists</h2>
        <p className="text-gray-600 mb-3">{KINDS.length} lists in {VOCABULARY_GROUPS.length} groups:</p>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          {VOCABULARY_GROUPS.map(group => (
            <li key={group}>
              <strong>{group}</strong> &mdash; {KINDS.filter(k => k.group === group).map(k => k.title).join(', ')}
            </li>
          ))}
        </ul>
        <p className="text-gray-600 mt-3">Each list on the screen says what it is for and where you will meet it.</p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Changing a list</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Rename</strong> &mdash; changes the word everyone sees. Records filed under it keep it: they hold the entry&rsquo;s key, which does not change.</li>
          <li><strong>Add</strong> &mdash; a new entry. Two entries in one list cannot share a label.</li>
          <li><strong>Hide</strong> &mdash; takes it out of the dropdowns; records already using it keep it. Hiding is the safe way to retire a word.</li>
          <li><strong>Reorder</strong> &mdash; the arrows set the order of the dropdown. For service tiers the order is the ladder from lowest to highest, hidden tiers included.</li>
          <li><strong>Delete</strong> &mdash; removes it. If rates, suppliers or packages still use a tier, supplier type or vehicle, you are told which and asked to confirm; those records are left holding a word the list no longer has.</li>
          <li><strong>Reset to defaults</strong> &mdash; replaces one list with the Egypt defaults. It is not an undo: what you added or renamed in that list is gone. Other lists are untouched.</li>
        </ul>
        <p className="text-gray-600 mt-3">
          Some lists cannot drop below a minimum (a quote needs at least two service tiers; you need at least one supplier type).
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Lists with extra settings</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700">
          <li><strong>Supplier types</strong> &mdash; each one behaves like a built-in kind, which decides its tabs and which rate forms pick it: {SUPPLIER_BEHAVIORS.map(b => b.label).join(', ')}.</li>
          <li><strong>Vehicle types</strong> &mdash; a passenger range (e.g. 1&ndash;4 pax), which picks the vehicle for a group size.</li>
          <li><strong>Transport service types</strong> &mdash; whether the service runs to a destination (a transfer from A to B) or not.</li>
          <li><strong>Airlines</strong> &mdash; the IATA code (MS for EgyptAir), which fills a flight rate&rsquo;s service code.</li>
        </ul>
        <Tip>
          Your lists are only words for your own records. They do not translate what clients see, and they do not rename the app&rsquo;s own menus.
        </Tip>
      </section>

      <DocPager href="/docs/vocabulary" />
    </div>
  )
}
