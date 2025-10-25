import {Routes, Route, Navigate} from 'react-router-dom';
import {ProfileProvider} from './contexts/ProfileContext';
import {AnalyticsProvider} from './contexts/AnalyticsContext'; // ✅ Import
import MainLayout from './components/MainLayout';
import WelcomeScreen from './pages/WelcomeScreen';
import Home from './pages/Home';
import PurchaseInvoice from './pages/PurchaseInvoice';
import SaleInvoice from './pages/SaleInvoice';
import Stock from './pages/Stock';
import Ledger from './pages/Ledger';
import Analytics from './pages/Analytics';
import Settings from './pages/Settings';

function App() {
  return (
    <ProfileProvider>
      <AnalyticsProvider> {/* ✅ Add Analytics Provider */}
        <Routes>
          {/* Welcome screen - shown when no profiles exist */}
          <Route path="/welcome" element={<WelcomeScreen />} />

          {/* Main app routes - wrapped in MainLayout */}
          <Route path="/" element={<MainLayout />}>
            <Route index element={<Home />} />
            <Route path="purchase-invoice" element={<PurchaseInvoice />} />
            <Route path="sale-invoice" element={<SaleInvoice />} />
            <Route path="stock" element={<Stock />} />
            <Route path="ledger" element={<Ledger />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="settings" element={<Settings />} />
          </Route>

          {/* Catch all - redirect to home */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AnalyticsProvider>
    </ProfileProvider>
  );
}

export default App;
