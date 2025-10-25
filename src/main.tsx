import ReactDOM from 'react-dom/client';
import {HashRouter} from 'react-router-dom';
import './index.css';
import App from './App.tsx';
import ErrorBoundary from './components/layout/ErrorBoundary'; // ✅ Fixed path

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <HashRouter>
      <App />
    </HashRouter>
  </ErrorBoundary>
);

if (window.api) {
  console.log('✅ Electron API available');
} else {
  console.warn('⚠️ Running in browser mode - Electron APIs not available');
}
