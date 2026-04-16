import {useState, useMemo, useEffect, useCallback} from 'react';
import {Link} from 'react-router-dom';
import PageHeader from '../components/common/PageHeader';
import {FiPlus, FiTrash2} from 'react-icons/fi';
import {useActiveProfile} from '../hooks/useActiveProfile';
import {useSelection} from '../components/hooks/useSelection';
import {useInvoiceExpansion} from '../components/hooks/useInvoiceExpansion';
import SummaryCard from '../components/common/SummaryCard';
import InvoiceList from '../components/features/invoice/InvoiceList';
import InvoiceActions from '../components/features/invoice/InvoiceActions';
import ItemsSummary from '../components/features/invoice/ItemsSummary';
import {formatInvoiceDate} from '../utils/invoiceUtils';
import {usePeriod} from '../contexts/PeriodContext';

export default function PurchaseInvoice() {
  const profileId = useActiveProfile();
  const {selectedPeriod, activePeriod, isViewingHistorical} = usePeriod();
  const effectivePeriod = selectedPeriod ?? activePeriod;

  // ✅ FIX: Manage invoices state directly instead of using useInvoiceData
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // ✅ NEW: State to store all invoice details for quantity calculation
  const [allDetailsById, setAllDetailsById] = useState<Record<number, any>>({});

  // ✅ Add state for sale rates
  const [saleRateByCode, setSaleRateByCode] = useState<Map<string, number>>(
    new Map(),
  );

  // ✅ FIX: Fetch invoices with profile dependency
  const loadInvoices = useCallback(async () => {
    if (!profileId || !effectivePeriod) {
      setInvoices([]);
      return;
    }

    setLoading(true);
    try {
      const data =
        (await window.api?.invoices?.list?.(
          profileId,
          effectivePeriod
            ? {
                startDate: effectivePeriod.startDate,
                endDate: effectivePeriod.endDate,
                periodId: effectivePeriod.id,
              }
            : undefined,
        )) || [];
      setInvoices(data);
    } catch (err) {
      console.error('Failed to load invoices:', err);
    } finally {
      setLoading(false);
    }
  }, [profileId, effectivePeriod]);

  // ✅ FIX: Reload when profile changes
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
              err,
            );
          }
        }),
      );

      setAllDetailsById(detailsMap);
    })();
  }, [invoices, profileId]);

  // ✅ Fetch invoice details with profileId (for expansion UI)
  const {expandedId, detailsById, toggleExpand} = useInvoiceExpansion({
    fetchDetails: async (id: number) => {
      if (!profileId) return undefined;
      const cached = allDetailsById[id];
      if (cached) return cached;
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
      if (!profileId || !effectivePeriod) {
        setSaleRateByCode(new Map());
        return;
      }
      const stock = await window.api?.stock?.list?.(profileId, {
        periodId: effectivePeriod.id,
      });
      if (stock) {
        const map = new Map<string, number>();
        for (const item of stock) {
          map.set(item.code, item.saleRate);
        }
        setSaleRateByCode(map);
      }
    })();
  }, [profileId, effectivePeriod]);

  const filteredInvoices = invoices;

  // ✅ Calculate summary - use allDetailsById to get quantities
  const {summaryPurchase, summaryQty} = useMemo(() => {
    const purchase = filteredInvoices.reduce(
      (sum: number, inv: any) => sum + (inv.total || 0),
      0,
    );

    // ✅ FIX: Calculate quantity from invoice items
    const qty = filteredInvoices.reduce((sum: number, inv: any) => {
      const detail = allDetailsById[inv.id];
      if (detail?.items) {
        const invoiceQty = detail.items.reduce(
          (s: number, item: any) => s + (item.qty || 0),
          0,
        );
        return sum + invoiceQty;
      }
      return sum;
    }, 0);

    return {summaryPurchase: purchase, summaryQty: qty};
  }, [filteredInvoices, allDetailsById]);

  // ✅ Delete selected with profileId
  async function handleDeleteSelected() {
    if (isViewingHistorical) return;
    if (!profileId || selectedArray.length === 0) return;

    if (!confirm(`Delete ${selectedArray.length} invoice(s)?`)) return;

    try {
      await Promise.all(
        selectedArray.map((id) =>
          window.api?.invoices?.delete?.(profileId, id),
        ),
      );
      window.dispatchEvent(new CustomEvent('invoice:changed'));
      window.dispatchEvent(new CustomEvent('stock:changed'));
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
            {(selectedArray.length > 0 || isViewingHistorical) && (
              <button
                onClick={handleDeleteSelected}
                disabled={isViewingHistorical || selectedArray.length === 0}
                title={
                  isViewingHistorical
                    ? 'Historical periods are read-only'
                    : 'Delete selected invoices'
                }
                className="inline-flex items-center gap-2 h-9 px-3 rounded-md border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed">
                <FiTrash2 className="size-4" />
                <span>Delete ({selectedArray.length})</span>
              </button>
            )}
            {isViewingHistorical ? (
              <button
                type="button"
                disabled
                className="inline-flex items-center gap-2 h-9 px-3 rounded-md bg-neutral-200 text-neutral-500 cursor-not-allowed"
                title="Historical periods are read-only">
                <FiPlus className="size-4" />
                <span>New Purchase</span>
              </button>
            ) : (
              <Link
                to="/purchase-invoice/new"
                className="inline-flex items-center gap-2 h-9 px-3 rounded-md bg-neutral-900 text-white hover:bg-neutral-800">
                <FiPlus className="size-4" />
                <span>New Purchase</span>
              </Link>
            )}
          </div>
        </PageHeader>
      </div>

      {isViewingHistorical && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Viewing a closed period. Purchases are read-only.
        </div>
      )}

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
            readOnly={isViewingHistorical || inv.periodStatus === 'closed'}
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
