import {Routes, Route, useLocation} from 'react-router-dom';
import {useEffect} from 'react';
import Navbar from './components/layout/Navbar';
import Home from './pages/Home';
import PurchaseInvoice from './pages/PurchaseInvoice';
import PurchaseInvoiceCreate from './pages/PurchaseInvoiceCreate';
import SaleInvoice from './pages/SaleInvoice';
import SaleInvoiceCreate from './pages/SaleInvoiceCreate';
import Stock from './pages/Stock';
import Settings from './pages/Settings';
import PrintInvoice from './pages/PrintInvoice';
import Ledger from './pages/Ledger';
import LedgerCreate from './pages/LedgerCreate';
import ErrorBoundary from './components/layout/ErrorBoundary';
import Analytics from './pages/Analytics';

function App() {
  const loc = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const route = params.get('route');
    if (route && !window.location.hash.includes(route)) {
      window.location.hash = '#' + route.replace(/^#?/, '');
    }
  }, [loc]);

  const isPrintRoute = loc.pathname.startsWith('/print');

  return (
    <ErrorBoundary>
      <div className="h-screen overflow-hidden flex flex-col">
        <div
          className={[
            'flex-1 min-h-0 flex text-neutral-800 font-sans',
            isPrintRoute ? '' : 'bg-neutral-100',
          ].join(' ')}>
          {!isPrintRoute && <Navbar />}
          <div className="flex-1 min-w-0 overflow-y-auto">
            <div className={isPrintRoute ? '' : 'p-6'}>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/purchase-invoice" element={<PurchaseInvoice />} />
                <Route
                  path="/purchase-invoice/new"
                  element={<PurchaseInvoiceCreate />}
                />
                <Route path="/sale-invoice" element={<SaleInvoice />} />
                <Route
                  path="/sale-invoice/new"
                  element={<SaleInvoiceCreate />}
                />
                <Route path="/stock" element={<Stock />} />
                <Route path="/ledger" element={<Ledger />} />
                <Route path="/ledger/create" element={<LedgerCreate />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/print/invoice/:id" element={<PrintInvoice />} />
                <Route path="/analytics" element={<Analytics />} />
              </Routes>
            </div>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}

export default App;
