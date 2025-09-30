import {useEffect, useMemo, useState} from 'react';
import {Link, useNavigate} from 'react-router-dom';
import {FiPlus, FiChevronRight, FiChevronDown} from 'react-icons/fi';
import PageHeader from '../components/common/PageHeader';
import SummaryCard from '../components/common/SummaryCard';
import {useSelection} from '../components/hooks/useSelection';

type LedgerRow = {
  id: number;
  customerName: string;
  totalDebit: number;
  totalCredit: number;
  accountBalance: number;
};

export default function Ledger() {
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [details, setDetails] = useState<Record<number, any | undefined>>({});
  const navigate = useNavigate();

  // Load ledgers from main process (uses the same IPC namespace as LedgerCreate)
  useEffect(() => {
    (async () => {
      try {
        const list = await window.api?.ledger?.list?.();
        const mapped: LedgerRow[] = (list ?? []).map((l: any) => ({
          id: Number(l.id),
          customerName: String(l.customerName ?? ''),
          totalDebit: Number(l?.totals?.debit ?? 0),
          totalCredit: Number(l?.totals?.credit ?? 0),
          accountBalance: Number(l?.totals?.net ?? 0),
        }));
        setRows(mapped);
      } catch (err) {
        console.error('Failed to load ledgers:', err);
      }
    })();
  }, []);

  useEffect(() => {
    const onChanged = async () => {
      const list = await window.api?.ledger?.list?.();
      if (Array.isArray(list)) {
        setRows(
          list.map((l: any) => ({
            id: Number(l.id),
            customerName: String(l.customerName ?? ''),
            totalDebit: Number(l?.totals?.debit ?? 0),
            totalCredit: Number(l?.totals?.credit ?? 0),
            accountBalance: Number(l?.totals?.net ?? 0),
          }))
        );
        setExpandedId(null);
        setDetails({});
      }
    };
    window.addEventListener('workspace:active-changed', onChanged as any);
    return () =>
      window.removeEventListener('workspace:active-changed', onChanged as any);
  }, []);

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

  const {
    selected: selectedIds,
    allSelected,
    toggle,
    toggleAll,
  } = useSelection(rows.map((r) => r.id));

  async function toggleExpandRow(id: number) {
    setExpandedId((prev) => (prev === id ? null : id));
    if (!details[id]) {
      try {
        const doc = await (window as any).api?.ledger?.get?.(id);
        setDetails((d) => ({...d, [id]: doc}));
      } catch (e) {
        console.error('Failed to load ledger details:', e);
      }
    }
  }

  function renderDetails(rowId: number) {
    const doc = details[rowId];
    if (!doc) return null;
    let running = 0;
    return (
      <div className="mb-4 rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-700">
        <div className="flex items-center justify-between mb-2">
          <div className="font-semibold text-neutral-700">Items summary</div>
          <button
            type="button"
            onClick={() => navigate(`/ledger/new?id=${rowId}`)}
            className="inline-flex items-center gap-2 h-8 px-3 rounded-md border border-neutral-200 hover:bg-neutral-100"
            title="Edit ledger">
            Edit
          </button>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 bg-neutral-50 border-b border-neutral-200 text-neutral-600">
              <tr>
                <th className="px-3 py-2 w-28 text-center">Date</th>
                <th className="px-3 py-2 text-left">Particulars</th>
                <th className="px-3 py-2 w-28 text-right">Debit</th>
                <th className="px-3 py-2 w-28 text-right">Credit</th>
                <th className="px-3 py-2 w-20 text-center">CR/DR</th>
                <th className="px-3 py-2 w-36 text-right">Running Balance</th>
              </tr>
            </thead>
            <tbody>
              {(doc.rows ?? []).map((r: any, i: number) => {
                running += (Number(r.credit) || 0) - (Number(r.debit) || 0);
                return (
                  <tr key={r.id ?? i} className="border-b border-neutral-200">
                    <td className="px-3 py-1.5 text-center">{r.date || ''}</td>
                    <td className="px-3 py-1.5">{r.particulars || ''}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {Number(r.debit || 0).toFixed(2)}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {Number(r.credit || 0).toFixed(2)}
                    </td>
                    <td className="px-3 py-1.5 text-center">{r.crDr || ''}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {running.toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Header with New Ledger button */}
      <PageHeader title="Ledger">
        <Link
          to="/ledger/new"
          className="inline-flex items-center gap-2 h-9 px-3 rounded-md bg-neutral-900 text-white hover:bg-neutral-800"
          title="Create new ledger">
          <FiPlus className="size-4" />
          <span>New Ledger</span>
        </Link>
      </PageHeader>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SummaryCard cardTitle="Total Debit" cardValue={totalDebit} />
        <SummaryCard cardTitle="Total Credit" cardValue={totalCredit} />
        <SummaryCard
          cardTitle="Net Balance"
          cardValue={netBalance}
          profitLossIndicator={true}
        />
      </div>

      {/* Sticky header table */}
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
          <div className="w-12 text-center">S. NO</div>
          <div className="min-w-[21.875rem] flex-1">Customer Name</div>
          <div className="w-28 text-center">Total Debit</div>
          <div className="w-28 text-center">Total Credit</div>
          <div className="w-32 text-center">Account Balance</div>
          <div
            className="w-20 text-center"
            title="CR if net balance >= 0, else DR (net = credit - debit)">
            DR/CR
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="p-6 text-neutral-600">No ledger entries yet.</div>
        ) : (
          rows.map((row, idx) => {
            const isSelected = selectedIds.has(row.id);
            const crDr = row.accountBalance >= 0 ? 'CR' : 'DR';
            const isExpanded = expandedId === row.id;
            return (
              <div key={row.id} className="px-4">
                <div
                  className={`flex items-center gap-3 py-2 cursor-pointer ${
                    isExpanded ? 'bg-neutral-50' : 'hover:bg-neutral-50'
                  }`}
                  onClick={() => toggleExpandRow(row.id)}
                  title="Click to view details">
                  {/* Multi-select checkbox */}
                  <div className="w-8 flex justify-center">
                    <input
                      type="checkbox"
                      className="size-5 accent-neutral-900"
                      checked={isSelected}
                      onChange={() => toggle(row.id)}
                      title="Select row"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>

                  <div className="w-12 text-center text-neutral-900">
                    {idx + 1}
                  </div>
                  <div className="min-w-[21.875rem] flex-1 text-neutral-700 flex items-center gap-2">
                    {isExpanded ? (
                      <FiChevronDown className="shrink-0 text-neutral-500" />
                    ) : (
                      <FiChevronRight className="shrink-0 text-neutral-500" />
                    )}
                    <span>{row.customerName}</span>
                  </div>
                  <div className="w-28 text-center tabular-nums">
                    {row.totalDebit.toFixed(2)}
                  </div>
                  <div className="w-28 text-center tabular-nums">
                    {row.totalCredit.toFixed(2)}
                  </div>
                  <div className="w-32 text-center tabular-nums font-semibold">
                    {row.accountBalance.toFixed(2)}
                  </div>
                  <div
                    className="w-20 text-center"
                    title="CR if net balance >= 0, else DR (net = credit - debit)">
                    {crDr}
                  </div>
                </div>

                {isExpanded && renderDetails(row.id)}
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
