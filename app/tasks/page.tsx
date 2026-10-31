'use client'

import { Suspense } from 'react'
import UrlTabs, { type UrlTab } from '@/components/nav/UrlTabs'
import TasksView from './_views/TasksView'
import FollowupsView from './_views/FollowupsView'

// Tasks and client follow-ups behind one link. They are different records
// (tasks: assigned to a team member, linked to a quote/itinerary/booking;
// client_followups: a reminder about one client, assigned to a login), so two
// lists, not one: folding follow-ups into tasks as a type needs a migration.
// Everyone sees both tabs; staff see only the tasks and follow-ups that are
// theirs or no one's (the database rule, migration 457).
const TABS: UrlTab[] = [
  { key: 'tasks', label: 'Tasks', roles: ['admin', 'manager', 'member'], render: () => <TasksView /> },
  { key: 'follow-up', label: 'Follow-ups', roles: ['admin', 'manager', 'member'], render: () => <FollowupsView /> },
]

export default function TasksPage() {
  return (
    <Suspense fallback={null}>
      <UrlTabs tabs={TABS} param="type" label="Tasks" />
    </Suspense>
  )
}
