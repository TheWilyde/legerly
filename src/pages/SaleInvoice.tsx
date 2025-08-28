import {useEffect, useState} from 'react';
import {Link} from 'react-router-dom';
import {FiChevronDown, FiPlus, FiTrash2} from 'react-icons/fi';
import ItemsSummary from '../components/invoice/ItemsSummary';
import PageHeader from '../components/common/PageHeader';
import {useSelection} from '../components/hooks/useSelection';

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
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [, setLoading] = useState(false);
  const {
    selected: selectedIds,
    allSelected,
    selectedArray,
    toggle,
    toggleAll,
    clear,
  } = useSelection(invoices.map((i) => i.id));
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Cache expanded invoice items and stock saleRate
  const [itemsByInvoice, setItemsByInvoice] = useState<
    Record<number, RendererInvoiceItem[]>
  >({});
  const [stockByCode, setStockByCode] = useState<Map<string, number>>(
    new Map()
  ); // code -> saleRate

  async function load() {
    setLoading(true);
    try {
      const data = await window.api?.sales.list();
      if (data) setInvoices(data as any);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteSelected() {
    if (selectedArray.length === 0) return;
    const ids = selectedArray;
    await Promise.all(ids.map((id) => window.api?.sales.delete(id)));
    clear();
    await load();
  }

  useEffect(() => {
    load();
  }, []);

  async function toggleExpand(inv: Invoice) {
    setExpandedId((prev) => (prev === inv.id ? null : inv.id));
    if (!itemsByInvoice[inv.id]) {
      const data = await window.api?.sales.get(inv.id);
      if (data) {
        setItemsByInvoice((m) => ({...m, [inv.id]: data.items}));
      }
    }
    if (stockByCode.size === 0) {
      const stock = await window.api?.stock.list();
      if (stock) {
        const map = new Map<string, number>();
        for (const s of stock) map.set(s.code, s.saleRate);
        setStockByCode(map);
      }
    }
  }

  const fmtDate = (d?: string) => (d ? new Date(d).toLocaleDateString() : '');

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

      {/* Secondary header with columns + select-all */}
      <div className="mt-4 bg-white rounded-md overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-2 bg-neutral-50 border-b border-neutral-200 text-sm font-medium text-neutral-600">
          <div className="w-8 flex justify-center">
            <input
              type="checkbox"
              className="size-5 accent-neutral-800"
              checked={allSelected}
              onChange={toggleAll}
              aria-label="Select all"
            />
          </div>
          <div className="w-36">Date</div>
          <div className="w-40">Invoice Number</div>
          <div className="flex-1">Customer</div>
          <div className="flex-1">Address</div>
          <div className="w-24 text-center">Total Qty</div>
          <div className="w-28 text-right">Total Amount</div>
          <div className="w-6" aria-hidden />
        </div>

        {/* List */}
        {invoices.length === 0 ? (
          <div className="p-6 text-neutral-600">No invoices yet.</div>
        ) : (
          invoices.map((inv) => {
            const isSelected = selectedIds.has(inv.id);
            const isExpanded = expandedId === inv.id;
            const date = inv.invoiceDate
              ? fmtDate(inv.invoiceDate)
              : fmtDate(inv.createdAt);
            return (
              <div key={inv.id} className="px-4">
                <div className="flex items-center gap-3 py-2">
                  {/* Multi-select checkbox */}
                  <div className="w-8 flex justify-center">
                    <input
                      type="checkbox"
                      className="size-5 accent-neutral-900"
                      checked={isSelected}
                      onChange={() => toggle(inv.id)}
                      title="Select invoice"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>

                  {/* Clickable summary row */}
                  <button
                    onClick={() => toggleExpand(inv)}
                    className="flex-1 group rounded-md px-2 py-2 hover:bg-neutral-50 text-left">
                    <div className="flex items-center">
                      <div className="w-36 text-neutral-900">{date}</div>
                      <div className="w-40 font-medium text-neutral-900">
                        {inv.number}
                      </div>
                      <div className="flex-1 text-neutral-700">
                        {inv.supplierName}
                      </div>
                      <div className="flex-1 text-neutral-700 truncate">
                        {inv.address ?? ''}
                      </div>
                      <div className="w-24 text-center tabular-nums">
                        {inv.totalQty}
                      </div>
                      <div className="w-28 text-right tabular-nums font-semibold">
                        {inv.total.toFixed(2)}
                      </div>
                      <div className="w-6 flex justify-end">
                        <FiChevronDown
                          className={`size-4 text-neutral-500 transition-transform ${
                            isExpanded ? 'rotate-180' : ''
                          }`}
                        />
                      </div>
                    </div>
                  </button>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="mx-7 mb-3 rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-700">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-semibold text-neutral-700">
                        Items summary
                      </div>
                      <Link
                        to={`/sale-invoice/new?id=${inv.id}`}
                        className="inline-flex items-center gap-2 h-8 px-3 rounded-md border border-neutral-200 hover:bg-neutral-100"
                        title="Edit invoice">
                        Edit
                      </Link>
                    </div>
                    <ItemsSummary
                      items={itemsByInvoice[inv.id] ?? []}
                      saleRateByCode={stockByCode}
                      headers={{
                        rate: 'Sale Rate',
                        qty: 'Sale Qty',
                        saleRate: 'Stock Sale Rate',
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
