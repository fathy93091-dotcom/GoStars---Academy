import { Routes, Route } from 'react-router-dom'
import AdminArea from './AdminArea.jsx'
import Need from '../../auth/Need.jsx'
import AdminHome from './Home.jsx'
import Subjects from './Subjects.jsx'
import Students from './Students.jsx'
import StudentEdit from './StudentEdit.jsx'
import Groups from './Groups.jsx'
import GroupEdit from './GroupEdit.jsx'
import Reports from './Reports.jsx'
import Teachers from './Teachers.jsx'
import Content from './Content.jsx'
import Announcements from './Announcements.jsx'
import Messages from './Messages.jsx'
import BotSettings from './BotSettings.jsx'
import Audit from './Audit.jsx'
import Security from './Security.jsx'
import Users from '../dashboard/Users.jsx'
import Finance from '../dashboard/Finance.jsx'
import StudentFinance from '../dashboard/StudentFinance.jsx'
import Packages from '../dashboard/Packages.jsx'
import NotFound from '../NotFound.jsx'

export default function AdminRoutes() {
  return (
    <Routes>
      <Route element={<AdminArea />}>
            <Route index element={<AdminHome />} />
            <Route path="users" element={<Need perm="manage_users"><Users /></Need>} />
            <Route path="students" element={<Need perm="manage_students"><Students /></Need>} />
            <Route path="students/:id" element={<Need perm="manage_students"><StudentEdit /></Need>} />
            <Route path="groups" element={<Need perm="manage_groups"><Groups /></Need>} />
            <Route path="groups/:id" element={<Need perm="manage_groups"><GroupEdit /></Need>} />
            <Route path="subjects" element={<Need perm="manage_groups"><Subjects /></Need>} />
            <Route path="packages" element={<Need perm="manage_students"><Packages /></Need>} />
            <Route path="finance" element={<Need perm="manage_finance"><Finance /></Need>} />
            <Route path="finance/:id" element={<Need perm="manage_finance"><StudentFinance /></Need>} />
            <Route path="reports" element={<Need perm="follow_reports"><Reports /></Need>} />
            <Route path="teachers" element={<Need perm="follow_teachers"><Teachers /></Need>} />
            <Route path="content" element={<Need perm="manage_content"><Content /></Need>} />
            <Route path="announcements" element={<Need perm="add_announcements"><Announcements /></Need>} />
            <Route path="messages" element={<Need perm="manage_students"><Messages /></Need>} />
            <Route path="bot" element={<Need adminOnly><BotSettings /></Need>} />
            <Route path="audit" element={<Need adminOnly><Audit /></Need>} />
            <Route path="security" element={<Security />} />
            <Route path="*" element={<NotFound />} />
          </Route>
    </Routes>
  )
}
