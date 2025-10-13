import {useEffect, useState, useMemo} from 'react';
import {
  computeAnalytics,
  type AnalyticsData,
  type Invoice,
  type StockItem,
} from '../../utils/analytics';

export function useAnalytics() {
  const [purchaseInvoices, setPurchaseInvoices] = useState<Invoice[]>([]);
  const [saleInvoices, setSaleInvoices] = useState<Invoice[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAllData();
  }, []);

  async function loadAllData() {
    try {
      setLoading(true);
      setError(null);

      const [purchases, sales, stock] = await Promise.all([
        window.api?.invoices.list(), // ✅ Fixed: invoices (plural)
        window.api?.sales.list(), // ✅ Fixed: sales
        window.api?.stock.list(),
      ]);

      setPurchaseInvoices(purchases || []);
      setSaleInvoices(sales || []);
      setStockItems(stock || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load analytics data');
      console.error('Analytics load error:', err);
    } finally {
      setLoading(false);
    }
  }

  const analytics: AnalyticsData | null = useMemo(() => {
    if (loading) return null;
    try {
      return computeAnalytics(purchaseInvoices, saleInvoices, stockItems);
    } catch (err) {
      console.error('Analytics computation error:', err);
      return null;
    }
  }, [purchaseInvoices, saleInvoices, stockItems, loading]);

  return {
    analytics,
    loading,
    error,
    refresh: loadAllData,
    rawData: {
      purchaseInvoices,
      saleInvoices,
      stockItems,
    },
  };
}
