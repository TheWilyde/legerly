export type Invoice = {
  id: number;
  number: string;
  supplierName: string;
  customerName?: string;
  total: number;
  createdAt: string;
  invoiceDate?: string;
  address?: string;
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
};

export type AnalyticsData = {
  totalPurchases: number;
  totalSales: number;
  totalStockValue: number;
  totalStockValueAtSaleRate: number;
  grossProfit: number;
  grossMargin: number;
  purchaseInvoiceCount: number;
  saleInvoiceCount: number;
  stockItemCount: number;
  avgPurchaseInvoiceValue: number;
  avgSaleInvoiceValue: number;
  topCustomers: Array<{name: string; total: number; count: number}>;
  topSuppliers: Array<{name: string; total: number; count: number}>;
  topSellingItems: Array<
    StockItem & {
      inStock: number;
      profit: number;
      margin: number;
      turnover: number;
    }
  >;
  mostProfitableItems: Array<
    StockItem & {
      inStock: number;
      profit: number;
      margin: number;
      turnover: number;
    }
  >;
  fastMovingItems: Array<
    StockItem & {
      inStock: number;
      profit: number;
      margin: number;
      turnover: number;
    }
  >;
  slowMovingItems: Array<
    StockItem & {
      inStock: number;
      profit: number;
      margin: number;
      turnover: number;
    }
  >;
  lowStockAlerts: Array<
    StockItem & {
      inStock: number;
      profit: number;
      margin: number;
      turnover: number;
    }
  >;
  outOfStockItems: Array<
    StockItem & {
      inStock: number;
      profit: number;
      margin: number;
      turnover: number;
    }
  >;
  stockTurnoverRatio: number;
  monthlyPurchases: Array<{month: string; total: number; count: number}>;
  monthlySales: Array<{month: string; total: number; count: number}>;
  monthlyProfit: Array<{month: string; profit: number; margin: number}>;
  itemProfitability: Array<{
    code: string;
    name: string;
    totalProfit: number;
    profitMargin: number;
    contribution: number;
  }>;
};
