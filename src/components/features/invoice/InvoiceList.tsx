import {ReactNode} from 'react';
import {FiChevronDown, FiChevronRight} from 'react-icons/fi';

export interface BaseInvoice {
  id: number;
  number: string;
  total: number;
  createdAt: string;
  invoiceDate?: string;
  address?: string;
  supplierName?: string;
  customerName?: string;
  totalQty?: number;
}

interface InvoiceListProps<T> {
  invoices: T[];
  selectedIds: Set<number>;
  allSelected: boolean;
  expandedId: number | null;
  onToggleSelect: (id: number) => void;
  onToggleAll: () => void;
  onToggleExpand: (invoice: T) => void;
  renderExpandedContent: (invoice: T) => ReactNode;
  renderActions: (invoice: T) => ReactNode;
  // FIX: Changed signature to accept the whole invoice object
  formatDate: (invoice: T) => string;
}

export default function InvoiceList<T extends BaseInvoice>({
  invoices,
  selectedIds,
  allSelected,
  expandedId,
  onToggleSelect,
  onToggleAll,
  onToggleExpand,
  renderExpandedContent,
  renderActions,
  formatDate,
}: InvoiceListProps<T>) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-neutral-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-4 px-4 py-3 bg-neutral-50 border-b border-neutral-200 text-xs font-semibold text-neutral-500 uppercase tracking-wider">
        {/* FIX: Increased width to w-8 and centered checkbox */}
        <div className="w-8 shrink-0 flex justify-center">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={onToggleAll}
            // FIX: Increased size to size-5 and added accent color
            className="size-5 rounded border-neutral-300 accent-neutral-900 cursor-pointer"
          />
        </div>
        <div className="w-20 shrink-0">Number</div>
        <div className="w-28 shrink-0">Date</div>
        <div className="flex-1 min-w-0">Customer</div>
        <div className="flex-1 min-w-0">Address</div>
        <div className="w-24 shrink-0 text-center">Total Qty</div>
        <div className="w-28 shrink-0 text-right">Total Amount</div>
        <div className="w-6 shrink-0" aria-hidden />
      </div>

      {/* List */}
      {invoices.length === 0 ? (
        <div className="p-6 text-neutral-600">No invoices yet.</div>
      ) : (
        invoices.map((inv) => {
          const isSelected = selectedIds.has(inv.id);
          const isExpanded = expandedId === inv.id;
          const date = formatDate(inv);

          return (
            <div
              key={inv.id}
              className="group border-b border-neutral-100 last:border-0">
              <div
                onClick={() => onToggleExpand(inv)}
                className={`flex items-center gap-4 px-4 py-3 transition-colors cursor-pointer ${
                  isSelected ? 'bg-blue-50' : 'hover:bg-neutral-50'
                }`}>
                {/* FIX: Increased width to w-8 and centered checkbox */}
                <div className="w-8 shrink-0 flex justify-center">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggleSelect(inv.id)}
                    onClick={(e) => e.stopPropagation()}
                    // FIX: Increased size to size-5 and added accent color
                    className="size-5 rounded border-neutral-300 accent-neutral-900 cursor-pointer"
                  />
                </div>
                <div className="w-20 shrink-0 font-mono text-sm font-medium text-neutral-700">
                  {inv.number}
                </div>

                <div className="w-28 shrink-0 text-sm text-neutral-600">
                  {date || '-'}
                </div>

                <div className="flex-1 min-w-0 font-medium text-neutral-900 truncate">
                  {(inv as any).supplierName || (inv as any).customerName}
                </div>
                <div className="flex-1 min-w-0 text-sm text-neutral-500 truncate">
                  {inv.address || '-'}
                </div>
                <div className="w-24 shrink-0 text-center text-sm text-neutral-600">
                  {(inv as any).totalQty ?? '-'}
                </div>
                <div className="w-28 shrink-0 text-right font-medium tabular-nums">
                  {inv.total.toLocaleString()}
                </div>
                <div className="w-6 shrink-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleExpand(inv);
                    }}
                    className="p-1 hover:bg-neutral-200 rounded text-neutral-400 hover:text-neutral-600 transition-colors">
                    {isExpanded ? <FiChevronDown /> : <FiChevronRight />}
                  </button>
                </div>
              </div>

              {/* Expanded Content */}
              {isExpanded && (
                <div className="bg-neutral-50/80 px-6 py-4 border-t border-neutral-200 shadow-inner">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-neutral-700">
                      <span className="uppercase tracking-wide">
                        Invoice Items
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {renderActions(inv)}
                    </div>
                  </div>
                  <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden shadow-sm">
                    {renderExpandedContent(inv)}
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
