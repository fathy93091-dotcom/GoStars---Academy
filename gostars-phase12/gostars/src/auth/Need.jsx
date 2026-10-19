import { useAuth } from './AuthContext.jsx'
import NotFound from '../pages/NotFound.jsx'

// حارس صفحات اللوحة: يتطلب صلاحية (المدير يملك الكل). بلا صلاحية = 404 عادية.
export default function Need({ perm, adminOnly, children }) {
  const { profile, can } = useAuth()
  if (adminOnly && profile.role !== 'admin') return <NotFound />
  if (perm && !can(perm)) return <NotFound />
  return children
}
