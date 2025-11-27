import {useState, useMemo, useEffect, useCallback} from 'react';
import {Link} from 'react-router-dom';
import PageHeader from '../components/common/PageHeader';
import {FiPlus, FiTrash2} from 'react-icons/fi';
import {useActiveProfile} from '../hooks/useActiveProfile';
import {useSelection} from '../components/hooks/useSelection';
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

  // ✅ FIX: Manage invoices state directly instead of using useInvoiceData
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // ✅ NEW: State to store all invoice details for quantity calculation
  const [allDetailsById, setAllDetailsById] = useState<Record<number, any>>({});

  // ✅ Add state for sale rates
  const [saleRateByCode, setSaleRateByCode] = useState<Map<string, number>>(
    new Map()
  );

  // ✅ FIX: Fetch invoices with proper dependency on dateRange
  const loadInvoices = useCallback(async () => {
    if (!profileId) return;

    setLoading(true);
    try {
      const filters = dateRange
        ? {
            startDate: dateRange.start,
            endDate: dateRange.end,
          }
        : undefined;

      const data =
        (await window.api?.invoices?.list?.(profileId, filters)) || [];
      setInvoices(data);
    } catch (err) {
      console.error('Failed to load invoices:', err);
    } finally {
      setLoading(false);
    }
  }, [profileId, dateRange]); // ✅ Include dateRange in dependencies

  // ✅ FIX: Reload when profileId or dateRange changes
  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);

  // ✅ NEW: Fetch all invoice details when invoices load
  useEffect(() => {
    if (!profileId || invoices.length === 0) {
      setAllDetailsById({});
      return;
    }

    (async () => {
      const detailsMap: Record<number, any> = {};

      await Promise.all(
        invoices.map(async (inv: any) => {
          try {
            const data = await window.api?.invoices?.get?.(profileId, inv.id);
            if (data) {
              detailsMap[inv.id] = data;
            }
          } catch (err) {
            console.error(
              `Failed to fetch details for invoice ${inv.id}:`,
              err
            );
          }
        })
      );

      setAllDetailsById(detailsMap);
    })();
  }, [invoices, profileId]);

  // ✅ Fetch invoice details with profileId (for expansion UI)
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

  // ✅ Filter by date range - compare strings (already filtered by API, but double-check)
  const filteredInvoices = useMemo(() => {
    if (!dateRange) return invoices;
    return invoices.filter((inv: any) => {
      // ✅ Include drafts regardless of date
      if (inv.status === 'draft') return true;
      const invDate = inv.invoiceDate || inv.createdAt?.split('T')[0];
      if (!invDate) return true;
      return invDate >= dateRange.start && invDate <= dateRange.end;
    });
  }, [invoices, dateRange]);

  // ✅ Calculate summary - use allDetailsById to get quantities
  const {summaryPurchase, summaryQty} = useMemo(() => {
    const purchase = filteredInvoices.reduce(
      (sum: number, inv: any) => sum + (inv.total || 0),
      0
    );

    // ✅ FIX: Calculate quantity from invoice items
    const qty = filteredInvoices.reduce((sum: number, inv: any) => {
      const detail = allDetailsById[inv.id];
      if (detail?.items) {
        const invoiceQty = detail.items.reduce(
          (s: number, item: any) => s + (item.qty || 0),
          0
        );
        return sum + invoiceQty;
      }
      return sum;
    }, 0);

    return {summaryPurchase: purchase, summaryQty: qty};
  }, [filteredInvoices, allDetailsById]);

  // ✅ Delete selected with profileId
  async function handleDeleteSelected() {
    if (!profileId || selectedArray.length === 0) return;

    if (!confirm(`Delete ${selectedArray.length} invoice(s)?`)) return;

    try {
      await Promise.all(
        selectedArray.map((id) => window.api?.invoices?.delete?.(profileId, id))
      );
      clear();
      await loadInvoices(); // ✅ Use loadInvoices instead of reload
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-neutral-500">Loading invoices...</div>
      </div>
    );
  }

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
        <SummaryCard cardTitle="Total Purchases" cardValue={summaryPurchase} />
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
