import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// Error Boundary component to catch render errors
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('🚨 React Error Boundary caught an error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          backgroundColor: '#1a1a2e',
          color: '#eee',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        }}>
          <div style={{ maxWidth: '600px', padding: '40px', textAlign: 'center' }}>
            <h1 style={{ color: '#ff6b6b' }}>⚠️ Something Went Wrong</h1>
            <p>The dashboard encountered an unexpected error.</p>
            <details style={{
              background: '#16213e',
              padding: '20px',
              borderRadius: '8px',
              textAlign: 'left',
              marginTop: '20px'
            }}>
              <summary style={{ cursor: 'pointer', marginBottom: '10px' }}>Error Details</summary>
              <pre style={{ overflow: 'auto', fontSize: '12px' }}>
                {this.state.error && this.state.error.toString()}
                {this.state.errorInfo && this.state.errorInfo.componentStack}
              </pre>
            </details>
            <button
              onClick={() => window.location.reload()}
              style={{
                marginTop: '20px',
                padding: '12px 24px',
                backgroundColor: '#4da6ff',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '16px'
              }}
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

console.log('🚀 TeamTape Dashboard initializing...');
console.log('📍 API URL:', import.meta.env.VITE_API_BASE_URL || 'http://localhost:7705/api/v1');
console.log('🌍 Environment:', import.meta.env.MODE);

const root = document.getElementById('root');

if (!root) {
  console.error('❌ Root element not found! Check index.html');
} else {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
  console.log('✅ TeamTape Dashboard rendered');
}
