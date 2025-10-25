import {useState, useMemo} from 'react';
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
import ItemsSummaryProfit from '../components/features/invoice/ItemsSummaryProfit';
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

export default function SaleInvoice() {
  const profileId = useActiveProfile();

  const [dateRange, setDateRange] = useState<DateRange | null>(
    getCurrentMonth()
  );

  // ✅ Fetch sale invoices with profileId
  const {invoices, reload} = useInvoiceData({
    fetchInvoices: async () => {
      if (!profileId) return [];
      return (await window.api?.saleInvoices?.list?.(profileId)) || [];
    },
  });

  // ✅ Fetch purchase data for profit calculation
  const {invoices: purchaseInvoices} = useInvoiceData({
    fetchInvoices: async () => {
      if (!profileId) return [];
      return (await window.api?.invoices?.list?.(profileId)) || [];
    },
  });

  // Create purchase lookup by code
  const purchaseRateByCode = useMemo(() => {
    const map = new Map();
    purchaseInvoices.forEach((inv: any) => {
      if (inv.items) {
        inv.items.forEach((item: any) => {
          if (!map.has(item.code)) {
            map.set(item.code, item.rate);
          }
        });
      }
    });
    return map;
  }, [purchaseInvoices]);

  // ✅ Fetch invoice details with profileId
  const {expandedId, detailsById, toggleExpand} = useInvoiceExpansion({
    fetchDetails: async (id: number) => {
      if (!profileId) return undefined;
      return await window.api?.saleInvoices?.get?.(profileId, id);
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

  // ✅ Filter by date range - compare strings
  const filteredInvoices = useMemo(() => {
    if (!dateRange) return invoices;
    return invoices.filter((inv: any) => {
      const invDate = inv.invoiceDate || inv.createdAt;
      return invDate >= dateRange.start && invDate <= dateRange.end;
    });
  }, [invoices, dateRange]);

  // ✅ Calculate summary - return numbers not formatted strings
  const {summarySale, summaryProfit} = useMemo(() => {
    const sale = filteredInvoices.reduce(
      (sum: number, inv: any) => sum + (inv.total || 0),
      0
    );

    let profit = 0;
    filteredInvoices.forEach((inv: any) => {
      const details = detailsById[inv.id];
      if (details?.items) {
        details.items.forEach((item: any) => {
          const purchaseRate = purchaseRateByCode.get(item.code) || 0;
          const itemProfit = (item.rate - purchaseRate) * item.qty;
          profit += itemProfit;
        });
      }
    });

    return {summarySale: sale, summaryProfit: profit};
  }, [filteredInvoices, detailsById, purchaseRateByCode]);

  // ✅ Delete selected with profileId
  async function handleDeleteSelected() {
    if (!profileId || selectedArray.length === 0) return;

    if (!confirm(`Delete ${selectedArray.length} invoice(s)?`)) return;

    try {
      await Promise.all(
        selectedArray.map((id) =>
          window.api?.saleInvoices?.delete?.(profileId, id)
        )
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
        <PageHeader title="Sale Invoices">
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
              to="/sale-invoice/new"
              className="inline-flex items-center gap-2 h-9 px-3 rounded-md bg-neutral-900 text-white hover:bg-neutral-800">
              <FiPlus className="size-4" />
              <span>New Sale</span>
            </Link>
            <DateRangeSelector value={dateRange} onChange={setDateRange} />
          </div>
        </PageHeader>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <SummaryCard cardTitle="Total Sales" cardValue={summarySale} />
        <SummaryCard
          cardTitle="Total Profit"
          cardValue={summaryProfit}
          profitLossIndicator={summaryProfit >= 0}
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
            invoiceType="sale"
            editUrl={`/sale-invoice/${inv.id}`}
          />
        )}
        renderExpandedContent={(inv: any) => (
          <ItemsSummaryProfit
            items={detailsById[inv.id]?.items || []}
            purchaseRateByCode={purchaseRateByCode}
          />
        )}
      />
    </>
  );
}
