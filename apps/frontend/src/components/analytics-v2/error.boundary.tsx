'use client';

import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="flex flex-col items-center justify-center py-[48px] text-center">
          <p className="text-newTableText text-[14px]">Something went wrong</p>
          <p className="text-[12px] text-newTableText/60 mt-[8px]">{this.state.error?.message}</p>
          <button
            onClick={() => this.setState({ hasError: false, error: undefined })}
            className="mt-[16px] px-[12px] py-[6px] text-[12px] bg-btnPrimary text-white rounded-[6px]"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
