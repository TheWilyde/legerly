import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import {useActiveProfile} from '../hooks/useActiveProfile';
import {
  computeAnalytics,
  type AnalyticsData,
  type Invoice,
  type StockItem,
} from '../utils/analytics';

type AnalyticsContextType = {
  analytics: AnalyticsData | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const AnalyticsContext = createContext<AnalyticsContextType | null>(null);

export function AnalyticsProvider({children}: {children: React.ReactNode}) {
  const profileId = useActiveProfile();
  const [purchaseInvoices, setPurchaseInvoices] = useState<Invoice[]>([]);
  const [saleInvoices, setSaleInvoices] = useState<Invoice[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadingRef = useRef(false);
  const lastProfileRef = useRef<string | null>(null);

  const loadAllData = useCallback(async () => {
    if (!profileId) {
      setError('No active profile');
      return;
    }

    // ✅ Prevent concurrent loads
    if (loadingRef.current) {
      console.log('⏭️ Skipping analytics load - already in progress');
      return;
    }

    // ✅ Skip if already loaded for this profile
    if (lastProfileRef.current === profileId && purchaseInvoices.length > 0) {
      console.log('⏭️ Using cached analytics data for profile:', profileId);
      return;
    }

    loadingRef.current = true;
    lastProfileRef.current = profileId;

    try {
      setLoading(true);
      setError(null);

      console.log('📊 Loading analytics data for profile:', profileId);

      const [purchases, sales, stock] = await Promise.all([
        window.api.invoices.list(profileId),
        window.api.saleInvoices.list(profileId),
        window.api.stock.list(profileId),
      ]);

      setPurchaseInvoices(purchases || []);
      setSaleInvoices(sales || []);
      setStockItems(stock || []);

      console.log('✅ Analytics data loaded:', {
        purchases: purchases?.length || 0,
        sales: sales?.length || 0,
        stock: stock?.length || 0,
      });
    } catch (err: any) {
      setError(err?.message || 'Failed to load analytics data');
      console.error('❌ Analytics load error:', err);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [profileId, purchaseInvoices.length]);

  // ✅ Load data when profileId changes
  useEffect(() => {
    if (!profileId) {
      setError('No active profile');
      return;
    }

    loadAllData();
  }, [profileId, loadAllData]);

  // ✅ Listen for profile switch event
  useEffect(() => {
    const handleProfileSwitch = (event: Event) => {
      const customEvent = event as CustomEvent;
      console.log(
        '🔄 Profile switched, reloading analytics...',
        customEvent.detail
      );
      lastProfileRef.current = null; // ✅ Clear cache
      loadAllData();
    };

    window.addEventListener('profile:switched', handleProfileSwitch);
    return () =>
      window.removeEventListener('profile:switched', handleProfileSwitch);
  }, [loadAllData]);

  // ✅ Compute analytics only when data changes
  const analytics = React.useMemo(() => {
    if (loading || !profileId) return null;
    try {
      return computeAnalytics(purchaseInvoices, saleInvoices, stockItems);
    } catch (err) {
      console.error('Analytics computation error:', err);
      return null;
    }
  }, [purchaseInvoices, saleInvoices, stockItems, loading, profileId]);

  return (
    <AnalyticsContext.Provider
      value={{
        analytics,
        loading,
        error,
        refresh: loadAllData,
      }}>
      {children}
    </AnalyticsContext.Provider>
  );
}

export function useAnalytics() {
  const context = useContext(AnalyticsContext);
  if (!context) {
    throw new Error('useAnalytics must be used within AnalyticsProvider');
  }
  return context;
}