import {useEffect, useState} from 'react';
import {Link} from 'react-router-dom';
import {FiChevronDown, FiPlus, FiTrash2, FiDownload} from 'react-icons/fi';
import ItemsSummaryProfit from '../components/invoice/ItemsSummaryProfit';
import PageHeader from '../components/common/PageHeader';
import {useSelection} from '../components/hooks/useSelection';
import SummaryCard from '../components/common/SummaryCard';

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
  const [purchaseByCode, setPurchaseByCode] = useState<Map<string, number>>(
    new Map()
  ); // code -> purchaseRate
  const [summarySale, setSummarySale] = useState(0);
  const [summaryProfit, setSummaryProfit] = useState(0);

  function invoiceNoValue(n: string) {
    const digits = n.replace(/\D+/g, '');
    return digits ? parseInt(digits, 10) : NaN;
  }

  async function load() {
    setLoading(true);
    try {
      const [data, stock] = await Promise.all([
        window.api?.sales.list(),
        window.api?.stock.list(),
      ]);
      if (data) {
        const sorted = [...(data as Invoice[])].sort((a, b) => {
          const an = invoiceNoValue(a.number);
          const bn = invoiceNoValue(b.number);
          if (Number.isFinite(an) && Number.isFinite(bn)) {
            if (an !== bn) return an - bn; // lowest invoice number first
            return a.number.localeCompare(b.number);
          }
          return a.number.localeCompare(b.number);
        });
        setInvoices(sorted);

        // Build a purchase-rate map from stock
        const map = new Map<string, number>();
        if (stock) {
          for (const s of stock) {
            const pr =
              (s as any).purchaseRate ??
              (s as any).buyRate ??
              (s as any).cost ??
              0;
            map.set(s.code, Number(pr) || 0);
          }
        }
        setPurchaseByCode(map);

        // Fetch all items for each invoice and compute totals
        const details = await Promise.all(
          sorted.map((inv) => window.api?.sales.get(inv.id))
        );
        let saleTotal = 0;
        let profitTotal = 0;
        for (const res of details) {
          const items = (res && (res as any).items) || [];
          for (const it of items as any[]) {
            const sale = Number(it.rate) || 0;
            const qty = Number(it.qty) || 0;
            const purchase = Number(map.get(it.code)) || 0;
            saleTotal += sale * qty;
            profitTotal += (sale - purchase) * qty;
          }
        }
        setSummarySale(saleTotal);
        setSummaryProfit(profitTotal);
      }
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

  useEffect(() => {
    const onChanged = () => {
      if (typeof load === 'function') load();
    };
    window.addEventListener('workspace:active-changed', onChanged as any);
    return () =>
      window.removeEventListener('workspace:active-changed', onChanged as any);
  }, []);

  async function toggleExpand(inv: Invoice) {
    setExpandedId((prev) => (prev === inv.id ? null : inv.id));
    if (!itemsByInvoice[inv.id]) {
      const data = await window.api?.sales.get(inv.id);
      if (data) {
        setItemsByInvoice((m) => ({...m, [inv.id]: data.items}));
      }
    }
    if (purchaseByCode.size === 0) {
      const stock = await window.api?.stock.list();
      if (stock) {
        const map = new Map<string, number>();
        for (const s of stock) {
          // Prefer purchase-related field; fall back defensively
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
  }

  function fmtDate(d?: string) {
    if (!d) return '';
    const dt = new Date(d);
    const day = String(dt.getDate()).padStart(2, '0');
    const mon = dt.toLocaleString('en-US', {month: 'short'});
    const year = dt.getFullYear();
    return `${day}/${mon}/${year}`; // DD/MMM/YYYY
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

      {/* Global summary (same placement as Stock page) */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <SummaryCard cardTitle="Total Sale Rate" cardValue={summarySale} />
        <SummaryCard
          cardTitle="Total Profit"
          cardValue={summaryProfit}
          profitLossIndicator={true}
        />
      </div>

      {/* Sticky header invoice list */}
      <div className="mt-4 bg-white rounded-md overflow-auto max-h-[70vh]">
        <div className="sticky top-0 z-10 flex items-center gap-3 px-4 py-2 bg-neutral-50 border-b border-neutral-200 text-sm font-medium text-neutral-600">
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
                  <div className="mb-4 rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-700">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-semibold text-neutral-700">
                        Items summary
                      </div>
                      <div className="flex items-center gap-2">
                        <Link
                          to={`/sale-invoice/new?id=${inv.id}`}
                          className="inline-flex items-center gap-2 h-8 px-3 rounded-md border border-neutral-200 hover:bg-neutral-100"
                          title="Edit invoice">
                          Edit
                        </Link>
                        {/* Export PDF with simple hover menu */}
                        <div className="relative group inline-block pb-1">
                          <button
                            type="button"
                            className="inline-flex items-center gap-2 h-8 px-3 rounded-md border border-neutral-200 bg-white hover:bg-neutral-100"
                            title="Export PDF">
                            <FiDownload className="size-4" />
                            PDF
                            <span className="ml-1 text-neutral-500">▾</span>
                          </button>
                          <div className="absolute left-0 top-full hidden group-hover:block z-10 bg-white border border-neutral-200 rounded-md shadow-md min-w-28">
                            <button
                              type="button"
                              onClick={() =>
                                window.api?.print.saveInvoicePdf(
                                  'sale',
                                  inv.id,
                                  'A4'
                                )
                              }
                              className="block w-full text-left px-3 py-1.5 hover:bg-neutral-50">
                              A4
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                window.api?.print.saveInvoicePdf(
                                  'sale',
                                  inv.id,
                                  'A5'
                                )
                              }
                              className="block w-full text-left px-3 py-1.5 hover:bg-neutral-50">
                              A5
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                    <ItemsSummaryProfit
                      items={itemsByInvoice[inv.id] ?? []}
                      purchaseRateByCode={purchaseByCode}
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
