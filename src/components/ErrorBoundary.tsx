import { Component, type ErrorInfo, type ReactNode } from 'react';
import { BUILD_ID, flushDiagnostics, getDiagEvents, recordDiagEvent } from '../domain/diagnostics';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
  copied: boolean;
}

/**
 * Top-level fallback catching unexpected render/lifecycle errors so users see a
 * recovery screen with "Reload App" and "Copy Diagnostics" instead of a blank page.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null, copied: false };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    const stackSnippet = info.componentStack ? ` | ${info.componentStack.trim().slice(0, 200)}` : '';
    recordDiagEvent('react_error', `${error.message}${stackSnippet}`);
    flushDiagnostics();
  }

  private handleCopyDiagnostics = async () => {
    const err = this.state.error;
    const payload = JSON.stringify(
      {
        buildId: BUILD_ID,
        generatedAt: new Date().toISOString(),
        error: err ? { name: err.name, message: err.message } : null,
        recentEvents: getDiagEvents(),
      },
      null,
      2
    );
    try {
      await navigator.clipboard?.writeText(payload);
      this.setState({ copied: true });
    } catch {
      /* ignore clipboard denial */
    }
  };

  override render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <div
        role="alert"
        className="min-h-dvh flex items-center justify-center p-6 bg-tt-bg text-tt-text"
      >
        <div className="w-full max-w-md rounded-2xl bg-tt-elevated border border-tt-border p-6 shadow-xl space-y-4">
          <div className="space-y-1.5">
            <h1 className="text-xl font-bold text-tt-text">Something went wrong</h1>
            <p className="text-sm text-tt-secondary leading-relaxed">
              Tempo hit an unexpected error. Your routines remain saved locally on this device.
            </p>
          </div>
          <p className="text-xs font-mono text-tt-overdue bg-tt-overdue/10 px-3 py-2 rounded-lg break-words">
            {this.state.error.message}
          </p>
          <div className="flex flex-wrap gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-tt-blue hover:bg-tt-blue-hover text-white cursor-pointer"
            >
              Reload App
            </button>
            <button
              type="button"
              onClick={() => void this.handleCopyDiagnostics()}
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-tt-sidebar hover:bg-tt-hover border border-tt-border text-tt-text cursor-pointer"
            >
              {this.state.copied ? 'Copied Diagnostics' : 'Copy Diagnostics'}
            </button>
          </div>
        </div>
      </div>
    );
  }
}
