import {Routes, Route, useLocation} from 'react-router-dom';
import {useEffect} from 'react';
import Navbar from './components/Navbar';
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
import WorkspaceTabs from './workspaces/WorkspaceTabs';
import ErrorBoundary from './components/ErrorBoundary';

function App() {
  // Redirect ?route=... to #/..., useful if an older build passes ?route
  const loc = useLocation();
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const route = params.get('route');
    if (route && !window.location.hash.includes(route)) {
      window.location.hash = '#' + route.replace(/^#?/, '');
    }
  }, [loc]);

  // Hide navbar and padding for print pages
  const isPrintRoute = loc.pathname.startsWith('/print');

  return (
    <ErrorBoundary>
      {/* Fill viewport once and prevent body scrolling */}
      <div className="h-screen overflow-hidden flex flex-col">
        {/* Tabs should not grow; keep height fixed */}
        <div className="shrink-0">
          <WorkspaceTabs />
        </div>

        {/* App body: flex container with a single scrollable main */}
        <div
          className={[
            'flex-1 min-h-0 flex text-neutral-800 font-sans',
            isPrintRoute ? '' : 'bg-neutral-100',
          ].join(' ')}>
          {!isPrintRoute && <Navbar />}

          <main
            className={[
              // take remaining space and be the only scroll area
              'flex-1 min-h-0 overflow-auto p-5',
              isPrintRoute ? 'w-full' : '',
            ].join(' ')}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/purchase-invoice" element={<PurchaseInvoice />} />
              <Route
                path="/purchase-invoice/new"
                element={<PurchaseInvoiceCreate />}
              />
              <Route path="/sale-invoice" element={<SaleInvoice />} />
              <Route path="/sale-invoice/new" element={<SaleInvoiceCreate />} />
              <Route path="/stock" element={<Stock />} />
              <Route path="/ledger" element={<Ledger />} />
              <Route path="/ledger/new" element={<LedgerCreate />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/print" element={<PrintInvoice />} />
              <Route path="/print/:kind/:id" element={<PrintInvoice />} />
            </Routes>
          </main>
        </div>
      </div>
    </ErrorBoundary>
  );
}

export default App;
