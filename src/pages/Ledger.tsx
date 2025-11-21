import {useMemo} from 'react';
import {Link, useNavigate} from 'react-router-dom';
import PageHeader from '../components/common/PageHeader';
// FIX: Added FiBox and FiEdit2 imports
import {FiPlus, FiTrash2, FiEdit2} from 'react-icons/fi';
import {useActiveProfile} from '../hooks/useActiveProfile';
import SummaryCard from '../components/common/SummaryCard';
import {useSelection} from '../components/hooks/useSelection';
import {useInvoiceData} from '../components/hooks/useInvoiceData';
import {useInvoiceExpansion} from '../components/hooks/useInvoiceExpansion';
import {formatInvoiceDate} from '../utils/invoiceUtils';

type LedgerRow = {
  id: number;
  customerName: string;
  totalDebit: number;
  totalCredit: number;
  accountBalance: number;
};

type LedgerDetails = {
  id: number;
  customerName: string;
  contactNo?: string;
  totals: {
    debit: number;
    credit: number;
    net: number;
  };
  rows: Array<{
    id?: number;
    date: string;
    particulars: string;
    debit: number;
    credit: number;
    crDr: 'CR' | 'DR';
  }>;
};

export default function Ledger() {
  const navigate = useNavigate();
  const profileId = useActiveProfile();

  // ✅ Fix: Pass profileId to fetchInvoices
  const {invoices: rows, reload} = useInvoiceData<LedgerRow>({
    fetchInvoices: async () => {
      if (!profileId) return [];
      const list = await window.api?.ledger?.list?.(profileId);
      return (list ?? []).map((l: any) => ({
        id: Number(l.id),
        customerName: String(l.customerName ?? ''),
        totalDebit: Number(l?.totals?.debit ?? 0),
        totalCredit: Number(l?.totals?.credit ?? 0),
        accountBalance: Number(l?.totals?.net ?? 0),
      }));
    },
  });

  // ✅ Fix: Pass profileId to fetchDetails
  const {expandedId, detailsById, toggleExpand} =
    useInvoiceExpansion<LedgerDetails>({
      fetchDetails: async (id) => {
        if (!profileId) return undefined;
        return await window.api?.ledger?.get?.(profileId, id);
      },
    });

  // ✅ Reuse useSelection hook
  const {
    selected: selectedIds,
    allSelected,
    selectedArray,
    toggle,
    toggleAll,
    clear,
  } = useSelection(rows.map((r) => r.id));

  // Calculate totals
  const {totalDebit, totalCredit, netBalance} = useMemo(() => {
    const debit = rows.reduce(
      (sum, r) => sum + (r.accountBalance < 0 ? -r.accountBalance : 0),
      0
    );
    const credit = rows.reduce(
      (sum, r) => sum + (r.accountBalance > 0 ? r.accountBalance : 0),
      0
    );
    const net = rows.reduce((sum, r) => sum + r.accountBalance, 0);
    return {totalDebit: debit, totalCredit: credit, netBalance: net};
  }, [rows]);

  // ✅ Fix: Pass profileId to delete
  async function handleDeleteSelected() {
    if (!profileId || selectedArray.length === 0) return;
    await Promise.all(
      selectedArray.map((id) => window.api?.ledger?.delete?.(profileId, id))
    );
    clear();
    await reload();
  }

  // Render expanded details
  function renderDetails(rowId: number) {
    const doc = detailsById[rowId];
    if (!doc) return null;

    let running = 0;

    return (
      <>
        {/* FIX: Header matching InvoiceList style */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-neutral-700">
            <span className="uppercase tracking-wide">Ledger Entries</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/ledger/new?id=${rowId}`);
              }}
              className="p-1.5 text-neutral-600 hover:bg-neutral-100 rounded-md transition-colors"
              title="Edit Ledger">
              <FiEdit2 className="size-4" />
            </button>
          </div>
        </div>

        {/* FIX: Grid layout matching ItemsSummary style */}
        <div className="bg-white rounded-lg border border-neutral-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <div className="min-w-[800px]">
              {/* Grid Header */}
              <div className="grid grid-cols-[120px_1fr_120px_120px_80px_140px] gap-2 px-4 py-2 bg-neutral-50 border-b border-neutral-200 text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                <div>Date</div>
                <div>Particulars</div>
                <div className="text-right">Debit</div>
                <div className="text-right">Credit</div>
                <div className="text-center">Type</div>
                <div className="text-right">Balance</div>
              </div>

              {/* Grid Rows */}
              {(doc.rows ?? []).map((r: any, i: number) => {
                running += (Number(r.credit) || 0) - (Number(r.debit) || 0);
                return (
                  <div
                    key={r.id ?? i}
                    className="grid grid-cols-[120px_1fr_120px_120px_80px_140px] gap-2 px-4 py-2 border-b border-neutral-100 last:border-0 hover:bg-neutral-50 text-sm transition-colors">
                    <div className="text-neutral-600">
                      {formatInvoiceDate(r.date)}
                    </div>
                    <div className="text-neutral-900 font-medium truncate">
                      {r.particulars || '-'}
                    </div>
                    <div className="text-right tabular-nums text-neutral-600">
                      {Number(r.debit || 0).toFixed(2)}
                    </div>
                    <div className="text-right tabular-nums text-neutral-600">
                      {Number(r.credit || 0).toFixed(2)}
                    </div>
                    <div className="text-center text-xs font-medium text-neutral-500">
                      {r.crDr || ''}
                    </div>
                    <div className="text-right tabular-nums font-semibold text-neutral-900">
                      {running.toFixed(2)}
                    </div>
                  </div>
                );
              })}

              {/* Grid Footer / Totals */}
              <div className="grid grid-cols-[120px_1fr_120px_120px_80px_140px] gap-2 px-4 py-3 bg-neutral-50 border-t border-neutral-200 text-sm font-bold text-neutral-900">
                <div className="col-span-2 text-right pr-4 text-neutral-600 uppercase tracking-wide text-xs self-center">
                  Total
                </div>
                <div className="text-right tabular-nums">
                  {doc.totals?.debit.toFixed(2) ?? '0.00'}
                </div>
                <div className="text-right tabular-nums">
                  {doc.totals?.credit.toFixed(2) ?? '0.00'}
                </div>
                <div></div>
                <div className="text-right tabular-nums">
                  {doc.totals?.net.toFixed(2) ?? '0.00'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  // ...existing useEffect for loading ledgers...

  return (
    <>
      {/* ✅ Reuse PageHeader component */}
      <PageHeader title="Ledger">
        <Link
          to="/ledger/new"
          className="inline-flex items-center gap-2 h-9 px-3 rounded-md bg-neutral-900 text-white hover:bg-neutral-800">
          <FiPlus className="size-4" />
          <span>New Ledger</span>
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

      {/* ✅ Reuse SummaryCard component */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SummaryCard cardTitle="Total Debit" cardValue={totalDebit} />
        <SummaryCard cardTitle="Total Credit" cardValue={totalCredit} />
        <SummaryCard
          cardTitle="Net Balance"
          cardValue={netBalance}
          profitLossIndicator={true}
        />
      </div>

      {/* Ledger list table */}
      <div className="mt-4 bg-white rounded-lg shadow-sm border border-neutral-200 overflow-hidden max-h-[70vh]">
        {/* Sticky header */}
        {/* FIX: Updated header styles to match InvoiceList */}
        <div className="sticky top-0 z-10 flex items-center gap-4 px-4 py-3 bg-neutral-50 border-b border-neutral-200 text-xs font-semibold text-neutral-500 uppercase tracking-wider">
          <div className="w-8 shrink-0 flex justify-center">
            <input
              type="checkbox"
              className="size-5 rounded border-neutral-300 accent-neutral-900 cursor-pointer"
              checked={allSelected}
              onChange={toggleAll}
              aria-label="Select all"
            />
          </div>
          <div className="w-12 shrink-0 text-center">S. NO</div>
          <div className="flex-1 min-w-[350px]">Customer Name</div>
          <div className="w-28 shrink-0 text-center">Total Debit</div>
          <div className="w-28 shrink-0 text-center">Total Credit</div>
          <div className="w-32 shrink-0 text-center">Account Balance</div>
          <div className="w-20 shrink-0 text-center">DR/CR</div>
          <div className="w-6 shrink-0" aria-hidden />
        </div>

        {/* List */}
        {rows.length === 0 ? (
          <div className="p-6 text-neutral-600">No ledger entries yet.</div>
        ) : (
          rows.map((row, idx) => {
            const isSelected = selectedIds.has(row.id);
            const isExpanded = expandedId === row.id;
            const crDr = row.accountBalance >= 0 ? 'CR' : 'DR';

            return (
              <div
                key={row.id}
                className="group border-b border-neutral-100 last:border-0">
                {/* FIX: Updated row structure to match InvoiceList */}
                <div
                  onClick={() => toggleExpand(row.id)}
                  className={`flex items-center gap-4 px-4 py-3 transition-colors cursor-pointer ${
                    isSelected ? 'bg-blue-50' : 'hover:bg-neutral-50'
                  }`}>
                  {/* Checkbox */}
                  <div className="w-8 shrink-0 flex justify-center">
                    <input
                      type="checkbox"
                      className="size-5 rounded border-neutral-300 accent-neutral-900 cursor-pointer"
                      checked={isSelected}
                      onChange={() => toggle(row.id)}
                      onClick={(e) => e.stopPropagation()}
                      title="Select row"
                    />
                  </div>

                  {/* Serial number */}
                  <div className="w-12 shrink-0 text-center font-mono text-sm text-neutral-600">
                    {idx + 1}
                  </div>

                  {/* Customer name */}
                  <div className="flex-1 min-w-[350px] text-neutral-900 font-medium truncate">
                    {row.customerName}
                  </div>

                  {/* Total Debit */}
                  <div className="w-28 shrink-0 text-center tabular-nums text-sm text-neutral-600">
                    {row.totalDebit.toFixed(2)}
                  </div>

                  {/* Total Credit */}
                  <div className="w-28 shrink-0 text-center tabular-nums text-sm text-neutral-600">
                    {row.totalCredit.toFixed(2)}
                  </div>

                  {/* Account Balance */}
                  <div className="w-32 shrink-0 text-center tabular-nums font-semibold text-sm">
                    {row.accountBalance.toFixed(2)}
                  </div>

                  {/* CR/DR */}
                  <div className="w-20 shrink-0 text-center text-xs font-medium text-neutral-500">
                    {crDr}
                  </div>

                  {/* Expand icon */}
                  <div className="w-6 shrink-0 flex justify-end">
                    <svg
                      className={`size-4 text-neutral-400 transition-transform ${
                        isExpanded ? 'rotate-180' : ''
                      }`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </div>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="bg-neutral-50/80 px-6 py-4 border-t border-neutral-200 shadow-inner">
                    {renderDetails(row.id)}
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
