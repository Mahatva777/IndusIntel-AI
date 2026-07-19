import React, { ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null };
  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, _info: React.ErrorInfo) {
    fetch('http://localhost:8081/debug/error', {
      method: 'POST',
      body: JSON.stringify({ message: error.message, stack: error.stack })
    }).catch(console.error);
  }
  render() {
    if (this.state.hasError) {
      return <div style={{color: 'red', padding: 20}}><h1>Error</h1><pre>{this.state.error?.message}</pre></div>;
    }
    return this.props.children;
  }
}
