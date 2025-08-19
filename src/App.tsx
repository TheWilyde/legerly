import {Routes, Route} from 'react-router-dom';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import PurchaseInvoice from './pages/PurchaseInvoice';
import PurchaseInvoiceNewInvoice from './pages/PurchaseInvoiceNewInvoice';
import SaleInvoice from './pages/SaleInvoice';
import PurchaseHistory from './pages/PurchaseHistory';
import SaleHistory from './pages/SaleHistory';
import Settings from './pages/Settings';

function App() {
  return (
    <div className="h-screen w-screen overflow-hidden flex bg-neutral-100 text-neutral-800 font-sans">
      <Navbar />
      <main className="flex-1 min-w-0 h-full overflow-auto">
        <div className="p-6">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/purchase-invoice" element={<PurchaseInvoice />} />
            <Route
              path="/purchase-invoice/new"
              element={<PurchaseInvoiceNewInvoice />}
            />
            <Route path="/sale-invoice" element={<SaleInvoice />} />
            <Route path="/purchase-history" element={<PurchaseHistory />} />
            <Route path="/sale-history" element={<SaleHistory />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Home />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

export default App;
