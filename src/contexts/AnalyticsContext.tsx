import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
} from 'react';
import {useActiveProfile} from '../hooks/useActiveProfile';
import {usePeriod} from './PeriodContext';

interface RendererInvoice {
  id: number;
  total: number;
  invoiceDate?: string;
  createdAt: string;
  items?: RendererInvoiceItem[];
}

interface RendererInvoiceItem {
  code: string;
  name: string;
  rate: number;
  qty: number;
}

interface RendererStockItem {
  code: string;
  name: string;
  purchaseRate?: number;
  purchaseQty?: number;
  saleRate?: number;
  saleQty?: number;
}

interface Analytics {
  totalPurchases: number;
  totalSales: number;
  purchasePrice: number;
  grossProfit: number;
  grossMargin: number;
  totalStockValue: number;
  stockItemCount: number;
  purchaseInvoiceCount: number;
  saleInvoiceCount: number;
  monthlyTrend: Array<{
    month: string;
    purchases: number;
    sales: number;
    profit: number;
  }>;
  topSellingItems: Array<{
    code: string;
    name: string;
    saleQty: number;
    saleRate: number;
  }>;
  lowStockAlerts: Array<{
    code: string;
    name: string;
    inStock: number;
  }>;
}

interface AnalyticsContextValue {
  analytics: Analytics | null;
  showPurchasePriceCard: boolean;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const AnalyticsContext = createContext<AnalyticsContextValue | undefined>(
  undefined,
);

export function AnalyticsProvider({children}: {children: React.ReactNode}) {
  const profileId = useActiveProfile();
  const {selectedPeriod} = usePeriod();

  const [purchases, setPurchases] = useState<RendererInvoice[]>([]);
  const [sales, setSales] = useState<RendererInvoice[]>([]);
  const [stock, setStock] = useState<RendererStockItem[]>([]);
  const [showPurchasePriceCard, setShowPurchasePriceCard] =
    useState<boolean>(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadingRef = useRef(false);

  const loadAllData = useCallback(async () => {
    if (!profileId || !selectedPeriod) {
      // ✅ FIX: Clear data when no profile
      setPurchases([]);
      setSales([]);
      setStock([]);
      setError(null);
      return;
    }
    if (loadingRef.current) return;

    loadingRef.current = true;
    try {
      setLoading(true);
      setError(null);

      const periodId = selectedPeriod.id;
      const filters = {
        startDate: selectedPeriod.startDate,
        endDate: selectedPeriod.endDate,
        periodId,
      };

      const [purchaseData, saleData, stockData] = await Promise.all([
        window.api.invoices.list(profileId, filters),
        window.api.saleInvoices.list(profileId, filters),
        window.api.stock.list(profileId, periodId ? {periodId} : undefined),
      ]);

      const saleDetails = await Promise.all(
        (saleData || []).map(async (invoice) => {
          try {
            const detail = await window.api.saleInvoices.get(
              profileId,
              invoice.id,
            );
            return {
              ...invoice,
              items: detail?.items ?? [],
            };
          } catch {
            return {
              ...invoice,
              items: [],
            };
          }
        }),
      );

      // ✅ FIX: Set data directly, no need to fetch details for basic analytics
      setPurchases(purchaseData || []);
      setSales(saleDetails || []);
      setStock(stockData || []);
    } catch (err) {
      console.error(
        'AnalyticsContext.tsx: Failed to load analytics data:',
        err,
      );
      setError(err instanceof Error ? err.message : 'Unknown error');
      // ✅ FIX: Clear data on error
      setPurchases([]);
      setSales([]);
      setStock([]);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [profileId, selectedPeriod]);

  // ✅ FIX: Load data when profileId changes
  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  // Keep analytics settings in sync with current profile settings
  useEffect(() => {
    if (!profileId) {
      setShowPurchasePriceCard(false);
      return;
    }

    const settingsKey = `settings:${profileId}`;
    const stored = localStorage.getItem(settingsKey);
    if (!stored) {
      setShowPurchasePriceCard(false);
      return;
    }

    try {
      const parsed = JSON.parse(stored);
      setShowPurchasePriceCard(
        parsed?.systemPreferences?.showPurchasePriceCard === true,
      );
    } catch {
      setShowPurchasePriceCard(false);
    }
  }, [profileId]);

  useEffect(() => {
    const handleSettingsChanged = (event: Event) => {
      const customEvent = event as CustomEvent;
      setShowPurchasePriceCard(
        customEvent.detail?.systemPreferences?.showPurchasePriceCard === true,
      );
    };

    window.addEventListener('settings:changed', handleSettingsChanged);
    return () => {
      window.removeEventListener('settings:changed', handleSettingsChanged);
    };
  }, []);

  // ✅ FIX: Listen for invalidation events to refresh data
  useEffect(() => {
    const handleInvalidate = () => {
      loadAllData();
    };

    window.addEventListener('analytics:invalidate', handleInvalidate);
    window.addEventListener('stock:changed', handleInvalidate);
    window.addEventListener('invoice:changed', handleInvalidate);

    return () => {
      window.removeEventListener('analytics:invalidate', handleInvalidate);
      window.removeEventListener('stock:changed', handleInvalidate);
      window.removeEventListener('invoice:changed', handleInvalidate);
    };
  }, [loadAllData]);

  // ✅ Compute analytics from current data
  const analytics = React.useMemo<Analytics | null>(() => {
    // ✅ FIX: Return null only if ALL data is empty AND we're not loading
    if (purchases.length === 0 && sales.length === 0 && stock.length === 0) {
      return null;
    }

    const totalPurchases = purchases.reduce(
      (sum, inv) => sum + (inv.total || 0),
      0,
    );
    const totalSales = sales.reduce((sum, inv) => sum + (inv.total || 0), 0);

    // Calculate purchase price (COGS) from items sold in sale invoices
    let purchasePrice = 0;
    sales.forEach((inv) => {
      if (inv.items) {
        inv.items.forEach((item) => {
          const purchaseRate =
            stock.find((s) => s.code === item.code)?.purchaseRate || 0;
          purchasePrice += purchaseRate * item.qty || 0;
        });
      }
    });

    const grossProfit =
      totalSales - (showPurchasePriceCard ? purchasePrice : totalPurchases);
    const grossMargin = totalSales > 0 ? (grossProfit / totalSales) * 100 : 0;

    // Calculate stock value
    let totalStockValue = 0;
    const stockWithMetrics = stock.map((item: any) => {
      // FIX: Use item.purchaseQty or fallback to item.qty (legacy/CSV)
      const purchaseQty = Number(item.purchaseQty ?? item.qty ?? 0);
      const saleQty = Number(item.saleQty || 0);
      const purchaseRate = Number(item.purchaseRate || 0);
      const saleRate = Number(item.saleRate || 0);

      // FIX: User requested to include negative values in total
      const inStock = purchaseQty - saleQty;
      const value = purchaseRate * inStock;

      totalStockValue += value;
      return {
        ...item,
        inStock,
        saleQty,
        saleRate,
      };
    });

    // Monthly trend
    const monthlyTrend = calculateMonthlyTrend(purchases, sales, stock);

    // Top selling items
    const topSellingItems = [...stockWithMetrics]
      .filter((item) => item.saleQty > 0)
      .sort((a, b) => b.saleQty - a.saleQty)
      .slice(0, 5)
      .map((item) => ({
        code: item.code,
        name: item.name,
        saleQty: item.saleQty,
        saleRate: item.saleRate,
      }));

    // Low stock alerts
    const lowStockAlerts = stockWithMetrics
      .filter((item) => item.inStock > 0 && item.inStock <= 10)
      .sort((a, b) => a.inStock - b.inStock)
      .slice(0, 5)
      .map((item) => ({
        code: item.code,
        name: item.name,
        inStock: item.inStock,
      }));

    return {
      totalPurchases,
      totalSales,
      purchasePrice,
      grossProfit,
      grossMargin,
      totalStockValue,
      stockItemCount: stock.length,
      purchaseInvoiceCount: purchases.length,
      saleInvoiceCount: sales.length,
      monthlyTrend,
      topSellingItems,
      lowStockAlerts,
    };
  }, [purchases, sales, stock, showPurchasePriceCard]);

  return (
    <AnalyticsContext.Provider
      value={{
        analytics,
        showPurchasePriceCard,
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

// Helper function to calculate monthly trend
function calculateMonthlyTrend(
  purchases: RendererInvoice[],
  sales: RendererInvoice[],
  _stock: RendererStockItem[],
) {
  const monthMap = new Map<string, {purchases: number; sales: number}>();

  purchases.forEach((inv) => {
    const date = inv.invoiceDate || inv.createdAt;
    if (date) {
      const month = date.substring(0, 7); // YYYY-MM
      const current = monthMap.get(month) || {purchases: 0, sales: 0};
      current.purchases += inv.total || 0;
      monthMap.set(month, current);
    }
  });

  sales.forEach((inv) => {
    const date = inv.invoiceDate || inv.createdAt;
    if (date) {
      const month = date.substring(0, 7);
      const current = monthMap.get(month) || {purchases: 0, sales: 0};
      current.sales += inv.total || 0;
      monthMap.set(month, current);
    }
  });

  return Array.from(monthMap.entries())
    .map(([month, data]) => ({
      month,
      purchases: data.purchases,
      sales: data.sales,
      profit: data.sales - data.purchases,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
}
