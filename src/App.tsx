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
import CustomerLedger from './pages/CustomerLedger';

function App() {
  // Redirect ?route=... to #/..., useful if an older build passes ?route
  const loc = useLocation();
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const route = params.get('route');
    if (route && !window.location.hash.includes(route)) {
      // Ensure it’s a hash route
      window.location.hash = '#' + route.replace(/^#?/, '');
    }
  }, [loc]);

  // Hide navbar and padding for print pages
  const isPrintRoute = loc.pathname.startsWith('/print');

  return (
    <div
      className={`w-screen ${
        isPrintRoute ? '' : 'h-screen overflow-hidden flex bg-neutral-100'
      } text-neutral-800 font-sans`}>
      {!isPrintRoute && <Navbar />}
      <main
        className={
          isPrintRoute
            ? 'w-full min-h-screen overflow-visible bg-white'
            : 'flex-1 min-w-0 h-full overflow-auto'
        }>
        <div className={isPrintRoute ? '' : 'p-6'}>
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
            <Route path="/ledger" element={<CustomerLedger />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/print" element={<PrintInvoice />} />
            <Route path="/print/:kind/:id" element={<PrintInvoice />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

export default App;
