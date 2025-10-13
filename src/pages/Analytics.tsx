import React, {useState} from 'react';
import PageHeader from '../components/common/PageHeader';
import LoadingSpinner from '../components/common/LoadingSpinner';
import Card from '../components/analytics/Card';
import TopList from '../components/analytics/TopList';
import MetricCard from '../components/analytics/MetricCard';
import BarChart from '../components/charts/BarChart';
import LineChart from '../components/charts/LineChart';
import {useAnalytics} from '../components/hooks/useAnalytics';
import {FiTrendingUp, FiPackage, FiDollarSign, FiBarChart2} from 'react-icons/fi';

export default function Analytics() {
  const {analytics, loading, error} = useAnalytics();
  const [activeTab, setActiveTab] = useState<'overview' | 'sales' | 'purchases' | 'stock' | 'profit'>('overview');

  if (loading) {
    return (
      <div>
        <PageHeader title="Analytics & Reports" />
        <LoadingSpinner message="Loading detailed analytics..." />
      </div>
    );
  }

  if (error || !analytics) {
    return (
      <div>
        <PageHeader title="Analytics & Reports" />
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <p className="text-red-600">{error || 'No data available'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Analytics & Reports" />

      {/* Tabs */}
      <div className="bg-white rounded-lg border border-neutral-200 p-1 flex gap-1">
        <TabButton active={activeTab === 'overview'} onClick={() => setActiveTab('overview')}>
          Overview
        </TabButton>
        <TabButton active={activeTab === 'sales'} onClick={() => setActiveTab('sales')}>
          Sales Analysis
        </TabButton>
        <TabButton active={activeTab === 'purchases'} onClick={() => setActiveTab('purchases')}>
          Purchase Analysis
        </TabButton>
        <TabButton active={activeTab === 'stock'} onClick={() => setActiveTab('stock')}>
          Stock Analysis
        </TabButton>
        <TabButton active={activeTab === 'profit'} onClick={() => setActiveTab('profit')}>
          Profitability
        </TabButton>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && <OverviewTab analytics={analytics} />}
      {activeTab === 'sales' && <SalesTab analytics={analytics} />}
      {activeTab === 'purchases' && <PurchasesTab analytics={analytics} />}
      {activeTab === 'stock' && <StockTab analytics={analytics} />}
      {activeTab === 'profit' && <ProfitabilityTab analytics={analytics} />}
    </div>
  );
}

function TabButton({active, onClick, children}: {active: boolean; onClick: () => void; children: React.ReactNode}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
        active
          ? 'bg-blue-600 text-white'
          : 'text-neutral-600 hover:bg-neutral-100'
      }`}>
      {children}
    </button>
  );
}

function OverviewTab({analytics}: {analytics: any}) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Revenue"
          value={analytics.totalSales}
          format="currency"
          icon={<FiDollarSign className="size-8 text-green-600" />}
        />
        <MetricCard
          title="Total Expenses"
          value={analytics.totalPurchases}
          format="currency"
          icon={<FiDollarSign className="size-8 text-red-600" />}
        />
        <MetricCard
          title="Net Profit"
          value={analytics.grossProfit}
          format="currency"
          icon={<FiTrendingUp className="size-8 text-purple-600" />}
        />
        <MetricCard
          title="Profit Margin"
          value={analytics.grossMargin}
          format="percentage"
          icon={<FiBarChart2 className="size-8 text-blue-600" />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Monthly Revenue & Expenses">
          <LineChart
            data={analytics.monthlySales.map((sale: any, idx: number) => ({
              month: sale.month,
              revenue: sale.total,
              expenses: analytics.monthlyPurchases[idx]?.total || 0
            }))}
            dataKey1="revenue"
            dataKey2="expenses"
            label1="Revenue"
            label2="Expenses"
            color1="#10b981"
            color2="#ef4444"
          />
        </Card>

        <Card title="Monthly Profit">
          <LineChart
            data={analytics.monthlyProfit}
            dataKey1="profit"
            label1="Profit"
            color1="#8b5cf6"
          />
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Stock Value Breakdown">
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg">
              <span className="font-medium">At Purchase Rate</span>
              <span className="font-semibold text-blue-600">
                Rs. {analytics.totalStockValue.toLocaleString('en-PK', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2
                })}
              </span>
            </div>
            <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg">
              <span className="font-medium">At Sale Rate</span>
              <span className="font-semibold text-green-600">
                Rs. {analytics.totalStockValueAtSaleRate.toLocaleString('en-PK', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2
                })}
              </span>
            </div>
            <div className="flex items-center justify-between p-4 bg-purple-50 rounded-lg">
              <span className="font-medium">Potential Profit</span>
              <span className="font-semibold text-purple-600">
                Rs. {(analytics.totalStockValueAtSaleRate - analytics.totalStockValue).toLocaleString('en-PK', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2
                })}
              </span>
            </div>
          </div>
        </Card>

        <Card title="Business Metrics">
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-neutral-50 rounded-lg">
              <span className="font-medium">Avg Purchase Invoice</span>
              <span className="font-semibold">
                Rs. {analytics.avgPurchaseInvoiceValue.toLocaleString('en-PK', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2
                })}
              </span>
            </div>
            <div className="flex items-center justify-between p-4 bg-neutral-50 rounded-lg">
              <span className="font-medium">Avg Sale Invoice</span>
              <span className="font-semibold">
                Rs. {analytics.avgSaleInvoiceValue.toLocaleString('en-PK', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2
                })}
              </span>
            </div>
            <div className="flex items-center justify-between p-4 bg-neutral-50 rounded-lg">
              <span className="font-medium">Stock Turnover Ratio</span>
              <span className="font-semibold">
                {analytics.stockTurnoverRatio.toFixed(2)}x
              </span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function SalesTab({analytics}: {analytics: any}) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard
          title="Total Sales"
          value={analytics.totalSales}
          format="currency"
        />
        <MetricCard
          title="Total Invoices"
          value={analytics.saleInvoiceCount}
          format="number"
        />
        <MetricCard
          title="Average Invoice"
          value={analytics.avgSaleInvoiceValue}
          format="currency"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Top 10 Customers">
          <TopList items={analytics.topCustomers} />
        </Card>

        <Card title="Monthly Sales Trend">
          <LineChart
            data={analytics.monthlySales}
            dataKey1="total"
            label1="Sales"
            color1="#10b981"
          />
        </Card>
      </div>

      <Card title="Top 10 Best Selling Items">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-neutral-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold">Rank</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Code</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Name</th>
                <th className="px-4 py-3 text-right text-sm font-semibold">Qty Sold</th>
                <th className="px-4 py-3 text-right text-sm font-semibold">Sale Rate</th>
                <th className="px-4 py-3 text-right text-sm font-semibold">Total Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {analytics.topSellingItems.map((item: any, idx: number) => (
                <tr key={idx} className="hover:bg-neutral-50">
                  <td className="px-4 py-3 text-sm">{idx + 1}</td>
                  <td className="px-4 py-3 text-sm font-medium">{item.code}</td>
                  <td className="px-4 py-3 text-sm">{item.name}</td>
                  <td className="px-4 py-3 text-sm text-right">{item.saleQty}</td>
                  <td className="px-4 py-3 text-sm text-right">
                    Rs. {item.saleRate.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-semibold">
                    Rs. {(item.saleQty * item.saleRate).toLocaleString('en-PK', {
                      minimumFractionDigits: 2
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function PurchasesTab({analytics}: {analytics: any}) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard
          title="Total Purchases"
          value={analytics.totalPurchases}
          format="currency"
        />
        <MetricCard
          title="Total Invoices"
          value={analytics.purchaseInvoiceCount}
          format="number"
        />
        <MetricCard
          title="Average Invoice"
          value={analytics.avgPurchaseInvoiceValue}
          format="currency"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Top 10 Suppliers">
          <TopList items={analytics.topSuppliers} />
        </Card>

        <Card title="Monthly Purchases Trend">
          <LineChart
            data={analytics.monthlyPurchases}
            dataKey1="total"
            label1="Purchases"
            color1="#3b82f6"
          />
        </Card>
      </div>
    </div>
  );
}

function StockTab({analytics}: {analytics: any}) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <MetricCard
          title="Total Items"
          value={analytics.stockItemCount}
          format="number"
          icon={<FiPackage className="size-8 text-blue-600" />}
        />
        <MetricCard
          title="Stock Value"
          value={analytics.totalStockValue}
          format="currency"
          icon={<FiDollarSign className="size-8 text-green-600" />}
        />
        <MetricCard
          title="Low Stock Items"
          value={analytics.lowStockAlerts.length}
          format="number"
          icon={<FiTrendingUp className="size-8 text-orange-600" />}
        />
        <MetricCard
          title="Out of Stock"
          value={analytics.outOfStockItems.length}
          format="number"
          icon={<FiTrendingUp className="size-8 text-red-600" />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Fast Moving Items (Top 10)">
          {analytics.fastMovingItems.length > 0 ? (
            <div className="space-y-2">
              {analytics.fastMovingItems.map((item: any, idx: number) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex-1">
                    <p className="text-sm font-semibold">{item.code} - {item.name}</p>
                    <p className="text-xs text-neutral-600">
                      Sold {item.saleQty} of {item.purchaseQty} purchased
                    </p>
                  </div>
                  <div className="text-sm font-semibold text-green-600">
                    {(item.turnover * 100).toFixed(0)}%
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-neutral-500">No data</div>
          )}
        </Card>

        <Card title="Slow Moving Items (Top 10)">
          {analytics.slowMovingItems.length > 0 ? (
            <div className="space-y-2">
              {analytics.slowMovingItems.map((item: any, idx: number) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 bg-orange-50 border border-orange-200 rounded-lg">
                  <div className="flex-1">
                    <p className="text-sm font-semibold">{item.code} - {item.name}</p>
                    <p className="text-xs text-neutral-600">
                      Sold {item.saleQty} of {item.purchaseQty} purchased
                    </p>
                  </div>
                  <div className="text-sm font-semibold text-orange-600">
                    {(item.turnover * 100).toFixed(0)}%
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-neutral-500">No data</div>
          )}
        </Card>
      </div>

      <Card title="Low Stock Alerts">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-neutral-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold">Code</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Name</th>
                <th className="px-4 py-3 text-right text-sm font-semibold">In Stock</th>
                <th className="px-4 py-3 text-right text-sm font-semibold">Purchase Rate</th>
                <th className="px-4 py-3 text-right text-sm font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {analytics.lowStockAlerts.map((item: any, idx: number) => (
                <tr key={idx} className="hover:bg-neutral-50">
                  <td className="px-4 py-3 text-sm font-medium">{item.code}</td>
                  <td className="px-4 py-3 text-sm">{item.name}</td>
                  <td className="px-4 py-3 text-sm text-right font-semibold">{item.inStock}</td>
                  <td className="px-4 py-3 text-sm text-right">Rs. {item.purchaseRate.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                      item.inStock === 0
                        ? 'bg-red-100 text-red-700'
                        : item.inStock <= 5
                        ? 'bg-orange-100 text-orange-700'
                        : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {item.inStock === 0 ? 'Out of Stock' : 'Low Stock'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function ProfitabilityTab({analytics}: {analytics: any}) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard
          title="Gross Profit"
          value={analytics.grossProfit}
          format="currency"
        />
        <MetricCard
          title="Gross Margin"
          value={analytics.grossMargin}
          format="percentage"
        />
        <MetricCard
          title="Potential Stock Profit"
          value={analytics.totalStockValueAtSaleRate - analytics.totalStockValue}
          format="currency"
        />
      </div>

      <Card title="Item-Level Profitability (Top 20)">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-neutral-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold">Rank</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Code</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Name</th>
                <th className="px-4 py-3 text-right text-sm font-semibold">Total Profit</th>
                <th className="px-4 py-3 text-right text-sm font-semibold">Margin %</th>
                <th className="px-4 py-3 text-right text-sm font-semibold">Contribution %</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {analytics.itemProfitability.slice(0, 20).map((item: any, idx: number) => (
                <tr key={idx} className="hover:bg-neutral-50">
                  <td className="px-4 py-3 text-sm">{idx + 1}</td>
                  <td className="px-4 py-3 text-sm font-medium">{item.code}</td>
                  <td className="px-4 py-3 text-sm">{item.name}</td>
                  <td className={`px-4 py-3 text-sm text-right font-semibold ${
                    item.totalProfit >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    Rs. {item.totalProfit.toLocaleString('en-PK', {
                      minimumFractionDigits: 2
                    })}
                  </td>
                  <td className="px-4 py-3 text-sm text-right">
                    {item.profitMargin.toFixed(2)}%
                  </td>
                  <td className="px-4 py-3 text-sm text-right">
                    {item.contribution.toFixed(2)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Top 10 Most Profitable Items">
        <BarChart
          data={analytics.mostProfitableItems.slice(0, 10).map((item: any) => ({
            name: item.code,
            value: item.profit
          }))}
          dataKey="value"
          nameKey="name"
          label="Profit"
          color="#10b981"
        />
      </Card>
    </div>
  );
}