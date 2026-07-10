'use client';

import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Optional override for the default studio-themed fallback. */
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * Shared error boundary for the /media/* canvas studios (Designer, HeyGen,
 * Replicate, Deepgram and every Studio Kit `StudioShell`). A crash in a studio
 * renders a friendly, studio-themed fallback with a reset action instead of a
 * blank screen. Mirrors the analytics-v2 `ErrorBoundary` pattern.
 */
export class StudioErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  private reset = () => this.setState({ hasError: false, error: undefined });

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="flex flex-col items-center justify-center h-full min-h-[320px] gap-[12px] text-center px-[20px] bg-studioBg rounded-[12px]">
            <div className="text-[42px]">🎬</div>
            <h2 className="text-[18px] font-[600] text-textColor">This studio hit a snag</h2>
            <p className="text-[13px] text-newTextColor/70 max-w-[360px]">
              {this.state.error?.message || 'Something went wrong while loading the studio.'}
            </p>
            <button
              type="button"
              onClick={this.reset}
              className="mt-[4px] px-[16px] py-[9px] rounded-[8px] bg-[#2B5CD3] text-white text-[13px] font-[500] hover:bg-[#2B5CD3]/80 transition-all"
            >
              Try again
            </button>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
