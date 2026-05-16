import React from 'react';
import { logger } from '../../utils/logger';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    logger.error('ErrorBoundary', error);
    logger.error('ErrorBoundary.componentStack', errorInfo.componentStack);
  }

  private handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center max-w-md px-4">
            <h2 className="text-xl font-semibold text-gray-800 mb-2">页面出现错误</h2>
            <p className="text-gray-600 mb-4 text-sm">{this.state.error?.message}</p>
            <button
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              onClick={this.handleReload}
            >
              重新加载
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}