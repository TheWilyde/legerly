// ✅ Export all types at the top
export type Invoice = {
  id: number;
  number: string;
  supplierName: string;
  customerName?: string;
  total: number;
  createdAt: string;
  address?: string;
  invoiceDate?: string;
  totalQty?: number;
};

export type StockItem = {
  id: number;
  code: string;
  name: string;
  purchaseRate: number;
  purchaseQty: number;
  saleRate: number;
  saleQty: number;
  createdAt: string;
};

export type AnalyticsData = {
  totalPurchases: number;
  totalSales: number;
  totalStockValue: number;
  totalStockValueAtSaleRate: number;
  grossProfit: number;
  grossMargin: number;
  profitMargin: number; // ✅ Added (alias for grossMargin)
  stockValue: number; // ✅ Added (alias for totalStockValue)
  totalStockItems: number; // ✅ Added (alias for stockItemCount)
  purchaseInvoiceCount: number;
  saleInvoiceCount: number;
  stockItemCount: number;
  avgPurchaseInvoiceValue: number;
  avgSaleInvoiceValue: number;
  topCustomers: Array<{name: string; total: number; count: number}>;
  topSuppliers: Array<{name: string; total: number; count: number}>;
  topSellingItems: Array<{
    code: string;
    name: string;
    saleQty: number;
    saleRate: number;
  }>;
  mostProfitableItems: Array<{
    code: string;
    name: string;
    profit: number;
    margin: number;
  }>;
  fastMovingItems: Array<{
    code: string;
    name: string;
    purchaseQty: number;
    saleQty: number;
    turnover: number;
  }>;
  slowMovingItems: Array<{
    code: string;
    name: string;
    purchaseQty: number;
    saleQty: number;
    turnover: number;
  }>;
  lowStockAlerts: Array<{
    code: string;
    name: string;
    inStock: number;
    purchaseRate: number;
  }>;
  stockAlerts: Array<{
    // ✅ Added (alias for lowStockAlerts)
    code: string;
    name: string;
    inStock: number;
    purchaseRate?: number;
  }>;
  outOfStockItems: Array<{
    code: string;
    name: string;
    inStock: number;
  }>;
  stockTurnoverRatio: number;
  monthlyPurchases: Array<{month: string; total: number; count: number}>;
  monthlySales: Array<{month: string; total: number; count: number}>;
  monthlyProfit: Array<{month: string; profit: number; margin: number}>;
  monthlyTrend: Array<{
    // ✅ Added - Combined monthly data for charts
    month: string;
    sales: number;
    purchases: number;
    profit: number;
  }>;
  itemProfitability: Array<{
    code: string;
    name: string;
    totalProfit: number;
    profitMargin: number;
    contribution: number;
  }>;
};

// ✅ Main analytics computation function
export function computeAnalytics(
  purchases: Invoice[],
  sales: Invoice[],
  stock: StockItem[]
): AnalyticsData {
  // ✅ Only log in development mode AND only once per second
  const isDev = import.meta.env.DEV; // ✅ Use Vite's env check
  if (isDev) console.time('Analytics Computation');

  // ✅ Early return for empty data
  if (purchases.length === 0 && sales.length === 0 && stock.length === 0) {
    if (isDev) console.timeEnd('Analytics Computation');
    return getEmptyAnalytics();
  }

  // ✅ Single pass for invoice totals and customer/supplier mapping
  let totalPurchases = 0;
  let totalSales = 0;
  const customerMap = new Map<string, {total: number; count: number}>();
  const supplierMap = new Map<string, {total: number; count: number}>();

  for (const inv of purchases) {
    totalPurchases += inv.total;
    const name = inv.supplierName || 'Unknown';
    const current = supplierMap.get(name);
    if (current) {
      current.total += inv.total;
      current.count++;
    } else {
      supplierMap.set(name, {total: inv.total, count: 1});
    }
  }

  for (const inv of sales) {
    totalSales += inv.total;
    const name = inv.customerName || inv.supplierName || 'Unknown';
    const current = customerMap.get(name);
    if (current) {
      current.total += inv.total;
      current.count++;
    } else {
      customerMap.set(name, {total: inv.total, count: 1});
    }
  }

  // ✅ Calculate stock metrics in single pass
  let totalStockValue = 0;
  let totalStockValueAtSaleRate = 0;
  let totalCOGS = 0;

  const stockWithMetrics = stock.map((item) => {
    const inStock = item.purchaseQty - item.saleQty;
    const stockValue = item.purchaseRate * inStock;
    const stockValueAtSale = item.saleRate * inStock;
    const cogs = item.purchaseRate * item.saleQty;

    totalStockValue += stockValue;
    totalStockValueAtSaleRate += stockValueAtSale;
    totalCOGS += cogs;

    const profit = (item.saleRate - item.purchaseRate) * item.saleQty;
    const margin =
      item.saleRate > 0
        ? ((item.saleRate - item.purchaseRate) / item.saleRate) * 100
        : 0;
    const turnover = item.purchaseQty > 0 ? item.saleQty / item.purchaseQty : 0;

    return {
      ...item,
      inStock,
      profit,
      margin,
      turnover,
    };
  });

  const grossProfit = totalSales - totalPurchases;
  const grossMargin = totalSales > 0 ? (grossProfit / totalSales) * 100 : 0;

  const purchaseInvoiceCount = purchases.length;
  const saleInvoiceCount = sales.length;
  const stockItemCount = stock.length;

  const avgPurchaseInvoiceValue =
    purchaseInvoiceCount > 0 ? totalPurchases / purchaseInvoiceCount : 0;
  const avgSaleInvoiceValue =
    saleInvoiceCount > 0 ? totalSales / saleInvoiceCount : 0;

  // ✅ Use partial sort for top N items (faster than full sort)
  const topCustomers = partialSort(
    Array.from(customerMap, ([name, data]) => ({name, ...data})),
    (a, b) => b.total - a.total,
    10
  );

  const topSuppliers = partialSort(
    Array.from(supplierMap, ([name, data]) => ({name, ...data})),
    (a, b) => b.total - a.total,
    10
  );

  const topSellingItems = partialSort(
    stockWithMetrics,
    (a, b) => b.saleQty - a.saleQty,
    10
  );

  const mostProfitableItems = partialSort(
    stockWithMetrics,
    (a, b) => b.profit - a.profit,
    10
  );

  const fastMovingItems = stockWithMetrics
    .filter((item) => item.turnover > 0.5 && item.purchaseQty > 0)
    .sort((a, b) => b.turnover - a.turnover)
    .slice(0, 10);

  const slowMovingItems = stockWithMetrics
    .filter((item) => item.turnover < 0.3 && item.purchaseQty > 0)
    .sort((a, b) => a.turnover - b.turnover)
    .slice(0, 10);

  const lowStockAlerts = stockWithMetrics
    .filter((item) => item.inStock > 0 && item.inStock <= 10)
    .sort((a, b) => a.inStock - b.inStock)
    .slice(0, 10);

  const outOfStockItems = stockWithMetrics
    .filter((item) => item.inStock <= 0)
    .slice(0, 10);

  const stockTurnoverRatio =
    totalStockValue > 0 ? totalCOGS / totalStockValue : 0;

  // Monthly trends
  const monthlyPurchases = getMonthlyTrend(purchases);
  const monthlySales = getMonthlyTrend(sales);
  const monthlyProfit = getMonthlyProfitTrend(purchases, sales);

  // ✅ Build monthlyTrend by combining sales and purchases
  const monthlyTrend = buildMonthlyTrend(
    monthlyPurchases,
    monthlySales,
    monthlyProfit
  );

  // ✅ Calculate item profitability
  const totalProfit = stockWithMetrics.reduce(
    (sum, item) => sum + item.profit,
    0
  );

  const itemProfitability = stockWithMetrics
    .map((item) => {
      const contribution =
        totalProfit > 0 ? (item.profit / totalProfit) * 100 : 0;
      return {
        code: item.code,
        name: item.name,
        totalProfit: item.profit,
        profitMargin: item.margin,
        contribution,
      };
    })
    .sort((a, b) => b.totalProfit - a.totalProfit);

  if (isDev) console.timeEnd('Analytics Computation');

  return {
    totalPurchases,
    totalSales,
    totalStockValue,
    totalStockValueAtSaleRate,
    grossProfit,
    grossMargin,
    profitMargin: grossMargin,
    stockValue: totalStockValue,
    totalStockItems: stockItemCount,
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
    stockAlerts: lowStockAlerts,
    outOfStockItems,
    stockTurnoverRatio,
    monthlyPurchases,
    monthlySales,
    monthlyProfit,
    monthlyTrend,
    itemProfitability, // ✅ Now properly computed
  };
}

// ✅ Helper to build combined monthly trend
function buildMonthlyTrend(
  purchases: Array<{month: string; total: number}>,
  sales: Array<{month: string; total: number}>,
  profit: Array<{month: string; profit: number}>
): Array<{month: string; sales: number; purchases: number; profit: number}> {
  const monthMap = new Map<
    string,
    {sales: number; purchases: number; profit: number}
  >();

  for (const p of purchases) {
    monthMap.set(p.month, {sales: 0, purchases: p.total, profit: 0});
  }

  for (const s of sales) {
    const existing = monthMap.get(s.month);
    if (existing) {
      existing.sales = s.total;
    } else {
      monthMap.set(s.month, {sales: s.total, purchases: 0, profit: 0});
    }
  }

  for (const pr of profit) {
    const existing = monthMap.get(pr.month);
    if (existing) {
      existing.profit = pr.profit;
    }
  }

  return Array.from(monthMap, ([month, data]) => ({
    month,
    ...data,
  })).sort((a, b) => a.month.localeCompare(b.month));
}

// ✅ Partial sort - only sort top K items (O(n*k) instead of O(n log n))
function partialSort<T>(
  arr: T[],
  compareFn: (a: T, b: T) => number,
  k: number
): T[] {
  if (arr.length <= k) {
    return arr.sort(compareFn);
  }

  const result = arr.slice(0, k);
  result.sort(compareFn);

  for (let i = k; i < arr.length; i++) {
    if (compareFn(arr[i], result[k - 1]) < 0) {
      result[k - 1] = arr[i];
      let j = k - 1;
      while (j > 0 && compareFn(result[j], result[j - 1]) < 0) {
        [result[j], result[j - 1]] = [result[j - 1], result[j]];
        j--;
      }
    }
  }

  return result;
}

function getEmptyAnalytics(): AnalyticsData {
  return {
    totalPurchases: 0,
    totalSales: 0,
    totalStockValue: 0,
    totalStockValueAtSaleRate: 0,
    grossProfit: 0,
    grossMargin: 0,
    profitMargin: 0, // ✅ Added
    stockValue: 0, // ✅ Added
    totalStockItems: 0, // ✅ Added
    purchaseInvoiceCount: 0,
    saleInvoiceCount: 0,
    stockItemCount: 0,
    avgPurchaseInvoiceValue: 0,
    avgSaleInvoiceValue: 0,
    topCustomers: [],
    topSuppliers: [],
    topSellingItems: [],
    mostProfitableItems: [],
    fastMovingItems: [],
    slowMovingItems: [],
    lowStockAlerts: [],
    stockAlerts: [], // ✅ Added
    outOfStockItems: [],
    stockTurnoverRatio: 0,
    monthlyPurchases: [],
    monthlySales: [],
    monthlyProfit: [],
    monthlyTrend: [], // ✅ Added
    itemProfitability: [],
  };
}

function getMonthlyTrend(
  invoices: Invoice[]
): Array<{month: string; total: number; count: number}> {
  const monthMap = new Map<string, {total: number; count: number}>();

  for (const inv of invoices) {
    const date = new Date(inv.createdAt);
    const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
      2,
      '0'
    )}`;
    const current = monthMap.get(month);
    if (current) {
      current.total += inv.total;
      current.count++;
    } else {
      monthMap.set(month, {total: inv.total, count: 1});
    }
  }

  return Array.from(monthMap, ([month, data]) => ({month, ...data})).sort(
    (a, b) => a.month.localeCompare(b.month)
  );
}

function getMonthlyProfitTrend(
  purchases: Invoice[],
  sales: Invoice[]
): Array<{month: string; profit: number; margin: number}> {
  const monthMap = new Map<
    string,
    {purchases: number; sales: number; profit: number; margin: number}
  >();

  for (const inv of purchases) {
    const date = new Date(inv.createdAt);
    const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
      2,
      '0'
    )}`;
    const current = monthMap.get(month);
    if (current) {
      current.purchases += inv.total;
    } else {
      monthMap.set(month, {
        purchases: inv.total,
        sales: 0,
        profit: 0,
        margin: 0,
      });
    }
  }

  for (const inv of sales) {
    const date = new Date(inv.createdAt);
    const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
      2,
      '0'
    )}`;
    const current = monthMap.get(month);
    if (current) {
      current.sales += inv.total;
    } else {
      monthMap.set(month, {
        purchases: 0,
        sales: inv.total,
        profit: 0,
        margin: 0,
      });
    }
  }

  return Array.from(monthMap, ([month, data]) => {
    const profit = data.sales - data.purchases;
    const margin = data.sales > 0 ? (profit / data.sales) * 100 : 0;
    return {month, profit, margin};
  }).sort((a, b) => a.month.localeCompare(b.month));
}
