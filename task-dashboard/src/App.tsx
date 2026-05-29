import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { LoginForm } from './components/auth/LoginForm';
import { SsoCallback } from './components/auth/SsoCallback';
import { Layout } from './components/layout/Layout';
import { PermissionBasedRoute } from './components/auth/PermissionBasedRoute';
import { ManagerDashboard } from './components/dashboard/ManagerDashboard';
import { OperatorWorkspace } from './components/workspace/OperatorWorkspace';
import { KanbanBoard } from './components/kanban/KanbanBoard';
import { UserProfile } from './components/profile/UserProfile';
import { ProjectTypeManagementPage } from './components/settings/ProjectTypeManagementPage';
import { TaskTypeManagementPage } from './components/settings/TaskTypeManagementPage';
import { MeasurementUnitManagementPage } from './components/settings/MeasurementUnitManagementPage';
import { TaskTypeRegistrationPage } from './components/settings/TaskTypeRegistrationPage';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<LoginForm />} />
          <Route path="/sso/callback" element={<SsoCallback />} />
          <Route path="/test" element={<div>Test Page</div>} />

          <Route element={<PermissionBasedRoute />}>
            <Route element={<Layout />}>
              <Route path="/kanban" element={<KanbanBoard />} />
              <Route path="/profile" element={<UserProfile />} />
              <Route path="/settings/project-types" element={<ProjectTypeManagementPage />} />
              <Route path="/settings/task-types" element={<TaskTypeManagementPage />} />
              <Route path="/settings/task-type-registrations" element={<TaskTypeRegistrationPage />} />
              <Route path="/settings/measurement-units" element={<MeasurementUnitManagementPage />} />

              <Route element={<PermissionBasedRoute allowedPermissions={['project:read_global', 'project:read_department', 'project:read_own', 'task:read_global', 'task:read_department', 'task:read_project']} />}>
                <Route path="/dashboard" element={<ManagerDashboard />} />
              </Route>

              <Route element={<PermissionBasedRoute allowedPermissions={['task:execute', 'task:claim', 'task:update_progress']} />}>
                <Route path="/workspace" element={<OperatorWorkspace />} />
              </Route>

            </Route>
          </Route>

          <Route path="/unauthorized" element={<div>Unauthorized Access</div>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
