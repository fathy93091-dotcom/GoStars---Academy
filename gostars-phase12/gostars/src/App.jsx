import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import { ContentProvider, useContent } from './content/ContentContext.jsx'
import { AuthProvider } from './auth/AuthContext.jsx'
import ProtectedRoute from './auth/ProtectedRoute.jsx'
import PublicLayout from './layouts/PublicLayout.jsx'
import DashboardLayout from './layouts/DashboardLayout.jsx'
import Home from './pages/Home.jsx'
import About from './pages/About.jsx'
import Programs from './pages/Programs.jsx'
import News from './pages/News.jsx'
import Contact from './pages/Contact.jsx'
import NotFound from './pages/NotFound.jsx'
import Login from './pages/auth/Login.jsx'
import Activate from './pages/auth/Activate.jsx'
import ParentHome from './pages/parent/ParentHome.jsx'
import TeacherHome from './pages/teacher/Home.jsx'
import Schedule from './pages/teacher/Schedule.jsx'
import TeacherStudents from './pages/teacher/Students.jsx'
import StudentProfile from './pages/teacher/StudentProfile.jsx'
import LessonPage from './pages/teacher/LessonPage.jsx'
import Earnings from './pages/teacher/Earnings.jsx'

// صفحة أخفاها المدير: تظهر كأنها غير موجودة
function PageGate({ slug, children }) {
  const { pageOn, ready } = useContent()
  if (!pageOn(slug)) return ready ? <NotFound /> : null
  return children
}

const AdminRoutes = lazy(() => import('./pages/admin/AdminRoutes.jsx'))

const guard = (roles, el, permission) => (
  <ProtectedRoute roles={roles} permission={permission}>{el}</ProtectedRoute>
)

export default function App() {
  return (
    <ContentProvider>
      <AuthProvider>
        <Routes>
          {/* الموقع العام: بلا تسجيل دخول */}
          <Route element={<PublicLayout />}>
            <Route path="/" element={<Home />} />
            <Route path="/about" element={<PageGate slug="about"><About /></PageGate>} />
            <Route path="/programs" element={<PageGate slug="programs"><Programs /></PageGate>} />
            <Route path="/news" element={<PageGate slug="news"><News /></PageGate>} />
            <Route path="/contact" element={<PageGate slug="contact"><Contact /></PageGate>} />
            <Route path="/login" element={<Login />} />
            <Route path="/activate" element={<Activate />} />
            <Route path="*" element={<NotFound />} />
          </Route>

          {/* اللوحات المحمية */}
          <Route element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
            <Route path="/teacher" element={guard(['teacher'], <TeacherHome />)} />
            <Route path="/teacher/schedule" element={guard(['teacher'], <Schedule />)} />
            <Route path="/teacher/students" element={guard(['teacher'], <TeacherStudents />)} />
            <Route path="/teacher/students/:id" element={guard(['teacher'], <StudentProfile />)} />
            <Route path="/teacher/lessons/:id" element={guard(['teacher'], <LessonPage />)} />
            <Route path="/teacher/earnings" element={guard(['teacher'], <Earnings />)} />
            <Route path="/parent" element={guard(['parent'], <ParentHome />)} />
          </Route>
          {/* لوحة الإدارة: مخفية، تُفتح بكتابة /admin فقط (تُحمَّل عند الطلب ولا تنزل مع الموقع العام) */}
          <Route path="/admin/*" element={<Suspense fallback={<div className="center-note">جارٍ التحميل…</div>}><AdminRoutes /></Suspense>} />
        </Routes>
      </AuthProvider>
    </ContentProvider>
  )
}
