import {Link, useNavigate} from 'react-router-dom';
import {FiPlus, FiTrash2} from 'react-icons/fi';
import PageHeader from '../components/common/PageHeader';
import SummaryCard from '../components/common/SummaryCard';
import {useSelection} from '../components/hooks/useSelection';
import {useInvoiceData} from '../components/hooks/useInvoiceData';
import {useInvoiceExpansion} from '../components/hooks/useInvoiceExpansion';
import {formatInvoiceDate} from '../utils/invoiceUtils';
import {useMemo} from 'react';

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

  // ✅ Reuse useInvoiceData hook for ledger list
  const {invoices: rows, reload} = useInvoiceData<LedgerRow>({
    fetchInvoices: async () => {
      const list = await window.api?.ledger?.list?.();
      return (list ?? []).map((l: any) => ({
        id: Number(l.id),
        customerName: String(l.customerName ?? ''),
        totalDebit: Number(l?.totals?.debit ?? 0),
        totalCredit: Number(l?.totals?.credit ?? 0),
        accountBalance: Number(l?.totals?.net ?? 0),
      }));
    },
  });

  // ✅ Reuse useInvoiceExpansion hook for ledger details
  const {expandedId, detailsById, toggleExpand} =
    useInvoiceExpansion<LedgerDetails>({
      fetchDetails: (id) => window.api?.ledger?.get?.(id),
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

  // Handle deletion
  async function handleDeleteSelected() {
    if (selectedArray.length === 0) return;
    await Promise.all(
      selectedArray.map((id) => window.api?.ledger?.delete?.(id))
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
      <div className="mb-4 rounded-md border border-neutral-200 bg-neutral-50 p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="font-semibold text-neutral-700">Ledger Entries</div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/ledger/new?id=${rowId}`);
              }}
              className="inline-flex items-center gap-2 h-8 px-3 rounded-md border border-neutral-200 hover:bg-neutral-100"
              title="Edit ledger">
              Edit
            </button>
          </div>
        </div>

        <div className="overflow-auto max-h-96">
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 bg-neutral-100 border-b border-neutral-200">
              <tr className="text-neutral-600">
                <th className="px-3 py-2 w-28 text-left font-medium">Date</th>
                <th className="px-3 py-2 text-left font-medium">Particulars</th>
                <th className="px-3 py-2 w-28 text-right font-medium">Debit</th>
                <th className="px-3 py-2 w-28 text-right font-medium">
                  Credit
                </th>
                <th className="px-3 py-2 w-20 text-center font-medium">
                  CR/DR
                </th>
                <th className="px-3 py-2 w-36 text-right font-medium">
                  Running Balance
                </th>
              </tr>
            </thead>
            <tbody>
              {(doc.rows ?? []).map((r: any, i: number) => {
                running += (Number(r.credit) || 0) - (Number(r.debit) || 0);
                return (
                  <tr
                    key={r.id ?? i}
                    className="border-b border-neutral-100 hover:bg-neutral-50">
                    <td className="px-3 py-1.5 text-neutral-700">
                      {formatInvoiceDate(r.date)}
                    </td>
                    <td className="px-3 py-1.5 text-neutral-700">
                      {r.particulars || '-'}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {Number(r.debit || 0).toFixed(2)}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {Number(r.credit || 0).toFixed(2)}
                    </td>
                    <td className="px-3 py-1.5 text-center">{r.crDr || ''}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums font-semibold">
                      {running.toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-neutral-50 border-t-2 border-neutral-200">
              <tr className="font-semibold">
                <td className="px-3 py-2" colSpan={2}>
                  Total:
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {doc.totals?.debit.toFixed(2) ?? '0.00'}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {doc.totals?.credit.toFixed(2) ?? '0.00'}
                </td>
                <td className="px-3 py-2"></td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {doc.totals?.net.toFixed(2) ?? '0.00'}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    );
  }

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
      <div className="mt-4 bg-white rounded-md overflow-auto max-h-[70vh]">
        {/* Sticky header */}
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
          <div className="w-12 text-center">S. NO</div>
          <div className="flex-1 min-w-[350px]">Customer Name</div>
          <div className="w-28 text-center">Total Debit</div>
          <div className="w-28 text-center">Total Credit</div>
          <div className="w-32 text-center">Account Balance</div>
          <div className="w-20 text-center">DR/CR</div>
          <div className="w-6" aria-hidden />
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
              <div key={row.id} className="px-4">
                <button
                  onClick={() => toggleExpand(row.id)}
                  className="w-full text-left">
                  <div
                    className={`flex items-center gap-3 py-2 rounded-md ${
                      isExpanded ? 'bg-neutral-50' : 'hover:bg-neutral-50'
                    }`}>
                    {/* Checkbox */}
                    <div className="w-8 flex justify-center">
                      <input
                        type="checkbox"
                        className="size-5 accent-neutral-900"
                        checked={isSelected}
                        onChange={() => toggle(row.id)}
                        onClick={(e) => e.stopPropagation()}
                        title="Select row"
                      />
                    </div>

                    {/* Serial number */}
                    <div className="w-12 text-center text-neutral-900">
                      {idx + 1}
                    </div>

                    {/* Customer name with expand icon */}
                    <div className="flex-1 min-w-[350px] text-neutral-700 font-medium">
                      {row.customerName}
                    </div>

                    {/* Total Debit */}
                    <div className="w-28 text-center tabular-nums">
                      {row.totalDebit.toFixed(2)}
                    </div>

                    {/* Total Credit */}
                    <div className="w-28 text-center tabular-nums">
                      {row.totalCredit.toFixed(2)}
                    </div>

                    {/* Account Balance */}
                    <div className="w-32 text-center tabular-nums font-semibold">
                      {row.accountBalance.toFixed(2)}
                    </div>

                    {/* CR/DR */}
                    <div className="w-20 text-center">{crDr}</div>

                    {/* Expand icon */}
                    <div className="w-6 flex justify-end">
                      <svg
                        className={`size-4 text-neutral-500 transition-transform ${
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
                </button>

                {/* Expanded details */}
                {isExpanded && renderDetails(row.id)}
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
