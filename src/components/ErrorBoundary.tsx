import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

function formatReadableError(rawMessage: string): string {
  try {
    const parsed = JSON.parse(rawMessage) as {
      error?: string;
      operationType?: string;
      path?: string | null;
    };
    if (parsed.error) {
      if (parsed.error.includes('Quota exceeded')) {
        return 'Daily Firestore free-tier quota was temporarily reached. You can continue creating locally in Guest Mode until tomorrow.';
      }
      return `${parsed.operationType ? `[${parsed.operationType}] ` : ''}${parsed.error}`;
    }
  } catch {
    // Plain error message
  }
  return rawMessage || 'An unexpected workspace error occurred.';
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    message: '',
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: formatReadableError(error.message),
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('A.H.I ErrorBoundary caught error:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#07090E] text-[#F8FAFC] flex items-center justify-center p-6">
          <div className="w-full max-w-md bg-[rgba(17,22,33,0.72)] backdrop-blur-2xl border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_24px_60px_rgba(0,0,0,0.65)] rounded-3xl p-6 space-y-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-red-500/15 border border-red-500/40 text-red-300 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="space-y-1.5">
              <h1 className="text-lg font-display font-bold text-[#F8FAFC]">
                Workspace Recovery
              </h1>
              <p className="text-xs text-[#94A3B8] leading-relaxed break-words">
                {this.state.message}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false, message: '' });
                window.location.reload();
              }}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#2DD4BF] hover:bg-[#34D399] text-[#07090E] text-xs font-bold cursor-pointer transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Reload Studio
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
