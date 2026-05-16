import { HashRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { LoginForm } from './components/auth/LoginForm';
import { Layout } from './components/layout/Layout';
import { BridgeProjects } from './components/bridge/BridgeProjects';
import { BridgeRemovalWorkflow } from './components/bridge/BridgeRemovalWorkflow';
import { BridgeTaskLocatePage } from './components/bridge/BridgeTaskLocatePage';
import { BridgeInpaintResultsPage } from './components/bridge/BridgeInpaintResultsPage';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { NotFoundPage } from './components/common/NotFoundPage';
import { ToastContainer } from './components/common/Toast';

export function App() {
  return (
    <ErrorBoundary>
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
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </HashRouter>
      </AuthProvider>
      <ToastContainer />
    </ErrorBoundary>
  );
}
