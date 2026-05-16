import { useNavigate } from 'react-router-dom';
import { Home } from 'lucide-react';

export function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center max-w-md px-4">
        <h1 className="text-6xl font-bold text-gray-300 mb-4">404</h1>
        <h2 className="text-xl font-semibold text-gray-800 mb-2">页面未找到</h2>
        <p className="text-gray-600 mb-6">您访问的页面不存在或已被移除</p>
        <button
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          onClick={() => navigate('/projects')}
        >
          <Home className="w-4 h-4" />
          返回首页
        </button>
      </div>
    </div>
  );
}