import {useMemo, useCallback, useState} from 'react';
import {Link} from 'react-router-dom';
import {FiPlus, FiTrash2} from 'react-icons/fi';
import PageHeader from '../components/common/PageHeader';
import SummaryCard from '../components/common/SummaryCard';
import {useSelection} from '../components/hooks/useSelection';
import {useInvoiceData} from '../components/hooks/useInvoiceData';
import {useInvoiceExpansion} from '../components/hooks/useInvoiceExpansion';
import InvoiceList from '../components/features/invoice/InvoiceList';
import InvoiceActions from '../components/features/invoice/InvoiceActions';
import ItemsSummaryProfit from '../components/features/invoice/ItemsSummaryProfit';
import {sortByInvoiceNumber, formatInvoiceDate} from '../utils/invoiceUtils';

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

export default function SaleInvoice() {
  // ✅ Use custom hooks for data fetching
  const {invoices, reload} = useInvoiceData<Invoice>({
    fetchInvoices: () => window.api?.sales.list(),
    sortInvoices: sortByInvoiceNumber,
  });

  // ✅ Use selection hook
  const {
    selected: selectedIds,
    allSelected,
    selectedArray,
    toggle,
    toggleAll,
    clear,
  } = useSelection(invoices.map((i) => i.id));

  // ✅ Use expansion hook - Fix: Extract items from response
  const {expandedId, detailsById, toggleExpand} = useInvoiceExpansion<{
    invoice: RendererInvoice;
    items: RendererInvoiceItem[];
  }>({
    fetchDetails: (id) => window.api?.sales.get(id),
  });

  // Purchase rates for profit calculation
  const [purchaseByCode, setPurchaseByCode] = useState<Map<string, number>>(
    new Map()
  );

  // Load purchase rates once on first expand
  const handleToggleExpand = useCallback(
    async (inv: Invoice) => {
      await toggleExpand(inv.id);

      if (purchaseByCode.size === 0) {
        const stock = await window.api?.stock.list();
        if (stock) {
          const map = new Map<string, number>();
          for (const s of stock) {
            const pr =
              (s as any).purchaseRate ??
              (s as any).buyRate ??
              (s as any).cost ??
              0;
            map.set(s.code, Number(pr) || 0);
          }
          setPurchaseByCode(map);
        }
      }
    },
    [toggleExpand, purchaseByCode]
  );

  // ✅ Calculate summaries efficiently (only from invoice totals, not items)
  const summarySale = useMemo(
    () => invoices.reduce((s, inv) => s + (inv.total || 0), 0),
    [invoices]
  );

  // ✅ Calculate profit only for expanded invoices (lazy calculation)
  const summaryProfit = useMemo(() => {
    let profitTotal = 0;

    for (const details of Object.values(detailsById)) {
      const items = details.items || [];
      for (const item of items) {
        const saleRate = Number(item.rate) || 0;
        const qty = Number(item.qty) || 0;
        const purchaseRate = purchaseByCode.get(item.code) || 0;
        profitTotal += (saleRate - purchaseRate) * qty;
      }
    }

    return profitTotal;
  }, [detailsById, purchaseByCode]);

  async function handleDeleteSelected() {
    if (selectedArray.length === 0) return;
    await Promise.all(selectedArray.map((id) => window.api?.sales.delete(id)));
    clear();
    await reload();
  }

  return (
    <>
      <PageHeader title="Sale Invoices">
        <Link
          to="/sale-invoice/new"
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

      {/* Summary Cards */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <SummaryCard cardTitle="Total Sale Rate" cardValue={summarySale} />
        <SummaryCard
          cardTitle="Total Profit"
          cardValue={summaryProfit}
          profitLossIndicator={true}
        />
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
              invoiceType="sale"
              editUrl={`/sale-invoice/new?id=${inv.id}`}
            />
            <ItemsSummaryProfit
              items={detailsById[inv.id]?.items ?? []}
              purchaseRateByCode={purchaseByCode}
            />
          </>
        )}
      />
    </>
  );
}
