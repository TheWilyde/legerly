import {useState} from 'react';
import type {ReactNode} from 'react';
import {FiBarChart2, FiRefreshCw} from 'react-icons/fi';
import PageHeader from '../components/common/PageHeader';
import LoadingSpinner from '../components/common/LoadingSpinner';
import {useAnalytics} from '../contexts/AnalyticsContext';
import MetricCard from '../components/analytics/MetricCard';
import LineChart from '../components/charts/LineChart';
import BarChart from '../components/charts/BarChart';
import TopList from '../components/analytics/TopList';

export default function Analytics() {
  const {analytics, loading, refresh, showPurchasePriceCard} = useAnalytics();
  const [activeTab, setActiveTab] = useState<
    'overview' | 'sales' | 'purchases' | 'stock' | 'profit'
  >('overview');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader title="Analytics & Reports">
          <button
            onClick={refresh}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-neutral-900 text-white rounded-lg hover:bg-neutral-800 disabled:opacity-50 transition-colors">
            <FiRefreshCw
              className={`size-5 ${loading ? 'animate-spin' : ''}`}
            />
            {loading
              ? 'Calculating...'
              : analytics
                ? 'Recalculate'
                : 'Calculate Analytics'}
          </button>
        </PageHeader>
      </div>

      {loading && (
        <div className="bg-white rounded-lg border border-neutral-200 p-6">
          <div className="flex flex-col items-center justify-center">
            <LoadingSpinner message="Loading detailed analytics..." />
          </div>
        </div>
      )}

      {!analytics && !loading && (
        <div className="bg-white rounded-lg border border-neutral-200 p-12 text-center">
          <FiBarChart2 className="size-16 mx-auto mb-4 text-neutral-300" />
          <h3 className="text-lg font-semibold text-neutral-900 mb-2">
            No Analytics Data
          </h3>
          <p className="text-neutral-600 mb-4">
            Click "Calculate Analytics" to generate detailed reports and
            insights
          </p>
        </div>
      )}

      {analytics && (
        <>
          <div className="bg-white rounded-lg border border-neutral-200 p-1 flex gap-1">
            <TabButton
              active={activeTab === 'overview'}
              onClick={() => setActiveTab('overview')}>
              Overview
            </TabButton>
            <TabButton
              active={activeTab === 'sales'}
              onClick={() => setActiveTab('sales')}>
              Sales
            </TabButton>
            <TabButton
              active={activeTab === 'purchases'}
              onClick={() => setActiveTab('purchases')}>
              Purchases
            </TabButton>
            <TabButton
              active={activeTab === 'stock'}
              onClick={() => setActiveTab('stock')}>
              Stock
            </TabButton>
            <TabButton
              active={activeTab === 'profit'}
              onClick={() => setActiveTab('profit')}>
              Profitability
            </TabButton>
          </div>

          {activeTab === 'overview' && (
            <OverviewTab
              analytics={analytics}
              onTabChange={setActiveTab}
              showPurchasePriceCard={showPurchasePriceCard}
            />
          )}
          {activeTab === 'sales' && <SalesTab analytics={analytics} />}
          {activeTab === 'purchases' && <PurchasesTab analytics={analytics} />}
          {activeTab === 'stock' && <StockTab analytics={analytics} />}
          {activeTab === 'profit' && <ProfitabilityTab analytics={analytics} />}
        </>
      )}
    </div>
  );
}

/* Simple local TabButton to avoid additional imports */
function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm rounded ${
        active
          ? 'bg-blue-600 text-white'
          : 'text-neutral-700 hover:bg-neutral-50'
      }`}>
      {children}
    </button>
  );
}

/* Minimal tab panels using existing components - adjust fields to match your Analytics shape */
function OverviewTab({
  analytics,
  onTabChange,
  showPurchasePriceCard,
}: {
  analytics: any;
  onTabChange: (
    tab: 'overview' | 'sales' | 'purchases' | 'stock' | 'profit',
  ) => void;
  showPurchasePriceCard: boolean;
}) {
  return (
    <div className="space-y-4">
      <div
        className={`grid gap-4 ${showPurchasePriceCard ? 'grid-cols-4' : 'grid-cols-3'}`}>
        <MetricCard
          title="Total Sales"
          value={analytics.totalSales ?? 0}
          icon="sales"
          onClick={() => onTabChange('sales')}
        />
        {showPurchasePriceCard && (
          <MetricCard
            title="Purchase Price"
            value={analytics.purchasePrice ?? 0}
            format="currency"
            icon="purchases"
            subtitle={`${analytics.saleInvoiceCount ?? 0} invoices`}
          />
        )}
        <MetricCard
          title="Total Purchases"
          value={analytics.totalPurchases ?? 0}
          icon="purchases"
          onClick={() => onTabChange('purchases')}
        />
        <MetricCard
          title="Stock Value"
          value={analytics.totalStockValue ?? 0}
          icon="stock"
          onClick={() => onTabChange('stock')}
        />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 bg-white rounded-lg border p-4">
          <LineChart
            data={analytics.monthlyTrend ?? []}
            dataKey1="sales"
            dataKey2="purchases"
          />
        </div>
        <div className="bg-white rounded-lg border p-4">
          <TopList items={analytics.topItems ?? []} />
        </div>
      </div>
    </div>
  );
}

function SalesTab({analytics}: {analytics: any}) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="bg-white rounded-lg border p-4">
        <BarChart data={analytics.salesByCategory ?? []} dataKey="value" />
      </div>
      <div className="bg-white rounded-lg border p-4">
        <TopList items={analytics.topCustomers ?? []} />
      </div>
    </div>
  );
}

function PurchasesTab({analytics}: {analytics: any}) {
  return (
    <div className="bg-white rounded-lg border p-4">
      <TopList items={analytics.topSuppliers ?? []} />
    </div>
  );
}

function StockTab({analytics}: {analytics: any}) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="bg-white rounded-lg border p-4">
        <TopList items={analytics.lowStockItems ?? []} />
      </div>
      <div className="bg-white rounded-lg border p-4">
        <MetricCard
          title="Total Stock Items"
          value={analytics.totalStockItems ?? 0}
          icon="stock"
        />
      </div>
    </div>
  );
}

function ProfitabilityTab({analytics}: {analytics: any}) {
  return (
    <div className="bg-white rounded-lg border p-4">
      <LineChart data={analytics.profitTrend ?? []} dataKey1="profit" />
    </div>
  );
}
