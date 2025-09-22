import {useEffect, useMemo, useState} from 'react';
import {Link} from 'react-router-dom';
import {FiPlus} from 'react-icons/fi';
import PageHeader from '../components/common/PageHeader';
import SummaryCard from '../components/common/SummaryCard';
import {useSelection} from '../components/hooks/useSelection';

type LedgerRow = {
  id: number;
  customerName: string;
  accountBalance: number;
};

export default function Ledger() {
  const [rows, setRows] = useState<LedgerRow[]>([]);

  // Load ledgers from main process (uses the same IPC namespace as LedgerCreate)
  useEffect(() => {
    (async () => {
      try {
        const list = await (window as any).api?.ledger?.list?.();
        if (!Array.isArray(list)) return;
        const mapped: LedgerRow[] = list.map((l: any) => ({
          id: Number(l.id),
          customerName: String(l.customerName ?? ''),
          // Prefer saved totals.net; fallback to 0 if not present
          accountBalance: Number(l.totals?.net ?? 0),
        }));
        setRows(mapped);
      } catch (err) {
        console.error('Failed to load ledgers:', err);
      }
    })();
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
    selectedArray,
    toggle,
    toggleAll,
    clear,
  } = useSelection(rows.map((r) => r.id));

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
          <div className="flex-1">Customer Name</div>
          <div className="w-32 text-right">Account Balance</div>
          <div className="w-20 text-center">DR/CR</div>
        </div>

        {rows.length === 0 ? (
          <div className="p-6 text-neutral-600">No ledger entries yet.</div>
        ) : (
          rows.map((row, idx) => {
            const isSelected = selectedIds.has(row.id);
            const crDr = row.accountBalance >= 0 ? 'CR' : 'DR';
            return (
              <div key={row.id} className="px-4">
                <div className="flex items-center gap-3 py-2">
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
                  <div className="flex-1 text-neutral-700">
                    {row.customerName}
                  </div>
                  <div className="w-32 text-right tabular-nums font-semibold">
                    {row.accountBalance.toFixed(2)}
                  </div>
                  <div className="w-20 text-center">{crDr}</div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
