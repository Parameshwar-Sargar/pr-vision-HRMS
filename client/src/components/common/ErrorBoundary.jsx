import React from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    // Log exception for development inspection
    console.error('🚨 [PR VISION HRMS ErrorBoundary] Rendering Exception Caught:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center px-4 py-12 selection:bg-rose-500 selection:text-white">
          <div className="max-w-xl w-full bg-white rounded-2xl shadow-xl border border-slate-200 p-8 space-y-6">
            {/* Header with Icon */}
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-2xl bg-rose-50 text-rose-600 border border-rose-100 flex-shrink-0">
                <AlertTriangle className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 uppercase tracking-wider">
                    PR VISION HRMS
                  </span>
                  <span className="text-xs text-rose-600 font-bold">Runtime Exception</span>
                </div>
                <h1 className="text-lg font-black text-slate-900 tracking-tight">
                  Application Rendering Exception
                </h1>
                <p className="text-xs text-slate-500 leading-relaxed">
                  An unexpected error occurred during interface rendering. The system captured the exception details below.
                </p>
              </div>
            </div>

            {/* Error Message Box */}
            <div className="p-4 rounded-xl bg-slate-900 text-slate-200 text-xs font-mono overflow-x-auto space-y-2 border border-slate-800">
              <div className="text-rose-400 font-bold">
                {this.state.error?.name || 'Error'}: {this.state.error?.message || 'Unknown error'}
              </div>
              {this.state.error?.stack && (
                <pre className="text-[11px] text-slate-400 whitespace-pre-wrap max-h-48 overflow-y-auto">
                  {this.state.error.stack}
                </pre>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
              <button
                onClick={this.handleGoHome}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                <Home className="w-4 h-4" />
                <span>Go to Login</span>
              </button>
              <button
                onClick={this.handleReload}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-500/20 transition-all"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Reload Application</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

