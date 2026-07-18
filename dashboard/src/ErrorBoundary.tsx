import React from 'react';
export class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null };
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
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
