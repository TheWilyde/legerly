import {useEffect, useState} from 'react';
import {Link} from 'react-router-dom';
import {FiPlus, FiRefreshCw, FiChevronDown, FiTrash2} from 'react-icons/fi';

type Invoice = {
  id: number;
  number: string;
  supplierName: string;
  total: number;
  createdAt: string;
};

export default function PurchaseInvoice() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const allSelected =
    invoices.length > 0 && selectedIds.size === invoices.length;

  async function load() {
    setLoading(true);
    try {
      const data = await window.api?.invoices.list();
      if (data) setInvoices(data);
    } finally {
      setLoading(false);
    }
  }

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((prev) => {
      if (prev.size === invoices.length) return new Set();
      return new Set(invoices.map((i) => i.id));
    });
  }

  async function handleDelete() {
    if (selectedIds.size === 0) return;
    await Promise.all(
      [...selectedIds].map((id) => window.api?.invoices.delete(id))
    );
    setSelectedIds(new Set());
    await load();
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      {/* Main header */}
      <header className="bg-white shadow flex items-center justify-between px-4 py-3 rounded-md">
        <h1 className="text-xl font-semibold">Purchase Invoice</h1>
        <div className="flex items-center gap-2">
          <Link
            to="/purchase-invoice/new"
            className="inline-flex items-center gap-2 h-9 px-3 rounded-md bg-neutral-900 text-white">
            <FiPlus className="size-5" />
            <span>New Invoice</span>
          </Link>
          <button
            className="inline-flex items-center justify-center w-9 h-9 rounded-md border border-neutral-200 hover:bg-neutral-100 text-neutral-700"
            onClick={load}
            disabled={loading}
            title="Refresh">
            <FiRefreshCw
              className={`size-5 ${loading ? 'animate-spin' : ''}`}
            />
          </button>
          {selectedIds.size > 0 && (
            <button
              className="inline-flex items-center gap-2 h-9 px-3 rounded-md border border-red-200 text-red-700 hover:bg-red-50"
              onClick={handleDelete}
              title="Delete selected">
              <FiTrash2 className="size-5" />
              <span>Delete</span>
            </button>
          )}
        </div>
      </header>

      {/* Secondary header with columns + select-all */}
      <div className="mt-4 bg-white rounded-md overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-2 bg-neutral-50 border-b border-neutral-200 text-sm font-medium text-neutral-600">
          <div className="w-8 flex justify-center">
            <input
              type="checkbox"
              className="size-5 accent-neutral-800"
              checked={allSelected}
              onChange={toggleSelectAll}
              aria-label="Select all"
            />
          </div>
          <div className="w-40">Invoice No.</div>
          <div className="flex-1">Customer</div>
          <div className="w-28 text-right">Total</div>
          <div className="w-6" aria-hidden />
        </div>

        {/* List */}
        {invoices.length === 0 ? (
          <div className="p-6 text-neutral-600">No invoices yet.</div>
        ) : (
          invoices.map((inv) => {
            const isSelected = selectedIds.has(inv.id);
            const isExpanded = expandedId === inv.id;
            return (
              <div key={inv.id} className="px-4">
                <div className="flex items-center gap-3 py-2">
                  {/* Multi-select checkbox */}
                  <div className="w-8 flex justify-center">
                    <input
                      type="checkbox"
                      className="size-5 accent-neutral-900"
                      checked={isSelected}
                      onChange={() => toggleSelect(inv.id)}
                      title="Select invoice"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>

                  {/* Clickable summary row */}
                  <button
                    onClick={() =>
                      setExpandedId((prev) => (prev === inv.id ? null : inv.id))
                    }
                    className="flex-1 group rounded-md px-2 py-2 hover:bg-neutral-50 text-left">
                    <div className="flex items-center">
                      <div className="w-40 font-medium text-neutral-900">
                        {inv.number}
                      </div>
                      <div className="flex-1 text-neutral-700">
                        {inv.supplierName}
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <div className="text-neutral-500">Invoice Number</div>
                        <div className="font-medium">{inv.number}</div>
                      </div>
                      <div>
                        <div className="text-neutral-500">Supplier</div>
                        <div className="font-medium">{inv.supplierName}</div>
                      </div>
                      <div>
                        <div className="text-neutral-500">Total</div>
                        <div className="font-medium tabular-nums">
                          {inv.total.toFixed(2)}
                        </div>
                      </div>
                      <div>
                        <div className="text-neutral-500">Created</div>
                        <div className="font-medium">
                          {new Date(inv.createdAt).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
