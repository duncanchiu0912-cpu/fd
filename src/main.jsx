import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Application render error:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <main className="runtime-error" role="alert">
          <div className="runtime-error-card">
            <div className="runtime-error-mark">!</div>
            <p className="ledger-kicker">APPLICATION ERROR</p>
            <h1>頁面載入時發生問題</h1>
            <p>請先重新整理頁面。如果問題持續，請開啟瀏覽器開發者工具的 Console，複製第一筆紅色錯誤訊息以便排查。</p>
            <pre>{this.state.error?.message || '未知的前端錯誤'}</pre>
            <button type="button" className="ledger-primary" onClick={() => window.location.reload()}>重新載入</button>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Missing #root element in index.html');

createRoot(rootElement).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>,
);
