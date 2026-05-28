import {createRoot} from 'react-dom/client';
import {HashRouter} from 'react-router-dom';
import './index.css';
import App from './App.tsx';
import ErrorBoundary from './components/layout/ErrorBoundary';

function reportRootError(
  channel: 'warn' | 'error',
  error: unknown,
  componentStack?: string,
) {
  const message =
    error instanceof Error ? error.message : String(error ?? 'Unknown error');
  const stack = componentStack?.trim();
  const details = stack ? `${message}\n${stack}` : message;

  console[channel]('React root error:', error);
  window.dispatchEvent(
    new CustomEvent('app:feedback', {
      detail: {type: channel, message: details},
    }),
  );
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Missing root element #root');
}

const root = createRoot(rootElement, {
  onCaughtError: (error, errorInfo) => {
    reportRootError('error', error, errorInfo.componentStack);
  },
  onUncaughtError: (error, errorInfo) => {
    reportRootError('error', error, errorInfo.componentStack);
  },
  onRecoverableError: (error, errorInfo) => {
    reportRootError('warn', error, errorInfo.componentStack);
  },
});

root.render(
  <ErrorBoundary>
    <HashRouter>
      <App />
    </HashRouter>
  </ErrorBoundary>,
);

if (window.api) {
  console.log('Electron API available');
} else {
  console.warn('Running in browser mode - Electron APIs not available');
}
