import React from 'react';
import { useAppStore } from '../../stores/appStore';
import { createLogger } from '../../services/logger';

const log = createLogger('ErrorBoundary');

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * React Error Boundary — catches render errors and shows a recovery UI
 * instead of crashing the entire app with a white screen.
 */
export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    log.error('Uncaught error', { error, componentStack: info.componentStack });
    // Log to file if available
    try {
      const { addToast } = useAppStore.getState();
      addToast({ type: 'error', message: `Something went wrong: ${error.message}` });
    } catch {
      // Store may not be available
    }
  }

  handleRecover = () => {
    this.setState({ hasError: false, error: null });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-full flex items-center justify-center p-8">
          <div className="max-w-lg text-center space-y-4">
            <div className="text-red-500 text-4xl mb-2">!</div>
            <h2 className="text-xl font-semibold text-gray-900">Something went wrong</h2>
            <p className="text-gray-600 text-sm">
              An unexpected error occurred in this section. You can try recovering or reload the app.
            </p>
            {this.state.error && (
              <details className="text-left bg-gray-50 rounded p-3 text-xs text-gray-500">
                <summary className="cursor-pointer font-medium">Error details</summary>
                <pre className="mt-2 whitespace-pre-wrap break-words">
                  {this.state.error.message}
                  {'\n\n'}
                  {this.state.error.stack}
                </pre>
              </details>
            )}
            <div className="flex justify-center space-x-3 pt-2">
              <button
                onClick={this.handleRecover}
                className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700"
              >
                Try to Recover
              </button>
              <button
                onClick={this.handleReload}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Reload App
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
