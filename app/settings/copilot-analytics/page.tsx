'use client'

import { useEffect, useState } from 'react'
import { BarChart3, Loader2, Sparkles, Check, X, MessageSquare, Mail, BookOpen, Users, Zap, AlertCircle } from 'lucide-react'

type Period = '7d' | '30d' | '90d' | 'all'

interface Summary {
  total_generated: number
  total_sent: number
  total_dismissed: number
  total_pending: number
  accept_rate: number
  edit_rate: number
  rag_hit_rate: number
  pregenerated_rate: number
  kb_entries: number
}

interface Analytics {
  period: Period
  summary: Summary
  confidence: { high: number; medium: number; low: number; unknown: number }
  by_channel: Record<string, { generated: number; sent: number }>
  by_tone: Record<string, number>
  by_day: Array<{ date: string; generated: number; sent: number }>
  top_knowledge: Array<{ id: string; title: string | null; source_type: string; times_used: number }>
  per_user: Array<{ user_id: string; email: string | null; generated: number; sent: number; accept_rate: number }>
}

export default function CopilotAnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState<Period>('30d')

  const load = async (p: Period) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/copilot/analytics?period=${p}`)
      const json = await res.json()
      if (!res.ok || !json.success) {
        setError(json.error || 'Failed to load')
        setData(null)
      } else {
        setData(json)
      }
    } catch (e: any) {
      setError(e?.message || 'Network error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(period) }, [period])

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex items-start justify-between mb-6 gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 className="w-5 h-5 text-purple-600" />
            <h1 className="text-2xl font-semibold text-gray-900">Copilot Analytics</h1>
          </div>
          <p className="text-sm text-gray-500">
            Draft volume, acceptance, and retrieval signals for your workspace.
          </p>
        </div>
        <div className="flex gap-1 flex-shrink-0">
          {(['7d', '30d', '90d', 'all'] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 text-xs rounded-full border ${period === p ? 'bg-purple-600 text-white border-purple-600' : 'text-gray-600 border-gray-200 hover:border-purple-300'}`}
            >
              {p === 'all' ? 'All time' : `Last ${p}`}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : error ? (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      ) : !data ? null : (
        <div className="space-y-6">
          {/* Headline cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Drafts generated" value={data.summary.total_generated} icon={<Sparkles className="w-4 h-4" />} />
            <StatCard label="Sent to customers" value={data.summary.total_sent} icon={<Check className="w-4 h-4" />} tone="green" />
            <StatCard label="Dismissed" value={data.summary.total_dismissed} icon={<X className="w-4 h-4" />} tone="red" />
            <StatCard label="Pending review" value={data.summary.total_pending} icon={<AlertCircle className="w-4 h-4" />} tone="amber" />
          </div>

          {/* Rate cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <RateCard label="Accept rate" value={data.summary.accept_rate} tooltip="Approved or sent, out of all reviewed drafts" />
            <RateCard label="Edit rate" value={data.summary.edit_rate} tooltip="Share of sent drafts the agent edited before sending" />
            <RateCard label="RAG hit rate" value={data.summary.rag_hit_rate} tooltip="Drafts with at least one knowledge-base match" />
            <RateCard label="Pre-generated" value={data.summary.pregenerated_rate} tooltip="Drafts created in the background vs on-demand" />
          </div>

          {/* Daily chart */}
          {data.by_day.length > 0 && (
            <Card title="Daily volume" subtitle="Drafts generated (bar) + sent (green)">
              <DailyChart days={data.by_day} />
            </Card>
          )}

          {/* Two-column row: channel + tone + confidence */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card title="By channel" icon={<MessageSquare className="w-4 h-4 text-gray-500" />}>
              {Object.entries(data.by_channel).map(([ch, stats]) => (
                <MiniBar
                  key={ch}
                  icon={ch === 'email' ? <Mail className="w-3.5 h-3.5" /> : <MessageSquare className="w-3.5 h-3.5" />}
                  label={ch === 'email' ? 'Email' : 'WhatsApp'}
                  value={stats.generated}
                  sub={`${stats.sent} sent`}
                  max={Math.max(...Object.values(data.by_channel).map((s: any) => s.generated), 1)}
                />
              ))}
            </Card>

            <Card title="By tone">
              {Object.entries(data.by_tone).map(([tone, count]) => (
                <MiniBar
                  key={tone}
                  label={tone.charAt(0).toUpperCase() + tone.slice(1)}
                  value={count}
                  max={Math.max(...Object.values(data.by_tone), 1)}
                />
              ))}
              {Object.keys(data.by_tone).length === 0 && (
                <p className="text-xs text-gray-400">No data</p>
              )}
            </Card>

            <Card title="Confidence">
              {(['high', 'medium', 'low', 'unknown'] as const).map((c) => (
                <MiniBar
                  key={c}
                  label={c.charAt(0).toUpperCase() + c.slice(1)}
                  value={data.confidence[c]}
                  max={Math.max(...Object.values(data.confidence), 1)}
                  color={c === 'high' ? 'bg-green-500' : c === 'low' ? 'bg-amber-500' : 'bg-gray-400'}
                />
              ))}
            </Card>
          </div>

          {/* Top knowledge */}
          <Card
            title="Top-retrieved knowledge"
            subtitle={data.summary.kb_entries > 0 ? `${data.summary.kb_entries} active entries in your knowledge base` : 'Your knowledge base is empty'}
            icon={<BookOpen className="w-4 h-4 text-gray-500" />}
          >
            {data.top_knowledge.length === 0 ? (
              <p className="text-xs text-gray-400">No retrievals yet. The copilot hasn't pulled any entries in this period.</p>
            ) : (
              <div className="space-y-2">
                {data.top_knowledge.map((k) => (
                  <div key={k.id} className="flex items-center gap-3">
                    <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-full border ${typeColor(k.source_type)}`}>
                      {k.source_type.replace('kb_', '').replace('_', ' ')}
                    </span>
                    <span className="text-sm text-gray-800 truncate flex-1">{k.title || '(untitled)'}</span>
                    <span className="text-xs text-gray-500 flex-shrink-0">{k.times_used} uses</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Per-user */}
          {data.per_user.length > 0 && (
            <Card title="Per-user activity" icon={<Users className="w-4 h-4 text-gray-500" />}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-[11px] uppercase text-gray-400 tracking-wide">
                    <tr>
                      <th className="text-left py-1.5">User</th>
                      <th className="text-right py-1.5">Reviewed</th>
                      <th className="text-right py-1.5">Sent</th>
                      <th className="text-right py-1.5">Accept rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.per_user.map((u) => (
                      <tr key={u.user_id} className="border-t border-gray-100">
                        <td className="py-2 text-gray-800 truncate">{u.email || u.user_id.slice(0, 8) + '…'}</td>
                        <td className="py-2 text-right text-gray-700">{u.generated}</td>
                        <td className="py-2 text-right text-gray-700">{u.sent}</td>
                        <td className="py-2 text-right text-gray-700">{(u.accept_rate * 100).toFixed(0)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}

// ============================================
// UI helpers
// ============================================

function StatCard({ label, value, icon, tone }: { label: string; value: number; icon: React.ReactNode; tone?: 'green' | 'red' | 'amber' }) {
  const toneClass = tone === 'green' ? 'text-green-700 bg-green-50 border-green-100'
    : tone === 'red' ? 'text-red-700 bg-red-50 border-red-100'
    : tone === 'amber' ? 'text-amber-700 bg-amber-50 border-amber-100'
    : 'text-gray-700 bg-white border-gray-200'
  return (
    <div className={`rounded-lg border p-3 ${toneClass}`}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium">{label}</span>
        {icon}
      </div>
      <div className="text-2xl font-semibold tabular-nums">{value.toLocaleString()}</div>
    </div>
  )
}

function RateCard({ label, value, tooltip }: { label: string; value: number; tooltip: string }) {
  const pct = (value * 100).toFixed(0)
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3" title={tooltip}>
      <div className="text-xs text-gray-500 mb-1.5">{label}</div>
      <div className="text-2xl font-semibold text-gray-800 tabular-nums">{pct}%</div>
      <div className="h-1.5 bg-gray-100 rounded-full mt-2 overflow-hidden">
        <div className="h-full bg-purple-500 rounded-full" style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }} />
      </div>
    </div>
  )
}

function Card({ title, subtitle, icon, children }: { title: string; subtitle?: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-3">
        <div className="flex items-center gap-1.5">
          {icon}
          <h3 className="text-sm font-medium text-gray-900">{title}</h3>
        </div>
        {subtitle && <p className="text-[11px] text-gray-400 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

function MiniBar({ icon, label, value, max, sub, color = 'bg-purple-500' }: { icon?: React.ReactNode; label: string; value: number; max: number; sub?: string; color?: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0
  return (
    <div className="py-1.5">
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="flex items-center gap-1.5 text-gray-700">
          {icon}
          {label}
        </span>
        <span className="text-gray-500 tabular-nums">
          {value}
          {sub && <span className="text-gray-400 ml-1">· {sub}</span>}
        </span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function DailyChart({ days }: { days: Array<{ date: string; generated: number; sent: number }> }) {
  const max = Math.max(...days.map((d) => d.generated), 1)
  return (
    <div className="flex items-end gap-1 h-32">
      {days.map((d) => {
        const heightPct = (d.generated / max) * 100
        const sentPct = d.generated > 0 ? (d.sent / d.generated) * 100 : 0
        return (
          <div key={d.date} className="flex-1 min-w-0 flex flex-col items-center gap-1 group" title={`${d.date}: ${d.generated} generated, ${d.sent} sent`}>
            <div className="flex-1 w-full flex items-end">
              <div className="w-full bg-purple-200 rounded-t group-hover:bg-purple-300 relative" style={{ height: `${heightPct}%` }}>
                <div className="absolute bottom-0 left-0 right-0 bg-green-500 rounded-t" style={{ height: `${sentPct}%` }} />
              </div>
            </div>
            <span className="text-[9px] text-gray-400 truncate">{d.date.slice(5)}</span>
          </div>
        )
      })}
    </div>
  )
}

function typeColor(sourceType: string): string {
  if (sourceType.startsWith('kb_faq')) return 'text-blue-600 bg-blue-50 border-blue-200'
  if (sourceType.startsWith('kb_policy')) return 'text-red-600 bg-red-50 border-red-200'
  if (sourceType.startsWith('kb_tour')) return 'text-green-600 bg-green-50 border-green-200'
  if (sourceType === 'whatsapp_pair') return 'text-purple-600 bg-purple-50 border-purple-200'
  return 'text-gray-600 bg-gray-50 border-gray-200'
}
