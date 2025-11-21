import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useActiveProfile } from '../hooks/useActiveProfile';
import {
  computeAnalytics,
  type AnalyticsData,
  type Invoice as CoreInvoice,
  type StockItem as CoreStockItem,
} from '../utils/analytics';

// Renderer-side shapes returned by window.api
type RendererInvoice = {
  id: number;
  number: string;
  supplierName?: string;
  customerName?: string;
  total: number;
  createdAt: string;
  invoiceDate?: string;
  address?: string;
  totalQty?: number;
};

type RendererStockItem = {
  id: number;
  code: string;
  name: string;
  purchaseRate?: number;
  purchaseQty?: number;
  qty?: number;
  saleRate?: number;
  saleQty?: number;
  createdAt?: string;
};

type Ctx = {
  analytics: AnalyticsData | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>; // user-initiated
};

const AnalyticsContext = createContext<Ctx>({} as any);

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const profileId = useActiveProfile();

  // Gate everything behind this flag
  const [enabled, setEnabled] = useState(false);

  const [purchases, setPurchases] = useState<RendererInvoice[]>([]);
  const [sales, setSales] = useState<RendererInvoice[]>([]);
  const [stock, setStock] = useState<RendererStockItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadingRef = useRef(false);

  const loadAllData = useCallback(async () => {
    if (!profileId) {
      setError('No active profile');
      return;
    }
    if (loadingRef.current) return;

    loadingRef.current = true;
    try {
      setLoading(true);
      setError(null);

      const [purchaseData, saleData, stockData] = await Promise.all([
        window.api.invoices.list(profileId),
        window.api.saleInvoices.list(profileId),
        window.api.stock.list(profileId),
      ]);

      setPurchases((purchaseData ?? []) as RendererInvoice[]);
      setSales((saleData ?? []) as RendererInvoice[]);
      setStock((stockData ?? []) as RendererStockItem[]);
    } catch (err: any) {
      console.error('Failed to load analytics data:', err);
      setError(err?.message || 'Failed to load analytics data');
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [profileId]);

  // Do NOT auto-load on mount/profile change.
  // Only load when user presses the button (refresh sets enabled=true).
  useEffect(() => {
    if (!enabled) return;
    void loadAllData();
  }, [enabled, loadAllData, profileId]);

  // Reset when profile switches; require button press again
  useEffect(() => {
    const onSwitch = () => {
      setEnabled(false);
      setPurchases([]);
      setSales([]);
      setStock([]);
    };
    window.addEventListener('profile:switched', onSwitch as EventListener);
    return () => {
      window.removeEventListener('profile:switched', onSwitch as EventListener);
    };
  }, []);

  // Normalize renderer shapes to analytics core types
  function toCoreInvoices(list: RendererInvoice[], kind: 'purchase' | 'sale'): CoreInvoice[] {
    return list.map((inv) => ({
      id: inv.id,
      number: inv.number,
      supplierName:
        kind === 'purchase'
          ? inv.supplierName ?? inv.customerName ?? 'Unknown'
          : inv.supplierName ?? inv.customerName ?? 'Unknown',
      customerName: inv.customerName ?? inv.supplierName ?? 'Unknown',
      total: inv.total ?? 0,
      createdAt: inv.createdAt,
      invoiceDate: inv.invoiceDate,
      address: inv.address,
      totalQty: inv.totalQty,
    }));
  }

  function toCoreStock(list: RendererStockItem[]): CoreStockItem[] {
    return list.map((s) => ({
      id: s.id,
      code: s.code,
      name: s.name,
      purchaseRate: s.purchaseRate ?? 0,
      purchaseQty: (s.purchaseQty ?? s.qty ?? 0) as number,
      saleRate: s.saleRate ?? 0,
      saleQty: s.saleQty ?? 0,
      createdAt: s.createdAt ?? new Date().toISOString(),
    }));
  }

  // Compute only when enabled
  const analytics: AnalyticsData | null = React.useMemo(() => {
    if (!enabled || loading || !profileId) return null;
    try {
      const purchasesCore = toCoreInvoices(purchases, 'purchase');
      const salesCore = toCoreInvoices(sales, 'sale');
      const stockCore = toCoreStock(stock);
      return computeAnalytics(purchasesCore, salesCore, stockCore);
    } catch (err) {
      console.error('Analytics computation error:', err);
      return null;
    }
  }, [enabled, purchases, sales, stock, loading, profileId]);

  // Button handler from Analytics page
  const refresh = useCallback(async () => {
    if (!enabled) setEnabled(true);
    await loadAllData();
  }, [enabled, loadAllData]);

  const value: Ctx = { analytics, loading, error, refresh };
  return <AnalyticsContext.Provider value={value}>{children}</AnalyticsContext.Provider>;
}

export function useAnalytics() {
  return useContext(AnalyticsContext);
}
