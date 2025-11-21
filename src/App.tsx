import {useState, useEffect, useRef} from 'react';
import {Routes, Route, useNavigate, useLocation, Navigate} from 'react-router-dom';
import MainLayout from './components/MainLayout';
// FIX: Import TitleBar
import TitleBar from './components/layout/TitleBar';
import WelcomeScreen from './pages/WelcomeScreen';
import Home from './pages/Home';
import PurchaseInvoice from './pages/PurchaseInvoice';
import SaleInvoice from './pages/SaleInvoice';
import PurchaseInvoiceCreate from './pages/PurchaseInvoiceCreate';
import SaleInvoiceCreate from './pages/SaleInvoiceCreate';
import Stock from './pages/Stock';
import Ledger from './pages/Ledger';
import Analytics from './pages/Analytics';
import Settings from './pages/Settings';
import PrintInvoice from './pages/PrintInvoice';
import {ProfileProvider, useProfiles} from './contexts/ProfileContext';
import {AnalyticsProvider} from './contexts/AnalyticsContext';
import {useActiveProfile} from './hooks/useActiveProfile';

function AppInner() {
  const [isReady, setIsReady] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const {openProfile, setActiveProfile} = useProfiles();
  const restoredOnce = useRef(false);
  const activeProfileId = useActiveProfile();

  const isPrintWindow = window.location.href.includes('#/print/');

  // Handle print window initialization
  useEffect(() => {
    if (isPrintWindow) {
      restoredOnce.current = true;
      const params = new URLSearchParams(location.search);
      const printProfileId = params.get('profileId');

      if (printProfileId) {
        (async () => {
          try {
            await openProfile(printProfileId);
            await setActiveProfile(printProfileId);
          } catch (err) {
            console.error('Failed to init print profile:', err);
          } finally {
            setIsReady(true);
          }
        })();
      } else {
        setIsReady(true);
      }
    }
  }, [isPrintWindow, location.search, openProfile, setActiveProfile]);

  // One-time session restore
  useEffect(() => {
    if (restoredOnce.current) return;
    restoredOnce.current = true;

    (async () => {
      try {
        if (isPrintWindow) return;

        const openIds = await (window as any)?.api?.profiles?.getOpen?.();
        const activeId = await (window as any)?.api?.profiles?.getActive?.();
        
        if (Array.isArray(openIds) && openIds.length > 0) {
          for (const id of openIds) await openProfile(id);
          if (activeId) {
            await setActiveProfile(activeId);
            const lastRoute =
              localStorage.getItem(`lastRoute:${activeId}`) || '/';
            navigate(lastRoute.includes('profile-selector') ? '/' : lastRoute, {
              replace: true,
            });
          }
        } else {
          navigate('/welcome');
        }
      } catch (err) {
        console.error('Failed to restore session:', err);
        navigate('/welcome');
      } finally {
        setIsReady(true);
      }
    })();
  }, [navigate, openProfile, setActiveProfile, isPrintWindow]);

  // Persist last route per active profile
  useEffect(() => {
    if (!activeProfileId) return;
    if (isPrintWindow) return;
    localStorage.setItem(`lastRoute:${activeProfileId}`, location.pathname);
  }, [location.pathname, activeProfileId, isPrintWindow]);

  // Handle events from main process
  useEffect(() => {
    const handleNavigate = (path: string) => {
      navigate(path);
      setIsReady(true);
    };

    const handleRestore = (_data: any) => {
      setIsReady(true);
    };

    window.api.on('app:navigate', handleNavigate);
    window.api.on('app:restore-session', handleRestore);

    return () => {
      window.api.off('app:navigate', handleNavigate);
      window.api.off('app:restore-session', handleRestore);
    };
  }, [navigate]);

  if (!isReady) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-3">
          <div className="size-8 border-2 border-neutral-200 border-t-neutral-800 rounded-full animate-spin" />
          <div className="text-sm font-medium text-neutral-500">Initializing Ledgerly...</div>
        </div>
      </div>
    );
  }

  return (
    // FIX: Changed to flex-col to stack TitleBar and Content
    <div className="flex flex-col h-screen bg-neutral-50 overflow-hidden">
      {/* FIX: Added TitleBar back */}
      <TitleBar />
      
      {/* Main Content Area (takes remaining height) */}
      <div className="flex-1 overflow-hidden relative">
        <Routes>
          <Route element={<MainLayout />}>
            <Route path="/" element={<Home />} />

            {/* Purchase */}
            <Route path="purchase-invoice">
              <Route index element={<PurchaseInvoice />} />
              <Route path="new" element={<PurchaseInvoiceCreate />} />
              <Route path=":id" element={<PurchaseInvoiceCreate />} />
            </Route>

            {/* Sale */}
            <Route path="sale-invoice">
              <Route index element={<SaleInvoice />} />
              <Route path="new" element={<SaleInvoiceCreate />} />
              <Route path=":id" element={<SaleInvoiceCreate />} />
            </Route>

            <Route path="/stock" element={<Stock />} />
            <Route path="/ledger" element={<Ledger />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/settings" element={<Settings />} />
          </Route>

          {/* Print Route */}
          <Route path="/print/:kind/:id" element={<PrintInvoice />} />

          <Route path="/welcome" element={<WelcomeScreen />} />
          <Route path="*" element={<Navigate to="/stock" replace />} />
        </Routes>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ProfileProvider>
      <AnalyticsProvider>
        <AppInner />
      </AnalyticsProvider>
    </ProfileProvider>
  );
}
