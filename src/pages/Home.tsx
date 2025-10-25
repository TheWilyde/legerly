import {useEffect} from 'react';
import {FiFileText, FiBox, FiTrendingUp, FiShoppingCart} from 'react-icons/fi';
import {FaRupeeSign} from 'react-icons/fa6';
import {Link} from 'react-router-dom';
import PageHeader from '../components/common/PageHeader';
import LoadingSpinner from '../components/common/LoadingSpinner';
import MetricCard from '../components/analytics/MetricCard';
import Card from '../components/analytics/Card';
import LineChart from '../components/charts/LineChart';
import TopList from '../components/analytics/TopList';
import {useAnalytics} from '../contexts/AnalyticsContext'; // ✅ Use context

export default function Home() {
  const {analytics, loading, error, refresh} = useAnalytics(); // ✅ Get from context

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleHomeClick = () => {
      refresh();
    };

    const handleInvalidate = () => {
      refresh();
    };

    try {
      window.addEventListener('home:click', handleHomeClick as EventListener);
      window.addEventListener(
        'analytics:invalidate',
        handleInvalidate as EventListener
      );
    } catch (err) {
      console.error('Failed to add event listeners:', err);
    }

    return () => {
      try {
        window.removeEventListener(
          'home:click',
          handleHomeClick as EventListener
        );
        window.removeEventListener(
          'analytics:invalidate',
          handleInvalidate as EventListener
        );
      } catch (err) {
        console.error('Failed to remove event listeners:', err);
      }
    };
  }, [refresh]);

  if (loading) {
    return (
      <div>
        <PageHeader title="Dashboard" />
        <div className="flex items-center justify-center py-12">
          <LoadingSpinner message="Loading dashboard data..." />
        </div>
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
        <div className="flex items-center justify-center py-12">
          <div className="text-neutral-500">No data available</div>
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
          subtitle={`${analytics.grossMargin.toFixed(1)}% margin`}
        />
        <MetricCard
          title="Stock Value"
          value={analytics.totalStockValue}
          format="currency"
          icon={<FiBox className="size-8 text-orange-600" />}
          subtitle={`${analytics.stockItemCount} items`}
        />
      </div>

      {/* CHARTS ROW */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Sales vs Purchases Trend">
          <LineChart
            data={analytics.monthlyTrend}
            dataKey1="sales"
            dataKey2="purchases"
            dataKey3="profit"
            label1="Sales"
            label2="Purchases"
            label3="Profit"
            color1="#10b981"
            color2="#3b82f6"
            color3="#8b5cf6"
          />
        </Card>

        <Card title="Quick Actions">
          <div className="grid grid-cols-2 gap-3">
            <Link
              to="/invoice/new"
              className="flex flex-col items-center gap-2 p-4 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors">
              <FiFileText className="size-8 text-blue-600" />
              <span className="text-sm font-medium text-blue-900">
                New Purchase
              </span>
            </Link>
            <Link
              to="/sale-invoice/new"
              className="flex flex-col items-center gap-2 p-4 bg-green-50 hover:bg-green-100 rounded-lg transition-colors">
              <FiFileText className="size-8 text-green-600" />
              <span className="text-sm font-medium text-green-900">
                New Sale
              </span>
            </Link>
            <Link
              to="/stock"
              className="flex flex-col items-center gap-2 p-4 bg-orange-50 hover:bg-orange-100 rounded-lg transition-colors">
              <FiBox className="size-8 text-orange-600" />
              <span className="text-sm font-medium text-orange-900">
                Add Stock
              </span>
            </Link>
            <Link
              to="/analytics"
              className="flex flex-col items-center gap-2 p-4 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors">
              <FiTrendingUp className="size-8 text-purple-600" />
              <span className="text-sm font-medium text-purple-900">
                View Reports
              </span>
            </Link>
          </div>
        </Card>
      </div>

      {/* LISTS ROW */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Top Selling Items">
          {analytics.topSellingItems.length > 0 ? (
            <div className="space-y-2">
              {analytics.topSellingItems.slice(0, 5).map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 bg-neutral-50 rounded-lg">
                  <div className="flex-1">
                    <p className="text-sm font-semibold">
                      {item.code} - {item.name}
                    </p>
                    <p className="text-xs text-neutral-600">
                      Sold: {item.saleQty} units
                    </p>
                  </div>
                  <div className="text-sm font-semibold text-green-600">
                    Rs. {(item.saleQty * item.saleRate).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-neutral-500">
              No sales data available
            </div>
          )}
        </Card>

        <Card title="Stock Alerts">
          {analytics.lowStockAlerts.length > 0 ? (
            <div className="space-y-2">
              {analytics.lowStockAlerts.slice(0, 5).map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 bg-orange-50 border border-orange-200 rounded-lg">
                  <div className="flex-1">
                    <p className="text-sm font-semibold">
                      {item.code} - {item.name}
                    </p>
                    <p className="text-xs text-neutral-600">
                      {item.inStock === 0
                        ? 'Out of stock'
                        : `Only ${item.inStock} left`}
                    </p>
                  </div>
                  <div
                    className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      item.inStock === 0
                        ? 'bg-red-600 text-white'
                        : 'bg-orange-600 text-white'
                    }`}>
                    {item.inStock}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-neutral-500">
              All items are well stocked
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
