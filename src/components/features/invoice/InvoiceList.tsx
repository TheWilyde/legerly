import {ReactNode} from 'react';
import {FiChevronDown} from 'react-icons/fi';

type BaseInvoice = {
  id: number;
  number: string;
  supplierName: string;
  total: number;
  createdAt: string;
  address?: string;
  invoiceDate?: string;
  totalQty: number;
};

type InvoiceListProps<T extends BaseInvoice> = {
  invoices: T[];
  selectedIds: Set<number>;
  allSelected: boolean;
  expandedId: number | null;
  onToggleSelect: (id: number) => void;
  onToggleAll: () => void;
  onToggleExpand: (invoice: T) => void;
  renderExpandedContent: (invoice: T) => ReactNode;
  renderActions?: (invoice: T) => ReactNode; // ✅ Add optional renderActions prop
  formatDate: (date?: string) => string;
};

export default function InvoiceList<T extends BaseInvoice>({
  invoices,
  selectedIds,
  allSelected,
  expandedId,
  onToggleSelect,
  onToggleAll,
  onToggleExpand,
  renderExpandedContent,
  renderActions, // ✅ Destructure renderActions
  formatDate,
}: InvoiceListProps<T>) {
  return (
    <div className="mt-4 bg-white rounded-md overflow-auto max-h-[75vh]">
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 flex items-center gap-3 px-4 py-2 bg-neutral-50 border-b border-neutral-200 text-sm font-medium text-neutral-600">
        <div className="w-8 flex justify-center">
          <input
            type="checkbox"
            className="size-5 accent-neutral-800"
            checked={allSelected}
            onChange={onToggleAll}
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
            ? formatDate(inv.invoiceDate)
            : formatDate(inv.createdAt);

          return (
            <div key={inv.id} className="px-4">
              <div className="flex items-center gap-3 py-2">
                <div className="w-8 flex justify-center">
                  <input
                    type="checkbox"
                    className="size-5 accent-neutral-900"
                    checked={isSelected}
                    onChange={() => onToggleSelect(inv.id)}
                    title="Select invoice"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>

                <button
                  onClick={() => onToggleExpand(inv)}
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

              {/* ✅ Render actions if expanded and renderActions exists */}
              {isExpanded && renderActions && (
                <div className="px-2 pb-2">{renderActions(inv)}</div>
              )}

              {isExpanded && (
                <div className="mb-4 rounded-md border border-neutral-200 bg-neutral-50 p-3">
                  {renderExpandedContent(inv)}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
