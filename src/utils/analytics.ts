export type StockItem = {
  id: number;
  code: string;
  name: string;
  purchaseRate: number;
  purchaseQty: number;
  saleRate: number;
  saleQty: number;
};

// ✅ Fixed: Make items optional since list() doesn't include them
export type Invoice = {
  id: number;
  number: string;
  supplierName: string;
  total: number;
  createdAt: string;
  address?: string;
  invoiceDate?: string;
  totalQty?: number;
  customerName?: string;
  items?: InvoiceItem[]; // ✅ Made optional
};

export type InvoiceItem = {
  code: string;
  name: string;
  rate: number;
  qty: number;
};

export type AnalyticsData = {
  // Basic Totals
  totalPurchases: number;
  totalSales: number;
  totalStockValue: number;
  totalStockValueAtSaleRate: number;
  grossProfit: number;
  grossMargin: number;

  // Counts
  purchaseInvoiceCount: number;
  saleInvoiceCount: number;
  stockItemCount: number;

  // Averages
  avgPurchaseInvoiceValue: number;
  avgSaleInvoiceValue: number;

  // Top Performers
  topCustomers: Array<{name: string; total: number; count: number}>;
  topSuppliers: Array<{name: string; total: number; count: number}>;
  topSellingItems: Array<StockItem & {profit: number; margin: number}>;
  mostProfitableItems: Array<StockItem & {profit: number; margin: number}>;

  // Stock Analytics
  fastMovingItems: Array<StockItem & {turnover: number}>;
  slowMovingItems: Array<StockItem & {turnover: number}>;
  lowStockAlerts: Array<StockItem & {inStock: number}>;
  outOfStockItems: Array<StockItem>;
  stockTurnoverRatio: number;

  // Trends (monthly)
  monthlyPurchases: Array<{month: string; total: number; count: number}>;
  monthlySales: Array<{month: string; total: number; count: number}>;
  monthlyProfit: Array<{month: string; profit: number; margin: number}>;

  // Item-Level Profitability
  itemProfitability: Array<{
    code: string;
    name: string;
    totalProfit: number;
    profitMargin: number;
    contribution: number;
  }>;
};

export function computeAnalytics(
  purchases: Invoice[],
  sales: Invoice[],
  stock: StockItem[]
): AnalyticsData {
  // 1. Basic Totals
  const totalPurchases = purchases.reduce((sum, inv) => sum + inv.total, 0);
  const totalSales = sales.reduce((sum, inv) => sum + inv.total, 0);

  const totalStockValue = stock.reduce((sum, item) => {
    const inStock = item.purchaseQty - item.saleQty;
    return sum + item.purchaseRate * inStock;
  }, 0);

  const totalStockValueAtSaleRate = stock.reduce((sum, item) => {
    const inStock = item.purchaseQty - item.saleQty;
    return sum + item.saleRate * inStock;
  }, 0);

  const grossProfit = totalSales - totalPurchases;
  const grossMargin = totalSales > 0 ? (grossProfit / totalSales) * 100 : 0;

  // 2. Counts
  const purchaseInvoiceCount = purchases.length;
  const saleInvoiceCount = sales.length;
  const stockItemCount = stock.length;

  // 3. Averages
  const avgPurchaseInvoiceValue =
    purchaseInvoiceCount > 0 ? totalPurchases / purchaseInvoiceCount : 0;
  const avgSaleInvoiceValue =
    saleInvoiceCount > 0 ? totalSales / saleInvoiceCount : 0;

  // 4. Top Customers (from sales)
  const customerMap = new Map<string, {total: number; count: number}>();
  sales.forEach((inv) => {
    const name = inv.customerName || inv.supplierName || 'Unknown';
    const current = customerMap.get(name) || {total: 0, count: 0};
    customerMap.set(name, {
      total: current.total + inv.total,
      count: current.count + 1,
    });
  });
  const topCustomers = Array.from(customerMap.entries())
    .map(([name, data]) => ({name, ...data}))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  // 5. Top Suppliers (from purchases)
  const supplierMap = new Map<string, {total: number; count: number}>();
  purchases.forEach((inv) => {
    const name = inv.supplierName || 'Unknown';
    const current = supplierMap.get(name) || {total: 0, count: 0};
    supplierMap.set(name, {
      total: current.total + inv.total,
      count: current.count + 1,
    });
  });
  const topSuppliers = Array.from(supplierMap.entries())
    .map(([name, data]) => ({name, ...data}))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  // 6. Top Selling Items (by sale quantity)
  const topSellingItems = stock
    .map((item) => ({
      ...item,
      profit: (item.saleRate - item.purchaseRate) * item.saleQty,
      margin:
        item.saleRate > 0
          ? ((item.saleRate - item.purchaseRate) / item.saleRate) * 100
          : 0,
    }))
    .sort((a, b) => b.saleQty - a.saleQty)
    .slice(0, 10);

  // 7. Most Profitable Items
  const mostProfitableItems = stock
    .map((item) => ({
      ...item,
      profit: (item.saleRate - item.purchaseRate) * item.saleQty,
      margin:
        item.saleRate > 0
          ? ((item.saleRate - item.purchaseRate) / item.saleRate) * 100
          : 0,
    }))
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 10);

  // 8. Fast Moving Items (high turnover)
  const fastMovingItems = stock
    .map((item) => ({
      ...item,
      turnover: item.purchaseQty > 0 ? item.saleQty / item.purchaseQty : 0,
    }))
    .filter((item) => item.turnover > 0.5) // Sold >50% of purchased
    .sort((a, b) => b.turnover - a.turnover)
    .slice(0, 10);

  // 9. Slow Moving Items (low turnover)
  const slowMovingItems = stock
    .map((item) => ({
      ...item,
      turnover: item.purchaseQty > 0 ? item.saleQty / item.purchaseQty : 0,
    }))
    .filter((item) => item.turnover < 0.3 && item.purchaseQty > 0) // Sold <30%
    .sort((a, b) => a.turnover - b.turnover)
    .slice(0, 10);

  // 10. Low Stock Alerts
  const lowStockAlerts = stock
    .map((item) => ({
      ...item,
      inStock: item.purchaseQty - item.saleQty,
    }))
    .filter((item) => item.inStock > 0 && item.inStock <= 10)
    .sort((a, b) => a.inStock - b.inStock)
    .slice(0, 10);

  // 11. Out of Stock
  const outOfStockItems = stock
    .filter((item) => item.purchaseQty - item.saleQty <= 0)
    .slice(0, 10);

  // 12. Stock Turnover Ratio
  const totalCOGS = stock.reduce(
    (sum, item) => sum + item.purchaseRate * item.saleQty,
    0
  );
  const avgInventory = totalStockValue; // Simplified
  const stockTurnoverRatio = avgInventory > 0 ? totalCOGS / avgInventory : 0;

  // 13. Monthly Trends
  const monthlyPurchases = getMonthlyTrend(purchases);
  const monthlySales = getMonthlyTrend(sales);
  const monthlyProfit = getMonthlyProfitTrend(purchases, sales);

  // 14. Item-Level Profitability
  const totalProfit = stock.reduce((sum, item) => {
    return sum + (item.saleRate - item.purchaseRate) * item.saleQty;
  }, 0);

  const itemProfitability = stock
    .map((item) => {
      const profit = (item.saleRate - item.purchaseRate) * item.saleQty;
      const margin =
        item.saleRate > 0
          ? ((item.saleRate - item.purchaseRate) / item.saleRate) * 100
          : 0;
      const contribution = totalProfit > 0 ? (profit / totalProfit) * 100 : 0;
      return {
        code: item.code,
        name: item.name,
        totalProfit: profit,
        profitMargin: margin,
        contribution,
      };
    })
    .sort((a, b) => b.totalProfit - a.totalProfit);

  return {
    totalPurchases,
    totalSales,
    totalStockValue,
    totalStockValueAtSaleRate,
    grossProfit,
    grossMargin,
    purchaseInvoiceCount,
    saleInvoiceCount,
    stockItemCount,
    avgPurchaseInvoiceValue,
    avgSaleInvoiceValue,
    topCustomers,
    topSuppliers,
    topSellingItems,
    mostProfitableItems,
    fastMovingItems,
    slowMovingItems,
    lowStockAlerts,
    outOfStockItems,
    stockTurnoverRatio,
    monthlyPurchases,
    monthlySales,
    monthlyProfit,
    itemProfitability,
  };
}

function getMonthlyTrend(
  invoices: Invoice[]
): Array<{month: string; total: number; count: number}> {
  const monthMap = new Map<string, {total: number; count: number}>();

  invoices.forEach((inv) => {
    const date = new Date(inv.invoiceDate || inv.createdAt);
    const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
      2,
      '0'
    )}`;
    const current = monthMap.get(month) || {total: 0, count: 0};
    monthMap.set(month, {
      total: current.total + inv.total,
      count: current.count + 1,
    });
  });

  return Array.from(monthMap.entries())
    .map(([month, data]) => ({month, ...data}))
    .sort((a, b) => a.month.localeCompare(b.month));
}

function getMonthlyProfitTrend(
  purchases: Invoice[],
  sales: Invoice[]
): Array<{month: string; profit: number; margin: number}> {
  const purchasesByMonth = new Map<string, number>();
  const salesByMonth = new Map<string, number>();

  purchases.forEach((inv) => {
    const date = new Date(inv.invoiceDate || inv.createdAt);
    const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
      2,
      '0'
    )}`;
    purchasesByMonth.set(month, (purchasesByMonth.get(month) || 0) + inv.total);
  });

  sales.forEach((inv) => {
    const date = new Date(inv.invoiceDate || inv.createdAt);
    const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
      2,
      '0'
    )}`;
    salesByMonth.set(month, (salesByMonth.get(month) || 0) + inv.total);
  });

  const allMonths = new Set([...purchasesByMonth.keys(), ...salesByMonth.keys()]);

  return Array.from(allMonths)
    .map((month) => {
      const purchases = purchasesByMonth.get(month) || 0;
      const sales = salesByMonth.get(month) || 0;
      const profit = sales - purchases;
      const margin = sales > 0 ? (profit / sales) * 100 : 0;
      return {month, profit, margin};
    })
    .sort((a, b) => a.month.localeCompare(b.month));
}
