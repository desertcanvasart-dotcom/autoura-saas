'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/app/contexts/AuthContext'
import { showToast } from '@/app/contexts/ToastContext'
import { 
  User, 
  Mail, 
  Phone, 
  Building2, 
  MapPin, 
  Globe, 
  Lock,
  Camera,
  Save,
  ArrowLeft
} from 'lucide-react'

// ============================================
// INTERFACES
// ============================================

interface UserProfile {
  name: string
  email: string
  phone: string
  company: string
  role: string
  address: string
  city: string
  country: string
  website: string
  avatar: string
}

interface PasswordData {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function ProfilePage() {
  const { profile } = useAuth()
  const [activeTab, setActiveTab] = useState<'profile' | 'password'>('profile')
  const [loading, setLoading] = useState(false)
  const [profileData, setProfileData] = useState<UserProfile>({
    name: profile?.full_name || 'User',
    email: profile?.email || '',
    phone: profile?.phone || '',
    company: profile?.company_name || '',
    role: profile?.role || '',
    address: '',
    city: '',
    country: '',
    website: '',
    avatar: ''
  })

  const [passwordData, setPasswordData] = useState<PasswordData>({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })

  const handleProfileChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setProfileData(prev => ({ ...prev, [name]: value }))
  }

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setPasswordData(prev => ({ ...prev, [name]: value }))
  }

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        setProfileData(prev => ({ ...prev, avatar: reader.result as string }))
      }
      reader.readAsDataURL(file)
    }
  }

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setTimeout(() => {
      showToast('success', 'Profile updated successfully!')
      setLoading(false)
    }, 1000)
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      showToast('error', 'New passwords do not match!')
      return
    }
    if (passwordData.newPassword.length < 8) {
      showToast('error', 'Password must be at least 8 characters long!')
      return
    }
    setLoading(true)
    setTimeout(() => {
      showToast('success', 'Password changed successfully!')
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' })
      setLoading(false)
    }, 1000)
  }

  return (
    <div className="min-h-screen bg-gray-50/50">
      {/* CLEAN HEADER */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold text-gray-900">Profile Settings</h1>
              <p className="text-xs text-gray-500 mt-0.5">Manage your account and preferences</p>
            </div>
            <Link 
              href="/" 
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-md hover:bg-gray-50 hover:border-gray-300 transition-colors shadow-sm"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Dashboard
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="p-6">
        <div className="max-w-4xl mx-auto space-y-4">
          
          {/* PROFILE CARD */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
            {/* Avatar Section */}
            <div className="bg-gray-50 border-b border-gray-200 p-5">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="w-20 h-20 rounded-full bg-white border-2 border-gray-200 shadow-sm p-0.5">
                    {profileData.avatar ? (
                      <img src={profileData.avatar} alt="Profile" className="w-full h-full rounded-full object-cover" />
                    ) : (
                      <div className="w-full h-full rounded-full bg-gray-100 flex items-center justify-center">
                        <User className="w-10 h-10 text-gray-400" />
                      </div>
                    )}
                  </div>
                  <label 
                    htmlFor="avatar-upload"
                    className="absolute -bottom-1 -right-1 w-7 h-7 bg-white rounded-full flex items-center justify-center cursor-pointer shadow-md hover:bg-gray-50 transition-colors border border-gray-200"
                  >
                    <Camera className="w-3.5 h-3.5 text-primary-600" />
                    <input id="avatar-upload" type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
                  </label>
                </div>
                
                <div>
                  <h2 className="text-base font-semibold text-gray-900">{profileData.name}</h2>
                  <p className="text-xs text-primary-600 font-medium">{profileData.role}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{profileData.company}</p>
                </div>
              </div>
            </div>

            {/* COMPACT TABS */}
            <div className="border-b border-gray-200">
              <div className="flex">
                <button
                  onClick={() => setActiveTab('profile')}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-all ${
                    activeTab === 'profile'
                      ? 'text-primary-600 border-b-2 border-primary-600'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <User className="w-3.5 h-3.5" />
                  Profile Information
                </button>
                <button
                  onClick={() => setActiveTab('password')}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-all ${
                    activeTab === 'password'
                      ? 'text-primary-600 border-b-2 border-primary-600'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <Lock className="w-3.5 h-3.5" />
                  Change Password
                </button>
              </div>
            </div>

            {/* TAB CONTENT */}
            <div className="p-5">
              {activeTab === 'profile' && (
                <form onSubmit={handleSaveProfile}>
                  <div className="space-y-5">
                    {/* Personal Information */}
                    <div>
                      <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-1.5">
                        <User className="w-4 h-4 text-primary-600" />
                        Personal Information
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Full Name *</label>
                          <input
                            type="text"
                            name="name"
                            value={profileData.name}
                            onChange={handleProfileChange}
                            required
                            className="w-full h-9 px-3 text-sm border border-gray-200 rounded-md shadow-sm focus:ring-1 focus:ring-primary-500 focus:border-primary-500 outline-none"
                          />
                        </div>
                        <div>
                          <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-1">
                            <Mail className="w-3.5 h-3.5" />
                            Email Address *
                          </label>
                          <input
                            type="email"
                            name="email"
                            value={profileData.email}
                            onChange={handleProfileChange}
                            required
                            className="w-full h-9 px-3 text-sm border border-gray-200 rounded-md shadow-sm focus:ring-1 focus:ring-primary-500 focus:border-primary-500 outline-none"
                          />
                        </div>
                        <div> npm run dev
                          <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-1">
                            <Phone className="w-3.5 h-3.5" />
                            Phone Number
                          </label>
                          <input
                            type="tel"
                            name="phone"
                            value={profileData.phone}
                            onChange={handleProfileChange}
                            className="w-full h-9 px-3 text-sm border border-gray-200 rounded-md shadow-sm focus:ring-1 focus:ring-primary-500 focus:border-primary-500 outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
                          <input
                            type="text"
                            name="role"
                            value={profileData.role}
                            onChange={handleProfileChange}
                            className="w-full h-9 px-3 text-sm border border-gray-200 rounded-md shadow-sm focus:ring-1 focus:ring-primary-500 focus:border-primary-500 outline-none"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Company Information */}
                    <div className="pt-4 border-t border-gray-100">
                      <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-1.5">
                        <Building2 className="w-4 h-4 text-primary-600" />
                        Company Information
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Company Name</label>
                          <input
                            type="text"
                            name="company"
                            value={profileData.company}
                            onChange={handleProfileChange}
                            className="w-full h-9 px-3 text-sm border border-gray-200 rounded-md shadow-sm focus:ring-1 focus:ring-primary-500 focus:border-primary-500 outline-none"
                          />
                        </div>
                        <div>
                          <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-1">
                            <Globe className="w-3.5 h-3.5" />
                            Website
                          </label>
                          <input
                            type="url"
                            name="website"
                            value={profileData.website}
                            onChange={handleProfileChange}
                            className="w-full h-9 px-3 text-sm border border-gray-200 rounded-md shadow-sm focus:ring-1 focus:ring-primary-500 focus:border-primary-500 outline-none"
                          />
                        </div>
                        <div className="md:col-span-2">
                          <label className="block text-xs font-medium text-gray-600 mb-1">Address</label>
                          <input
                            type="text"
                            name="address"
                            value={profileData.address}
                            onChange={handleProfileChange}
                            className="w-full h-9 px-3 text-sm border border-gray-200 rounded-md shadow-sm focus:ring-1 focus:ring-primary-500 focus:border-primary-500 outline-none"
                          />
                        </div>
                        <div>
                          <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-1">
                            <MapPin className="w-3.5 h-3.5" />
                            City
                          </label>
                          <input
                            type="text"
                            name="city"
                            value={profileData.city}
                            onChange={handleProfileChange}
                            className="w-full h-9 px-3 text-sm border border-gray-200 rounded-md shadow-sm focus:ring-1 focus:ring-primary-500 focus:border-primary-500 outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Country</label>
                          <input
                            type="text"
                            name="country"
                            value={profileData.country}
                            onChange={handleProfileChange}
                            className="w-full h-9 px-3 text-sm border border-gray-200 rounded-md shadow-sm focus:ring-1 focus:ring-primary-500 focus:border-primary-500 outline-none"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Save Button */}
                    <div className="pt-4 border-t border-gray-100">
                      <button
                        type="submit"
                        disabled={loading}
                        className="px-4 py-2 text-xs font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 transition-colors shadow-sm flex items-center gap-1.5 disabled:opacity-50"
                      >
                        <Save className="w-3.5 h-3.5" />
                        {loading ? 'Saving...' : 'Save Changes'}
                      </button>
                    </div>
                  </div>
                </form>
              )}

              {activeTab === 'password' && (
                <form onSubmit={handleChangePassword}>
                  <div className="space-y-4 max-w-md">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-800 mb-2 flex items-center gap-1.5">
                        <Lock className="w-4 h-4 text-primary-600" />
                        Change Password
                      </h3>
                      <p className="text-xs text-gray-500 mb-4">
                        Password must be at least 8 characters long.
                      </p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Current Password *</label>
                      <input
                        type="password"
                        name="currentPassword"
                        value={passwordData.currentPassword}
                        onChange={handlePasswordChange}
                        required
                        className="w-full h-9 px-3 text-sm border border-gray-200 rounded-md shadow-sm focus:ring-1 focus:ring-primary-500 focus:border-primary-500 outline-none"
                        placeholder="Enter current password"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">New Password *</label>
                      <input
                        type="password"
                        name="newPassword"
                        value={passwordData.newPassword}
                        onChange={handlePasswordChange}
                        required
                        minLength={8}
                        className="w-full h-9 px-3 text-sm border border-gray-200 rounded-md shadow-sm focus:ring-1 focus:ring-primary-500 focus:border-primary-500 outline-none"
                        placeholder="Enter new password"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Confirm New Password *</label>
                      <input
                        type="password"
                        name="confirmPassword"
                        value={passwordData.confirmPassword}
                        onChange={handlePasswordChange}
                        required
                        minLength={8}
                        className="w-full h-9 px-3 text-sm border border-gray-200 rounded-md shadow-sm focus:ring-1 focus:ring-primary-500 focus:border-primary-500 outline-none"
                        placeholder="Confirm new password"
                      />
                    </div>
                    <div className="pt-2">
                      <button
                        type="submit"
                        disabled={loading}
                        className="px-4 py-2 text-xs font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 transition-colors shadow-sm flex items-center gap-1.5 disabled:opacity-50"
                      >
                        <Lock className="w-3.5 h-3.5" />
                        {loading ? 'Changing...' : 'Change Password'}
                      </button>
                    </div>
                  </div>
                </form>
              )}
            </div>
          </div>

          {/* BOTTOM CARDS */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Account Activity */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
              <h3 className="text-sm font-semibold text-gray-800 mb-3">Account Activity</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between py-1.5 border-b border-gray-100">
                  <span className="text-xs text-gray-500">Account Created</span>
                  <span className="text-xs font-medium text-gray-700">Jan 15, 2024</span>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-gray-100">
                  <span className="text-xs text-gray-500">Last Login</span>
                  <span className="text-xs font-medium text-gray-700">Today, 10:30 AM</span>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-gray-100">
                  <span className="text-xs text-gray-500">Total Bookings</span>
                  <span className="text-xs font-medium text-gray-700">247</span>
                </div>
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-xs text-gray-500">Active Tours</span>
                  <span className="text-xs font-medium text-gray-700">12</span>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
              <h3 className="text-sm font-semibold text-gray-800 mb-3">Quick Actions</h3>
              <div className="space-y-2">
                <Link href="/clients/new" className="flex items-center gap-2.5 p-2 rounded-md hover:bg-gray-50 transition-colors group">
                  <div className="w-8 h-8 bg-blue-50 rounded-md flex items-center justify-center group-hover:bg-blue-100 border border-blue-100">
                    <User className="w-4 h-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-700">Add New Client</p>
                    <p className="text-[10px] text-gray-400">Create a new client profile</p>
                  </div>
                </Link>
                <Link href="/itineraries" className="flex items-center gap-2.5 p-2 rounded-md hover:bg-gray-50 transition-colors group">
                  <div className="w-8 h-8 bg-green-50 rounded-md flex items-center justify-center group-hover:bg-green-100 border border-green-100">
                    <MapPin className="w-4 h-4 text-green-600" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-700">View Itineraries</p>
                    <p className="text-[10px] text-gray-400">Manage tour schedules</p>
                  </div>
                </Link>
                <Link href="/resources" className="flex items-center gap-2.5 p-2 rounded-md hover:bg-gray-50 transition-colors group">
                  <div className="w-8 h-8 bg-purple-50 rounded-md flex items-center justify-center group-hover:bg-purple-100 border border-purple-100">
                    <Building2 className="w-4 h-4 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-700">Manage Resources</p>
                    <p className="text-[10px] text-gray-400">Hotels, guides & more</p>
                  </div>
                </Link>
              </div>
            </div>
          </div>

          {/* DANGER ZONE */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 border-l-4 border-l-red-500">
            <h3 className="text-sm font-semibold text-red-600 mb-3">Danger Zone</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-gray-700">Deactivate Account</p>
                  <p className="text-[10px] text-gray-400">Temporarily disable your account</p>
                </div>
                <button className="px-3 py-1.5 text-xs font-medium border border-red-200 text-red-600 rounded-md hover:bg-red-50 transition-colors shadow-sm">
                  Deactivate
                </button>
              </div>
              <div className="border-t border-gray-100 pt-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-gray-700">Delete Account</p>
                    <p className="text-[10px] text-gray-400">Permanently delete your account and all data</p>
                  </div>
                  <button className="px-3 py-1.5 text-xs font-medium bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors shadow-sm">
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
