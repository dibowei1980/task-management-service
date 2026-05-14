import { HashRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { LoginForm } from './components/auth/LoginForm';
import { Layout } from './components/layout/Layout';
import { BridgeProjects } from './components/bridge/BridgeProjects';
import { BridgeRemovalWorkflow } from './components/bridge/BridgeRemovalWorkflow';
import { BridgeTaskLocatePage } from './components/bridge/BridgeTaskLocatePage';
import { BridgeInpaintResultsPage } from './components/bridge/BridgeInpaintResultsPage';

export function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Routes>
          <Route path="/" element={<LoginForm />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/projects" element={<BridgeProjects />} />
              <Route path="/projects/:projectId" element={<BridgeRemovalWorkflow />} />
              <Route path="/tasks/:taskId/locate" element={<BridgeTaskLocatePage />} />
              <Route path="/tasks/:taskId/inpaint-results" element={<BridgeInpaintResultsPage />} />
            </Route>
          </Route>
          <Route path="*" element={<div>Not Found</div>} />
        </Routes>
      </HashRouter>
    </AuthProvider>
  );
}
