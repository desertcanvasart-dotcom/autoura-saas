'use client'

import { useEffect, useState, useCallback } from 'react'
import { Search, User } from 'lucide-react'

export default function UsersListPage() {
  const [users, setUsers] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const params = search ? `?search=${encodeURIComponent(search)}` : ''
      const res = await fetch(`/api/super-admin/users${params}`)
      const data = await res.json()
      if (data.success) setUsers(data.data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => {
    const timer = setTimeout(fetchUsers, 300)
    return () => clearTimeout(timer)
  }, [fetchUsers])

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">All Users</h1>
        <p className="text-gray-400 text-sm mt-1">{users.length} users across all tenants</p>
      </div>

      <div className="relative max-w-md mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or email..."
          className="w-full pl-9 pr-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:border-blue-500 outline-none"
        />
      </div>

      <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left text-xs text-gray-400 font-medium px-5 py-3">User</th>
                <th className="text-left text-xs text-gray-400 font-medium px-5 py-3">Email</th>
                <th className="text-left text-xs text-gray-400 font-medium px-5 py-3">Tenant</th>
                <th className="text-left text-xs text-gray-400 font-medium px-5 py-3">Role</th>
                <th className="text-left text-xs text-gray-400 font-medium px-5 py-3">Status</th>
                <th className="text-left text-xs text-gray-400 font-medium px-5 py-3">Joined</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="border-b border-gray-700/50 hover:bg-gray-750">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-gray-500" />
                      <span className="text-sm text-white">{u.full_name || 'No name'}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-sm text-gray-400">{u.email}</td>
                  <td className="px-5 py-3 text-sm text-gray-400">{u.membership?.tenantName || '-'}</td>
                  <td className="px-5 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      u.membership?.role === 'owner' ? 'bg-amber-900/50 text-amber-400' :
                      u.membership?.role === 'admin' ? 'bg-red-900/50 text-red-400' :
                      u.membership?.role === 'manager' ? 'bg-blue-900/50 text-blue-400' :
                      'bg-gray-700 text-gray-400'
                    }`}>{u.membership?.role || u.role || '-'}</span>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`text-xs ${u.is_active ? 'text-green-400' : 'text-red-400'}`}>
                      {u.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-xs text-gray-500">{new Date(u.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-12 text-center text-gray-500">No users found</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
