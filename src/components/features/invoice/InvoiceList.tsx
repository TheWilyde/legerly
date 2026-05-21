import React from 'react';
import { FiChevronDown, FiChevronRight } from 'react-icons/fi';

// Generic interface to support both Purchase and Sale invoices
interface InvoiceWithStatus {
  id: number;
  number: string;
  supplierName?: string;
  customerName?: string;
  total: number;
  status?: 'draft' | 'posted';
  [key: string]: any;
}

interface InvoiceListProps<T extends InvoiceWithStatus> {
  invoices: T[];
  selectedIds: Set<number>;
  allSelected: boolean;
  expandedId: number | null;
  onToggleSelect: (id: number) => void;
  onToggleAll: () => void;
  onToggleExpand: (invoice: T) => void;
  renderExpandedContent: (invoice: T) => React.ReactNode;
  renderActions: (invoice: T) => React.ReactNode;
  formatDate: (invoice: T) => string;
}

export default function InvoiceList<T extends InvoiceWithStatus>({
  invoices,
  selectedIds,
  allSelected,
  expandedId,
  onToggleSelect,
  onToggleAll,
  onToggleExpand,
  formatDate,
  renderActions,
  renderExpandedContent,
}: InvoiceListProps<T>) {
  if (invoices.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 bg-white border border-neutral-200 rounded-lg text-neutral-500">
        <p>No invoices found.</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-neutral-200 rounded-lg shadow-sm">
      {/* ✅ Added Status Column (5th column) */}
      <div className="grid grid-cols-[40px_40px_100px_1fr_100px_120px_120px_100px] gap-4 px-4 py-3 bg-neutral-50 border-b border-neutral-200 text-xs font-semibold text-neutral-500 uppercase tracking-wider">
        <div className="flex justify-center">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={onToggleAll}
            className="size-4 rounded border-neutral-300 accent-neutral-900 cursor-pointer"
          />
        </div>
        <div></div>
        <div>Date</div>
        <div>Party Name</div>
        <div className="text-center">Status</div>
        <div>Invoice ID</div>
        <div className="text-right">Amount</div>
        <div className="text-right">Actions</div>
      </div>

      <div className="divide-y divide-neutral-100">
        {invoices.map((inv) => {
          const isExpanded = expandedId === inv.id;
          const isDraft = inv.status === 'draft';

          return (
            <React.Fragment key={inv.id}>
              <div
                className={`grid grid-cols-[40px_40px_100px_1fr_100px_120px_120px_100px] gap-4 px-4 py-3 items-center hover:bg-neutral-50 transition-colors ${isExpanded ? 'bg-neutral-50' : ''
                  } ${isDraft ? 'bg-yellow-50/40' : ''}`}>
                <div className="flex justify-center">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(inv.id)}
                    onChange={() => onToggleSelect(inv.id)}
                    className="size-4 rounded border-neutral-300 accent-neutral-900 cursor-pointer"
                  />
                </div>
                <button
                  onClick={() => onToggleExpand(inv)}
                  className="flex justify-center text-neutral-400 hover:text-neutral-600">
                  {isExpanded ? (
                    <FiChevronDown className="size-5" />
                  ) : (
                    <FiChevronRight className="size-5" />
                  )}
                </button>
                <div className="text-sm text-neutral-600">
                  {formatDate(inv) || <span className="text-neutral-400 italic">No Date</span>}
                </div>
                <div className="text-sm font-medium text-neutral-900 truncate">
                  {inv.supplierName || inv.customerName}
                </div>

                {/* ✅ Status Badge */}
                <div className="flex justify-center">
                  {isDraft ? (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 border border-yellow-200">
                      Draft
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200">
                      Posted
                    </span>
                  )}
                </div>

                <div className="text-sm text-neutral-600">{inv.invoiceIdPerPeriod ?? inv.number}</div>
                <div className="text-sm font-semibold text-neutral-900 text-right tabular-nums">
                  {inv.total.toLocaleString()}
                </div>
                <div className="flex justify-end">{renderActions(inv)}</div>
              </div>

              {isExpanded && (
                <div className="px-4 pb-4 pt-0 bg-neutral-50 border-b border-neutral-100">
                  <div className="pl-20">
                    {renderExpandedContent(inv)}
                  </div>
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
