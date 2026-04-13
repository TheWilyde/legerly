import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
} from 'react';
import {useActiveProfile} from '../hooks/useActiveProfile';

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
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const AnalyticsContext = createContext<AnalyticsContextValue | undefined>(
  undefined
);

// ✅ Helper to get current month date range
function getCurrentMonthRange() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
  return {
    start: `${year}-${month}-01`,
    end: `${year}-${month}-${String(lastDay).padStart(2, '0')}`,
  };
}

export function AnalyticsProvider({children}: {children: React.ReactNode}) {
  const profileId = useActiveProfile();

  const [purchases, setPurchases] = useState<RendererInvoice[]>([]);
  const [sales, setSales] = useState<RendererInvoice[]>([]);
  const [stock, setStock] = useState<RendererStockItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadingRef = useRef(false);

  const loadAllData = useCallback(async () => {
    if (!profileId) {
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

      const currentMonth = getCurrentMonthRange();
      const filters = {
        startDate: currentMonth.start,
        endDate: currentMonth.end,
      };

      const [purchaseData, saleData, stockData] = await Promise.all([
        window.api.invoices.list(profileId, filters),
        window.api.saleInvoices.list(profileId, filters),
        window.api.stock.list(profileId),
      ]);

      // ✅ FIX: Set data directly, no need to fetch details for basic analytics
      setPurchases(purchaseData || []);
      setSales(saleData || []);
      setStock(stockData || []);
    } catch (err) {
      console.error('AnalyticsContext.tsx: Failed to load analytics data:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      // ✅ FIX: Clear data on error
      setPurchases([]);
      setSales([]);
      setStock([]);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [profileId]);

  // ✅ FIX: Load data when profileId changes
  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

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

    const totalPurchases = purchases.reduce((sum, inv) => sum + (inv.total || 0), 0);
    const totalSales = sales.reduce((sum, inv) => sum + (inv.total || 0), 0);
    const grossProfit = totalSales - totalPurchases;
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
  }, [purchases, sales, stock]);

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

// Helper function to calculate monthly trend
function calculateMonthlyTrend(
  purchases: RendererInvoice[],
  sales: RendererInvoice[],
  _stock: RendererStockItem[]
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
