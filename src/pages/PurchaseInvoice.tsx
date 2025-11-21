import {useState, useMemo, useEffect} from 'react';
import {Link} from 'react-router-dom';
import PageHeader from '../components/common/PageHeader';
import {FiPlus, FiTrash2} from 'react-icons/fi';
import {useActiveProfile} from '../hooks/useActiveProfile';
import {useSelection} from '../components/hooks/useSelection';
import {useInvoiceData} from '../components/hooks/useInvoiceData';
import {useInvoiceExpansion} from '../components/hooks/useInvoiceExpansion';
import DateRangeSelector, {
  DateRange,
} from '../components/common/DateRangeSelector';
import SummaryCard from '../components/common/SummaryCard';
import InvoiceList from '../components/features/invoice/InvoiceList';
import InvoiceActions from '../components/features/invoice/InvoiceActions';
import ItemsSummary from '../components/features/invoice/ItemsSummary';
import {formatInvoiceDate} from '../utils/invoiceUtils';

// ✅ Helper function to get current month date range with STRING dates
function getCurrentMonth(): DateRange {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
  return {
    start: `${year}-${month}-01`,
    end: `${year}-${month}-${String(lastDay).padStart(2, '0')}`,
    label: 'This Month',
  };
}

export default function PurchaseInvoice() {
  const profileId = useActiveProfile();

  const [dateRange, setDateRange] = useState<DateRange | null>(
    getCurrentMonth()
  );

  // ✅ Add state for sale rates
  const [saleRateByCode, setSaleRateByCode] = useState<Map<string, number>>(
    new Map()
  );

  // ✅ Fetch purchase invoices with profileId AND Date Range
  const {invoices, reload} = useInvoiceData({
    fetchInvoices: async () => {
      if (!profileId) return [];
      // FIX: Pass strings directly, removed .toISOString()
      const filters = dateRange
        ? {
            startDate: dateRange.start,
            endDate: dateRange.end,
          }
        : undefined;

      return (await window.api?.invoices?.list?.(profileId, filters)) || [];
    },
  });

  // FIX: Manually reload when dateRange changes
  useEffect(() => {
    reload();
  }, [dateRange, reload]);

  // ✅ Fetch invoice details with profileId
  const {expandedId, detailsById, toggleExpand} = useInvoiceExpansion({
    fetchDetails: async (id: number) => {
      if (!profileId) return undefined;
      return await window.api?.invoices?.get?.(profileId, id);
    },
  });

  // ✅ Selection hooks
  const {
    selected: selectedIds,
    allSelected,
    selectedArray,
    toggle,
    toggleAll,
    clear,
  } = useSelection(invoices.map((inv: any) => inv.id));

  // ✅ Load stock to get sale rates
  useEffect(() => {
    (async () => {
      if (!profileId) return;
      const stock = await window.api?.stock?.list?.(profileId);
      if (stock) {
        const map = new Map<string, number>();
        for (const item of stock) {
          map.set(item.code, item.saleRate);
        }
        setSaleRateByCode(map);
      }
    })();
  }, [profileId]);

  // ✅ Filter by date range - compare strings
  const filteredInvoices = useMemo(() => {
    if (!dateRange) return invoices;
    return invoices.filter((inv: any) => {
      const invDate = inv.invoiceDate || inv.createdAt;
      return invDate >= dateRange.start && invDate <= dateRange.end;
    });
  }, [invoices, dateRange]);

  // ✅ Calculate summary - return numbers not formatted strings
  const {summaryPurchase, summaryQty} = useMemo(() => {
    const purchase = filteredInvoices.reduce(
      (sum: number, inv: any) => sum + (inv.total || 0),
      0
    );

    const qty = filteredInvoices.reduce(
      (sum: number, inv: any) => sum + (inv.totalQty || 0),
      0
    );

    return {summaryPurchase: purchase, summaryQty: qty};
  }, [filteredInvoices]);

  // ✅ Delete selected with profileId
  async function handleDeleteSelected() {
    if (!profileId || selectedArray.length === 0) return;

    if (!confirm(`Delete ${selectedArray.length} invoice(s)?`)) return;

    try {
      await Promise.all(
        selectedArray.map((id) => window.api?.invoices?.delete?.(profileId, id))
      );
      clear();
      await reload();
    } catch (err) {
      console.error('Failed to delete invoices:', err);
      alert('Failed to delete invoices');
    }
  }

  // ✅ Ensure invoices have totalQty
  const enrichedInvoices = useMemo(() => {
    return filteredInvoices.map((inv: any) => ({
      ...inv,
      totalQty: inv.totalQty ?? 0,
    }));
  }, [filteredInvoices]);

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <PageHeader title="Purchase Invoices">
          <div className="flex items-center gap-2">
            {selectedArray.length > 0 && (
              <button
                onClick={handleDeleteSelected}
                className="inline-flex items-center gap-2 h-9 px-3 rounded-md border border-red-200 text-red-700 hover:bg-red-50">
                <FiTrash2 className="size-4" />
                <span>Delete ({selectedArray.length})</span>
              </button>
            )}
            <Link
              to="/purchase-invoice/new"
              className="inline-flex items-center gap-2 h-9 px-3 rounded-md bg-neutral-900 text-white hover:bg-neutral-800">
              <FiPlus className="size-4" />
              <span>New Purchase</span>
            </Link>
            <DateRangeSelector value={dateRange} onChange={setDateRange} />
          </div>
        </PageHeader>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <SummaryCard
          cardTitle="Total Purchases"
          cardValue={summaryPurchase}
        />
        <SummaryCard
          cardTitle="Total Quantity"
          cardValue={summaryQty}
          format="number"
        />
      </div>

      {/* Invoice List */}
      <InvoiceList
        invoices={enrichedInvoices}
        selectedIds={selectedIds}
        allSelected={allSelected}
        expandedId={expandedId}
        onToggleSelect={toggle}
        onToggleAll={toggleAll}
        onToggleExpand={(inv) => toggleExpand(inv.id)}
        formatDate={(inv: any) =>
          formatInvoiceDate(inv.invoiceDate || inv.createdAt)
        }
        renderActions={(inv: any) => (
          <InvoiceActions
            invoiceId={inv.id}
            invoiceType="purchase"
            editUrl={`/purchase-invoice/${inv.id}`}
          />
        )}
        renderExpandedContent={(inv: any) => (
          <ItemsSummary
            items={detailsById[inv.id]?.items || []}
            saleRateByCode={saleRateByCode}
            headers={{
              item: 'Item',
              rate: 'Purchase Rate',
              qty: 'Qty',
              saleRate: 'Sale Rate',
            }}
          />
        )}
      />
    </>
  );
}
