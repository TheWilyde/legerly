import {lazy, Suspense, useState, useEffect, useRef} from 'react';
import {
  Routes,
  Route,
  useNavigate,
  useLocation,
  Navigate,
} from 'react-router-dom';
import MainLayout from './components/MainLayout';
// FIX: Import TitleBar
import TitleBar from './components/layout/TitleBar';
import {ProfileProvider, useProfiles} from './contexts/ProfileContext';
import {AnalyticsProvider} from './contexts/AnalyticsContext';
import {PeriodProvider} from './contexts/PeriodContext';
import {useFontFamily} from './hooks/useFontFamily';
import {emitAppFeedback, toErrorText} from './utils/feedback';

const WelcomeScreen = lazy(() => import('./pages/WelcomeScreen'));
const Home = lazy(() => import('./pages/Home'));
const PurchaseInvoice = lazy(() => import('./pages/PurchaseInvoice'));
const SaleInvoice = lazy(() => import('./pages/SaleInvoice'));
const PurchaseInvoiceCreate = lazy(
  () => import('./pages/PurchaseInvoiceCreate'),
);
const SaleInvoiceCreate = lazy(() => import('./pages/SaleInvoiceCreate'));
const Stock = lazy(() => import('./pages/Stock'));
const Ledger = lazy(() => import('./pages/Ledger'));
const LedgerCreate = lazy(() => import('./pages/LedgerCreate'));
const Analytics = lazy(() => import('./pages/Analytics'));
const Settings = lazy(() => import('./pages/Settings'));
const PrintInvoice = lazy(() => import('./pages/PrintInvoice'));

type FeedbackType = 'success' | 'info' | 'warn' | 'error';
type RestoreFailure = {profileId: string; message?: string};

const ALERT_SUCCESS_PATTERN =
  /\b(success|successful|saved|complete|completed|created|updated|restored|done)\b/i;

const ALERT_ERROR_PATTERN =
  /\b(error|fail|failed|unable|invalid|missing|required|unavailable|exception|denied)\b/i;

const ALERT_WARN_PATTERN =
  /\b(warn|warning|cannot|can't|already|read-?only|disabled|no items|empty|last open)\b/i;

function inferAlertFeedbackType(message: string): FeedbackType {
  if (ALERT_ERROR_PATTERN.test(message)) {
    return 'error';
  }

  if (
    ALERT_SUCCESS_PATTERN.test(message) &&
    !ALERT_ERROR_PATTERN.test(message)
  ) {
    return 'success';
  }

  if (ALERT_WARN_PATTERN.test(message)) {
    return 'warn';
  }

  return 'info';
}

function toConsoleErrorMessage(args: unknown[]): string | null {
  for (const arg of args) {
    if (arg instanceof Error && arg.message.trim()) {
      return arg.message;
    }

    if (
      typeof arg === 'object' &&
      arg !== null &&
      'message' in arg &&
      typeof (arg as {message?: unknown}).message === 'string' &&
      (arg as {message: string}).message.trim()
    ) {
      return (arg as {message: string}).message;
    }

    if (typeof arg === 'string' && arg.trim()) {
      return arg;
    }
  }

  return null;
}

function formatRestoreWarningMessage(failedProfiles: RestoreFailure[]): string {
  if (failedProfiles.length === 0) {
    return '';
  }

  if (failedProfiles.length === 1) {
    const [{profileId, message}] = failedProfiles;
    const reason = String(message ?? '').trim();
    if (reason) {
      return `Profile ${profileId} failed to restore: ${reason}. Open it manually and use Restore Backup if needed.`;
    }
    return `Profile ${profileId} failed to restore. Open it manually and use Restore Backup if needed.`;
  }

  const listed = failedProfiles.slice(0, 2).map((item) => item.profileId);
  const remaining = failedProfiles.length - listed.length;
  const listSuffix = remaining > 0 ? ` and ${remaining} more` : '';

  return `${failedProfiles.length} profiles failed to restore (${listed.join(', ')}${listSuffix}). Open them manually and use Restore Backup if needed.`;
}

function AppInner() {
  const [isReady, setIsReady] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const {openProfile, setActiveProfile, activeProfileId} = useProfiles();
  const restoredOnce = useRef(false);

  // Apply font family preference
  useFontFamily();

  const isPrintWindow = window.location.href.includes('#/print/');

  useEffect(() => {
    if (isPrintWindow) return;

    const nativeAlert = window.alert.bind(window);

    window.alert = ((message?: unknown) => {
      const normalizedMessage = String(message ?? '').trim();

      if (!normalizedMessage) {
        emitAppFeedback('info', 'Notification');
        return;
      }

      emitAppFeedback(
        inferAlertFeedbackType(normalizedMessage),
        normalizedMessage,
      );
    }) as typeof window.alert;

    return () => {
      window.alert = nativeAlert;
    };
  }, [isPrintWindow]);

  useEffect(() => {
    if (isPrintWindow) return;

    const onWindowError = (event: ErrorEvent) => {
      emitAppFeedback(
        'error',
        toErrorText(event.error ?? event.message, 'Unexpected error'),
      );
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      emitAppFeedback(
        'error',
        toErrorText(event.reason, 'Unexpected async error'),
      );
    };

    window.addEventListener('error', onWindowError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);

    return () => {
      window.removeEventListener('error', onWindowError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  }, [isPrintWindow]);

  useEffect(() => {
    if (isPrintWindow) return;

    const nativeConsoleError = console.error.bind(console);

    console.error = (...args: unknown[]) => {
      nativeConsoleError(...args);

      const message = toConsoleErrorMessage(args);
      if (!message) return;
      // Avoid state updates during React render-phase warning logs.
      window.setTimeout(() => {
        emitAppFeedback('error', message);
      }, 0);
    };

    return () => {
      console.error = nativeConsoleError;
    };
  }, [isPrintWindow]);

  // Handle print window initialization
  useEffect(() => {
    if (isPrintWindow) {
      restoredOnce.current = true;
      const params = new URLSearchParams(
        location.search || window.location.hash.split('?')[1] || '',
      );
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
          const restoredProfiles: string[] = [];
          const failedProfiles: RestoreFailure[] = [];

          for (const id of openIds) {
            try {
              await openProfile(id);
              restoredProfiles.push(id);
            } catch (error) {
              failedProfiles.push({
                profileId: String(id),
                message: toErrorText(error, 'Unknown restore error'),
              });
            }
          }

          if (failedProfiles.length > 0) {
            emitAppFeedback('warn', formatRestoreWarningMessage(failedProfiles));
          }

          if (restoredProfiles.length === 0) {
            navigate('/welcome');
            return;
          }

          const resolvedActiveId =
            typeof activeId === 'string' && restoredProfiles.includes(activeId)
              ? activeId
              : restoredProfiles[0];

          if (resolvedActiveId) {
            await setActiveProfile(resolvedActiveId);
            const lastRoute =
              localStorage.getItem(`lastRoute:${resolvedActiveId}`) || '/';
            navigate(lastRoute.includes('profile-selector') ? '/' : lastRoute, {
              replace: true,
            });
          } else {
            navigate('/welcome');
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

  // Persist last route per active profile.
  // FIX: Use activeProfileId from React context (a real string) instead of
  //      calling getActive() which returns a Promise — storing that Promise
  //      object as a key produced "lastRoute:[object Promise]".
  useEffect(() => {
    if (!activeProfileId) return;
    if (isPrintWindow) return;
    if (!isReady) return; // Don't save during initial hydration
    localStorage.setItem(`lastRoute:${activeProfileId}`, location.pathname);
  }, [location.pathname, activeProfileId, isPrintWindow, isReady]);

  // Handle events from main process with proper cleanup
  useEffect(() => {
    const handleNavigate = (path: string) => {
      navigate(path);
      setIsReady(true);
    };

    const handleRestore = (data?: {failedProfiles?: unknown[]}) => {
      const failedProfiles = Array.isArray(data?.failedProfiles)
        ? data.failedProfiles
            .map((item) => {
              if (!item || typeof item !== 'object') return null;

              const profileId =
                typeof (item as {profileId?: unknown}).profileId === 'string'
                  ? (item as {profileId: string}).profileId
                  : '';
              const message =
                typeof (item as {message?: unknown}).message === 'string'
                  ? (item as {message: string}).message
                  : undefined;

              if (!profileId) return null;
              return message ? {profileId, message} : {profileId};
            })
            .filter((item): item is RestoreFailure => item !== null)
        : [];

      if (failedProfiles.length > 0) {
        emitAppFeedback('warn', formatRestoreWarningMessage(failedProfiles));
      }

      setIsReady(true);
    };

    let unsubscribeNavigate: (() => void) | undefined;
    let unsubscribeRestore: (() => void) | undefined;

    if ((window as any).api?.on) {
      unsubscribeNavigate = (window as any).api.on(
        'app:navigate',
        handleNavigate,
      );
      unsubscribeRestore = (window as any).api.on(
        'app:restore-session',
        handleRestore,
      );
    }

    return () => {
      unsubscribeNavigate?.();
      unsubscribeRestore?.();
    };
  }, [navigate]);

  if (!isReady) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-3">
          <div className="size-8 border-2 border-neutral-200 border-t-neutral-800 rounded-full animate-spin" />
          <div className="text-sm font-medium text-neutral-500">
            Initializing Ledgerly...
          </div>
        </div>
      </div>
    );
  }

  const routeLoader = (
    <div className="flex h-full w-full items-center justify-center">
      <div className="size-7 border-2 border-neutral-200 border-t-neutral-800 rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="flex flex-col h-screen bg-neutral-50 overflow-hidden">
      {!isPrintWindow && <TitleBar />}

      <div className="flex-1 overflow-hidden relative">
        <Suspense fallback={routeLoader}>
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

              {/* ✅ FIX: Add Ledger routes properly */}
              <Route path="/ledger" element={<Ledger />} />
              <Route path="/ledger/new" element={<LedgerCreate />} />
              <Route path="/ledger/:id" element={<LedgerCreate />} />

              <Route path="/analytics" element={<Analytics />} />
              <Route path="/settings" element={<Settings />} />
            </Route>

            <Route path="/print/:kind/:id" element={<PrintInvoice />} />

            <Route path="/welcome" element={<WelcomeScreen />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ProfileProvider>
      <PeriodProvider>
        <AnalyticsProvider>
          <AppInner />
        </AnalyticsProvider>
      </PeriodProvider>
    </ProfileProvider>
  );
}
