import {useEffect, useMemo, useState} from 'react';
import {useNavigate, useSearchParams} from 'react-router-dom';
import {FiSave, FiTrash2} from 'react-icons/fi';

import PageHeader from '../components/common/PageHeader';
import IconButton from '../components/common/IconButton';
import Button from '../components/common/Button';
import Checkbox from '../components/common/Checkbox';
import Input from '../components/common/Input';
import NumberInput from '../components/common/NumberInput';
import AddRowButton from '../components/common/AddRowButton';
import {useSelection} from '../components/hooks/useSelection';
import {useGridKey} from '../components/hooks/useGridKey';

type PersistedRow = {
  id: number;
  date: string;
  particulars: string;
  debit: number;
  credit: number;
  crDr: 'CR' | 'DR';
};

type InputRow = {
  id: number;
  date: string;
  particulars: string;
  debit: string; // typing as string (like ItemsEditor)
  credit: string; // typing as string (like ItemsEditor)
  crDr: 'CR' | 'DR';
};

export default function LedgerCreate() {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const editingId = search.get('id') ? Number(search.get('id')) : undefined;

  // Header inputs
  const [customerName, setCustomerName] = useState('');
  const [contactNo, setContactNo] = useState('');

  // Table state (ItemsEditor-like flow)
  const [items, setItems] = useState<PersistedRow[]>([]);
  const [inputRows, setInputRows] = useState<InputRow[]>([
    {id: -1, date: '', particulars: '', debit: '', credit: '', crDr: 'CR'},
  ]);
  const [saving, setSaving] = useState(false);

  // Selection (shared hook)
  const allIds = useMemo(
    () => [...items.map((i) => i.id), ...inputRows.map((r) => r.id)],
    [items, inputRows]
  );
  const {
    selected: selectedIds,
    allSelected,
    selectedArray,
    toggle: toggleRow,
    toggleAll,
    clear,
  } = useSelection(allIds);

  // Keyboard navigation across editable inputs (skip DR/CR select)
  const handleGridKey = useGridKey(['date', 'particulars', 'debit', 'credit']);

  // Row utils
  function isInputEmpty(r: InputRow) {
    const nz = (v: string) => (parseFloat(v) || 0) !== 0;
    return !r.date && !r.particulars && !nz(r.debit) && !nz(r.credit);
  }
  function normalizeInputRows(next: InputRow[]) {
    // Ensure exactly one trailing empty row
    const last = next[next.length - 1];
    if (last && !isInputEmpty(last)) {
      next = [
        ...next,
        {
          id: -Date.now(),
          date: '',
          particulars: '',
          debit: '',
          credit: '',
          crDr: 'CR',
        },
      ];
    }
    // Collapse multiple trailing empties into one
    while (
      next.length >= 2 &&
      isInputEmpty(next[next.length - 1]) &&
      isInputEmpty(next[next.length - 2])
    ) {
      next = next.slice(0, -2).concat(next[next.length - 1]);
    }
    return next;
  }
  function updateInputRow(id: number, patch: Partial<InputRow>) {
    setInputRows((prev) => {
      const next = prev.map((r) => (r.id === id ? {...r, ...patch} : r));
      return normalizeInputRows(next);
    });
  }
  function addRow() {
    setInputRows((prev) =>
      normalizeInputRows([
        ...prev,
        {
          id: -Date.now(),
          date: '',
          particulars: '',
          debit: '',
          credit: '',
          crDr: 'CR',
        },
      ])
    );
  }

  // Running Net Balance across persisted + inputs
  const runningBalances = useMemo(() => {
    let bal = 0;
    const seq = [
      ...items.map((r) => ({debit: r.debit, credit: r.credit})),
      ...inputRows.map((r) => ({
        debit: parseFloat(r.debit) || 0,
        credit: parseFloat(r.credit) || 0,
      })),
    ];
    return seq.map(({debit, credit}) => {
      bal += credit - debit;
      return bal;
    });
  }, [items, inputRows]);

  // Totals (current ledger)
  const totals = useMemo(() => {
    let debit = 0;
    let credit = 0;
    items.forEach((r) => {
      debit += Number(r.debit) || 0;
      credit += Number(r.credit) || 0;
    });
    inputRows.forEach((r) => {
      debit += parseFloat(r.debit) || 0;
      credit += parseFloat(r.credit) || 0;
    });
    return {debit, credit, net: credit - debit};
  }, [items, inputRows]);

  function handleDeleteSelected() {
    if (selectedArray.length === 0) return;
    setItems((prev) => prev.filter((r) => !selectedIds.has(r.id)));
    setInputRows((prev) => {
      const kept = prev.filter((r) => !selectedIds.has(r.id));
      return kept.length === 0
        ? [
            {
              id: -Date.now(),
              date: '',
              particulars: '',
              debit: '',
              credit: '',
              crDr: 'CR',
            },
          ]
        : kept;
    });
    clear();
  }

  function preventEnterSubmit(e: React.KeyboardEvent<HTMLFormElement>) {
    if (e.key === 'Enter') e.preventDefault();
  }

  // Load existing ledger for editing (if editingId present)
  useEffect(() => {
    if (!editingId) return;
    (async () => {
      try {
        const doc = await (window as any).api?.ledger?.get?.(editingId);
        if (!doc) return;
        // Expecting: { id, customerName, contactNo, rows: [{date, particulars, debit, credit, crDr, position}] }
        setCustomerName(doc.customerName ?? '');
        setContactNo(doc.contactNo ?? '');
        const persisted = Array.isArray(doc.rows)
          ? (doc.rows as any[])
              .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
              .map<PersistedRow>((r, i) => ({
                id: r.id ?? i + 1, // fall back if row id missing
                date: r.date ?? '',
                particulars: r.particulars ?? '',
                debit: Number(r.debit) || 0,
                credit: Number(r.credit) || 0,
                crDr: (r.crDr as 'CR' | 'DR') ?? 'CR',
              }))
          : [];
        setItems(persisted);
        // Start with a single empty input row for appending
        setInputRows([
          {
            id: -1,
            date: '',
            particulars: '',
            debit: '',
            credit: '',
            crDr: 'CR',
          },
        ]);
      } catch (err) {
        console.error('Failed to load ledger:', err);
      }
    })();
  }, [editingId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      // Gather rows: persisted (current items) + new non-empty input rows
      const newRows = inputRows
        .filter((r) => r.date || r.particulars || r.debit || r.credit)
        .map<PersistedRow>((r) => ({
          id: 0,
          date: r.date,
          particulars: r.particulars,
          debit: parseFloat(r.debit) || 0,
          credit: parseFloat(r.credit) || 0,
          crDr: r.crDr,
        }));

      const rowsForSave = [...items, ...newRows].map((r, idx) => ({
        id: r.id > 0 ? r.id : undefined, // let backend assign for new rows
        date: r.date,
        particulars: r.particulars,
        debit: r.debit,
        credit: r.credit,
        crDr: r.crDr,
        position: idx, // keep stable order
      }));

      const payload = {
        id: editingId, // undefined for new
        customerName: customerName.trim(),
        contactNo: contactNo.trim(),
        totals: {
          debit: totals.debit,
          credit: totals.credit,
          net: totals.net,
        },
        rows: rowsForSave,
      };

      await (window as any).api?.ledger?.save?.(payload);
      navigate('/ledger');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader title="New Ledger">
        {selectedArray.length > 0 && (
          <IconButton
            type="button"
            onClick={handleDeleteSelected}
            variant="danger"
            startIcon={<FiTrash2 className="size-4" />}
            title="Delete selected">
            Delete
          </IconButton>
        )}
        <Button
          form="ledger-form"
          type="submit"
          variant="primary"
          className="gap-2"
          disabled={saving}>
          <FiSave className="size-4" />
          <span>{saving ? 'Saving…' : 'Save Ledger'}</span>
        </Button>
        <Button
          type="button"
          onClick={() => navigate('/ledger')}
          disabled={saving}>
          Cancel
        </Button>
      </PageHeader>

      <form
        id="ledger-form"
        onSubmit={handleSubmit}
        onKeyDown={preventEnterSubmit}
        className="mt-4 space-y-4">
        {/* One-line: Customer Name + Contact No */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white p-4 rounded-md">
          <label className="flex flex-col gap-1">
            <span className="text-base text-neutral-800">Customer Name</span>
            <Input
              value={customerName}
              onChange={(e) => setCustomerName(e.currentTarget.value)}
              className="h-9"
              required
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-base text-neutral-800">Contact No</span>
            <Input
              type="tel"
              value={contactNo}
              onChange={(e) => setContactNo(e.currentTarget.value)}
              className="h-9"
            />
          </label>
        </div>

        {/* Ledger editor table */}
        <div className="bg-white rounded-md border border-neutral-200 overflow-auto">
          <table className="w-full text-base border-collapse">
            <thead className="sticky top-0 bg-neutral-50 border-b border-neutral-200">
              <tr className="text-neutral-600">
                <Th className="w-8 text-center">
                  <Checkbox
                    checked={allSelected}
                    onChange={toggleAll}
                    aria-label="Select all"
                  />
                </Th>
                <Th className="w-16 text-center">S. No</Th>
                <Th className="w-32 text-left">Date</Th>
                <Th className="text-left">Particulars</Th>
                <Th className="w-28 text-center">Debit</Th>
                <Th className="w-28 text-center">Credit</Th>
                <Th className="w-36 text-center">Net Balance</Th>
                <Th className="w-20 text-center">DR/CR</Th>
              </tr>
            </thead>
            <tbody>
              {/* Persisted rows (read-only) */}
              {items.map((r, i) => {
                const idx = i + 1;
                const isSelected = selectedIds.has(r.id);
                return (
                  <tr key={r.id} className="border-b border-neutral-100">
                    <Td className="text-center">
                      <Checkbox
                        checked={isSelected}
                        onChange={() => toggleRow(r.id)}
                      />
                    </Td>
                    <Td className="text-center">{idx}</Td>
                    <Td className="text-left">{r.date}</Td>
                    <Td className="text-left">{r.particulars}</Td>
                    <Td className="text-center tabular-nums">
                      {(Number(r.debit) || 0).toFixed(2)}
                    </Td>
                    <Td className="text-center tabular-nums">
                      {(Number(r.credit) || 0).toFixed(2)}
                    </Td>
                    <Td className="text-center tabular-nums">
                      {(runningBalances[i] ?? 0).toFixed(2)}
                    </Td>
                    <Td className="text-center">{r.crDr}</Td>
                  </tr>
                );
              })}

              {/* Input rows (editable) */}
              {inputRows.map((r, idx) => {
                const serial = items.length + idx + 1;
                const runIdx = items.length + idx;
                const isSelected = selectedIds.has(r.id);
                return (
                  <tr
                    key={r.id}
                    className="border-b border-neutral-100 hover:bg-neutral-50">
                    <Td className="text-center">
                      <Checkbox
                        checked={isSelected}
                        onChange={() => toggleRow(r.id)}
                      />
                    </Td>
                    <Td className="text-center">{serial}</Td>
                    <Td>
                      <Input
                        type="date"
                        value={r.date}
                        onChange={(e) =>
                          updateInputRow(r.id, {date: e.currentTarget.value})
                        }
                        onKeyDown={handleGridKey}
                        data-section="inputs"
                        data-row-index={String(idx)}
                        data-col="date"
                        className="!h-8 bg-transparent outline-none text-sm"
                      />
                    </Td>
                    <Td className="text-left">
                      <Input
                        value={r.particulars}
                        placeholder="Details"
                        onChange={(e) =>
                          updateInputRow(r.id, {
                            particulars: e.currentTarget.value,
                          })
                        }
                        onKeyDown={handleGridKey}
                        data-section="inputs"
                        data-row-index={String(idx)}
                        data-col="particulars"
                        className="!h-8 w-full bg-transparent outline-none"
                      />
                    </Td>
                    <Td className="text-center">
                      <NumberInput
                        value={r.debit}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          updateInputRow(r.id, {debit: e.currentTarget.value})
                        }
                        onKeyDown={handleGridKey}
                        data-section="inputs"
                        data-row-index={String(idx)}
                        data-col="debit"
                        className="!h-8 text-center bg-transparent outline-none"
                        placeholder="0.00"
                      />
                    </Td>
                    <Td className="text-center">
                      <NumberInput
                        value={r.credit}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          updateInputRow(r.id, {credit: e.currentTarget.value})
                        }
                        onKeyDown={handleGridKey}
                        data-section="inputs"
                        data-row-index={String(idx)}
                        data-col="credit"
                        className="!h-8 text-center bg-transparent outline-none"
                        placeholder="0.00"
                      />
                    </Td>
                    <Td className="text-center tabular-nums">
                      {showBalance(r)
                        ? (runningBalances[runIdx] ?? 0).toFixed(2)
                        : ''}
                    </Td>
                    <Td className="text-center">
                      <select
                        className="bg-transparent outline-none"
                        value={r.crDr}
                        onChange={(e) =>
                          updateInputRow(r.id, {
                            crDr: e.currentTarget.value as 'CR' | 'DR',
                          })
                        }>
                        <option value="CR">CR</option>
                        <option value="DR">DR</option>
                      </select>
                    </Td>
                  </tr>
                );
              })}
            </tbody>

            {/* Totals row (aligned with columns) */}
            <tfoot className="bg-neutral-50 border-t border-neutral-200 font-semibold">
              <tr>
                <Td className="text-center">{/* select col */}</Td>
                <Td className="text-center">{/* S. No */}</Td>
                <Td className="text-left">{/* Date */}</Td>
                <Td className="text-right">Totals:</Td>
                <Td className="text-center tabular-nums">
                  {totals.debit.toFixed(2)}
                </Td>
                <Td className="text-center tabular-nums">
                  {totals.credit.toFixed(2)}
                </Td>
                <Td className="text-center tabular-nums">
                  {totals.net.toFixed(2)}
                </Td>
                <Td className="text-center">{/* DR/CR */}</Td>
              </tr>
            </tfoot>
          </table>

          {/* Footer row with Add button (attached) */}
          <div className="flex items-center gap-3 px-4 py-3 border-t border-neutral-200">
            <AddRowButton onClick={addRow} />
          </div>
        </div>
      </form>
    </div>
  );
}

function showBalance(r: InputRow) {
  return !!(r.date || r.particulars || r.debit || r.credit);
}

function Th({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th className={`px-3 py-2 font-medium text-sm tracking-wide ${className}`}>
      {children}
    </th>
  );
}

function Td({
  children,
  className = '',
  colSpan,
}: {
  children?: React.ReactNode;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td colSpan={colSpan} className={`px-3 py-1.5 align-middle ${className}`}>
      {children}
    </td>
  );
}
