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

export default function SaleInvoice() {
  const profileId = useActiveProfile();

  const [dateRange, setDateRange] = useState<DateRange | null>(
    getCurrentMonth(),
  );

  // ✅ NEW: State to store all invoice details for profit calculation
  const [allDetailsById, setAllDetailsById] = useState<Record<number, any>>({});

  // ✅ State for purchase rate lookup (for ItemsSummary)
  const [purchaseRateByCode, setPurchaseRateByCode] = useState<
    Map<string, number>
  >(new Map());

  // ✅ Fetch sale invoices with profileId AND Date Range
  const {invoices, reload} = useInvoiceData({
    fetchInvoices: async () => {
      if (!profileId) return [];
      const filters = dateRange
        ? {
            startDate: dateRange.start,
            endDate: dateRange.end,
          }
        : undefined;

      return (await window.api?.saleInvoices?.list?.(profileId, filters)) || [];
    },
  });

  // Reload when date range or profile changes while staying on the same route.
  useEffect(() => {
    reload();
  }, [dateRange, profileId, reload]);

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
            const data = await window.api?.saleInvoices?.get?.(
              profileId,
              inv.id,
            );
            if (data) {
              detailsMap[inv.id] = data;
            }
          } catch (err) {
            console.error(
              `Failed to fetch details for invoice ${inv.id}:`,
              err,
            );
          }
        }),
      );

      setAllDetailsById(detailsMap);
    })();
  }, [invoices, profileId]);

  // ✅ Load stock to get purchase rates for ItemsSummary display
  useEffect(() => {
    (async () => {
      if (!profileId) return;
      const stock = await window.api?.stock?.list?.(profileId);
      if (stock) {
        const map = new Map<string, number>();
        for (const item of stock) {
          map.set(item.code, item.purchaseRate || 0);
        }
        setPurchaseRateByCode(map);
      }
    })();
  }, [profileId]);

  // ✅ Fetch invoice details with profileId (for expansion UI)
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

  // ✅ Calculate total quantity and profit using ALL details
  const {totalProfit} = useMemo(() => {
    let profit = 0;

    filteredInvoices.forEach((inv: any) => {
      const detail = allDetailsById[inv.id];
      if (detail?.items) {
        detail.items.forEach((item: any) => {
          const purchaseRate = purchaseRateByCode.get(item.code) || 0;
          const itemProfit = (item.rate - purchaseRate) * item.qty;
          profit += itemProfit;
        });
      }
    });

    return {totalProfit: profit};
  }, [filteredInvoices, allDetailsById, purchaseRateByCode]);

  // ✅ Calculate summarySale
  const summarySale = useMemo(() => {
    return filteredInvoices.reduce(
      (sum: number, inv: any) => sum + (inv.total || 0),
      0,
    );
  }, [filteredInvoices]);

  // ✅ Delete selected with profileId
  async function handleDeleteSelected() {
    if (!profileId || selectedArray.length === 0) return;

    if (!confirm(`Delete ${selectedArray.length} invoice(s)?`)) return;

    try {
      await Promise.all(
        selectedArray.map((id) =>
          window.api?.saleInvoices?.delete?.(profileId, id),
        ),
      );
      window.dispatchEvent(new CustomEvent('invoice:changed'));
      window.dispatchEvent(new CustomEvent('stock:changed'));
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

  const displayInvoices = useMemo(
    () =>
      enrichedInvoices.map((inv: any) => ({
        ...inv,
        supplierName: inv.customerName ?? inv.supplierName ?? '',
      })),
    [enrichedInvoices],
  );

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
        <SummaryCard
          cardTitle="Total Sale"
          cardValue={summarySale}
          format="currency"
        />
        <SummaryCard
          cardTitle="Total Profit"
          cardValue={totalProfit}
          format="currency"
        />
      </div>

      {/* Invoice List */}
      <InvoiceList
        invoices={displayInvoices}
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
          <ItemsSummary
            items={detailsById[inv.id]?.items || []}
            saleRateByCode={purchaseRateByCode}
            showProfit
            headers={{
              item: 'Item',
              rate: 'Sale Rate',
              qty: 'Qty',
              saleRate: 'Purchase Rate',
            }}
          />
        )}
      />
    </>
  );
}
