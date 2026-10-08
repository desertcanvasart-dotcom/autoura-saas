// The blog editor on a light page inside the dark super-admin shell, so a
// post is written on the same background it is read on.
export default function SuperAdminBlogLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-full bg-gray-50 text-gray-900">{children}</div>
}
