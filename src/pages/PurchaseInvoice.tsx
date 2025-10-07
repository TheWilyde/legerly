import {useMemo, useCallback, useState} from 'react';
import {Link} from 'react-router-dom';
import {FiPlus, FiTrash2} from 'react-icons/fi';
import PageHeader from '../components/common/PageHeader';
import {useSelection} from '../components/hooks/useSelection';
import {useInvoiceData} from '../components/hooks/useInvoiceData';
import {useInvoiceExpansion} from '../components/hooks/useInvoiceExpansion';
import InvoiceList from '../components/features/invoice/InvoiceList';
import InvoiceActions from '../components/features/invoice/InvoiceActions';
import ItemsSummary from '../components/features/invoice/ItemsSummary';
import {
  sortByInvoiceNumber,
  formatInvoiceDate,
  formatPKR,
} from '../utils/invoiceUtils';

type Invoice = {
  id: number;
  number: string;
  supplierName: string;
  total: number;
  createdAt: string;
  address?: string;
  invoiceDate?: string;
  totalQty: number;
};

export default function PurchaseInvoice() {
  // ✅ Use custom hooks
  const {invoices, reload} = useInvoiceData<Invoice>({
    fetchInvoices: () => window.api?.invoices.list(),
    sortInvoices: sortByInvoiceNumber,
  });

  const {
    selected: selectedIds,
    allSelected,
    selectedArray,
    toggle,
    toggleAll,
    clear,
  } = useSelection(invoices.map((i) => i.id));

  // ✅ Fix: Extract items from the response
  const {expandedId, detailsById, toggleExpand} = useInvoiceExpansion<{
    invoice: RendererInvoice;
    items: RendererInvoiceItem[];
  }>({
    fetchDetails: (id) => window.api?.invoices.get(id),
  });

  const [stockByCode, setStockByCode] = useState<Map<string, number>>(
    new Map()
  );

  // Load stock data once on first expand
  const handleToggleExpand = useCallback(
    async (inv: Invoice) => {
      await toggleExpand(inv.id);

      if (stockByCode.size === 0) {
        const stock = await window.api?.stock.list();
        if (stock) {
          const map = new Map<string, number>();
          for (const s of stock) map.set(s.code, s.saleRate);
          setStockByCode(map);
        }
      }
    },
    [toggleExpand, stockByCode]
  );

  async function handleDeleteSelected() {
    if (selectedArray.length === 0) return;
    await Promise.all(
      selectedArray.map((id) => window.api?.invoices.delete(id))
    );
    clear();
    await reload();
  }

  const purchaseSummary = useMemo(
    () => invoices.reduce((s, inv) => s + (inv.total || 0), 0),
    [invoices]
  );

  return (
    <>
      <PageHeader title="Purchase Invoices">
        <Link
          to="/purchase-invoice/new"
          className="inline-flex items-center gap-2 h-9 px-3 rounded-md bg-neutral-900 text-white hover:bg-neutral-800">
          <FiPlus className="size-4" />
          <span>New Invoice</span>
        </Link>
        {selectedIds.size > 0 && (
          <button
            type="button"
            onClick={handleDeleteSelected}
            className="inline-flex items-center gap-2 h-9 px-3 rounded-md border border-red-200 text-red-700 hover:bg-red-50"
            title="Delete selected">
            <FiTrash2 className="size-4" />
            <span>Delete</span>
          </button>
        )}
      </PageHeader>

      {/* Summary Card */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-white rounded-md border border-neutral-200 p-3">
          <div className="text-sm text-neutral-500">Total Purchase Rate</div>
          <div className="text-xl font-semibold tabular-nums">
            {formatPKR(purchaseSummary)}
          </div>
        </div>
      </div>

      {/* ✅ Reusable Invoice List */}
      <InvoiceList
        invoices={invoices}
        selectedIds={selectedIds}
        allSelected={allSelected}
        expandedId={expandedId}
        onToggleSelect={toggle}
        onToggleAll={toggleAll}
        onToggleExpand={handleToggleExpand}
        formatDate={formatInvoiceDate}
        renderExpandedContent={(inv) => (
          <>
            <InvoiceActions
              invoiceId={inv.id}
              invoiceType="purchase"
              editUrl={`/purchase-invoice/new?id=${inv.id}`}
            />
            <ItemsSummary
              items={detailsById[inv.id]?.items ?? []}
              saleRateByCode={stockByCode}
              headers={{
                rate: 'Purchase Rate',
                qty: 'Purchase Qty',
                saleRate: 'Sale Rate',
              }}
            />
          </>
        )}
      />
    </>
  );
}
