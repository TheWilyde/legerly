import {FiFileText, FiBox, FiTrendingUp} from 'react-icons/fi';
import PageHeader from '../components/common/PageHeader';
import LoadingSpinner from '../components/common/LoadingSpinner';
import MetricCard from '../components/analytics/MetricCard';
import Card from '../components/analytics/Card';
import TopList from '../components/analytics/TopList';
import AlertList from '../components/analytics/AlertList';
import QuickActionCard from '../components/analytics/QuickActionCard';
import LineChart from '../components/charts/LineChart';
import {useAnalytics} from '../components/hooks/useAnalytics';

export default function Home() {
  const {analytics, loading, error, refresh} = useAnalytics();

  if (loading) {
    return (
      <div>
        <PageHeader title="Dashboard" />
        <LoadingSpinner message="Loading analytics..." />
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <PageHeader title="Dashboard" />
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <p className="text-red-600 font-medium">{error}</p>
          <button
            onClick={refresh}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div>
        <PageHeader title="Dashboard" />
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
          <p className="text-yellow-600">No analytics data available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" />

      {/* KEY METRICS ROW */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Purchases"
          value={analytics.totalPurchases}
          format="currency"
          icon={<FiFileText className="size-8 text-blue-600" />}
          subtitle={`${analytics.purchaseInvoiceCount} invoices`}
        />
        <MetricCard
          title="Total Sales"
          value={analytics.totalSales}
          format="currency"
          icon={<FiFileText className="size-8 text-green-600" />}
          subtitle={`${analytics.saleInvoiceCount} invoices`}
        />
        <MetricCard
          title="Gross Profit"
          value={analytics.grossProfit}
          format="currency"
          icon={<FiTrendingUp className="size-8 text-purple-600" />}
          trend={analytics.grossProfit >= 0 ? 'up' : 'down'}
          subtitle={`${analytics.grossMargin.toFixed(2)}% margin`}
        />
        <MetricCard
          title="Stock Value"
          value={analytics.totalStockValue}
          format="currency"
          icon={<FiBox className="size-8 text-orange-600" />}
          subtitle={`${analytics.stockItemCount} items`}
        />
      </div>

      {/* SALES VS PURCHASES TREND */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Sales vs Purchases Trend">
          {analytics.monthlySales.length > 0 ? (
            <LineChart
              data={analytics.monthlySales.map((sale, idx) => ({
                month: sale.month,
                sales: sale.total,
                purchases: analytics.monthlyPurchases[idx]?.total || 0,
              }))}
              dataKey1="sales"
              dataKey2="purchases"
              label1="Sales"
              label2="Purchases"
              color1="#10b981"
              color2="#3b82f6"
            />
          ) : (
            <div className="text-center py-8 text-neutral-500">
              No trend data available
            </div>
          )}
        </Card>

        <Card title="Profit Trend">
          {analytics.monthlyProfit.length > 0 ? (
            <LineChart
              data={analytics.monthlyProfit}
              dataKey1="profit"
              label1="Profit"
              color1="#8b5cf6"
            />
          ) : (
            <div className="text-center py-8 text-neutral-500">
              No profit data available
            </div>
          )}
        </Card>
      </div>

      {/* TOP PERFORMERS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Top Customers">
          <TopList
            items={analytics.topCustomers.slice(0, 5)}
            emptyMessage="No customer data"
          />
        </Card>

        <Card title="Top Suppliers">
          <TopList
            items={analytics.topSuppliers.slice(0, 5)}
            emptyMessage="No supplier data"
          />
        </Card>

        <Card title="Best Sellers">
          <TopList
            items={analytics.topSellingItems.slice(0, 5).map((item) => ({
              name: `${item.code} - ${item.name}`,
              total: item.saleQty * item.saleRate,
              count: item.saleQty,
            }))}
            emptyMessage="No sales data"
          />
        </Card>
      </div>

      {/* STOCK INSIGHTS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Fast Moving Items">
          {analytics.fastMovingItems.length > 0 ? (
            <div className="space-y-2">
              {analytics.fastMovingItems.slice(0, 5).map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
                  <div>
                    <p className="text-sm font-semibold text-neutral-900">
                      {item.code} - {item.name}
                    </p>
                    <p className="text-xs text-neutral-600">
                      Turnover: {(item.turnover * 100).toFixed(0)}%
                    </p>
                  </div>
                  <div className="text-sm font-semibold text-green-600">
                    Sold {item.saleQty}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-neutral-500">
              No fast moving items
            </div>
          )}
        </Card>

        <Card title="Low Stock Alerts">
          <AlertList items={analytics.lowStockAlerts.slice(0, 5)} />
        </Card>
      </div>

      {/* QUICK ACTIONS */}
      <Card title="Quick Actions">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <QuickActionCard
            title="New Purchase Invoice"
            to="/purchase-invoice/create"
            icon={<FiFileText className="size-8" />}
            bgColor="bg-blue-50"
            textColor="text-blue-600"
          />
          <QuickActionCard
            title="New Sale Invoice"
            to="/sale-invoice/create"
            icon={<FiFileText className="size-8" />}
            bgColor="bg-green-50"
            textColor="text-green-600"
          />
          <QuickActionCard
            title="Manage Stock"
            to="/stock"
            icon={<FiBox className="size-8" />}
            bgColor="bg-purple-50"
            textColor="text-purple-600"
          />
          <QuickActionCard
            title="View Analytics"
            to="/analytics"
            icon={<FiTrendingUp className="size-8" />}
            bgColor="bg-orange-50"
            textColor="text-orange-600"
          />
        </div>
      </Card>
    </div>
  );
}
