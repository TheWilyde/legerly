import {useEffect, useMemo, useState} from 'react';
import {useNavigate, useSearchParams} from 'react-router-dom';
import {FiSave, FiTrash2} from 'react-icons/fi';
import type React from 'react';

import PageHeader from '../components/common/PageHeader';
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
  debit: string;
  credit: string;
  crDr: 'CR' | 'DR';
};

export default function LedgerCreate() {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const editingId = Number(search.get('id') || '') || undefined;

  const [customerName, setCustomerName] = useState('');
  const [contactNo, setContactNo] = useState('');
  const [items, setItems] = useState<PersistedRow[]>([]);
  const [inputRows, setInputRows] = useState<InputRow[]>([
    {id: -1, date: '', particulars: '', debit: '', credit: '', crDr: 'CR'},
  ]);
  const [saving, setSaving] = useState(false);

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

  const handleGridKey = useGridKey(['date', 'particulars', 'debit', 'credit']);

  function updateInputRow(id: number, patch: Partial<InputRow>) {
    setInputRows((prev) =>
      prev.map((r) => (r.id === id ? {...r, ...patch} : r))
    );
  }

  function addRow() {
    setInputRows((prev) => [
      ...prev,
      {
        id: -Date.now(),
        date: '',
        particulars: '',
        debit: '',
        credit: '',
        crDr: 'CR',
      },
    ]);
  }

  function updateItemRow(id: number, patch: Partial<PersistedRow>) {
    setItems((prev) => prev.map((r) => (r.id === id ? {...r, ...patch} : r)));
  }

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

  useEffect(() => {
    (async () => {
      if (!editingId) return;
      const doc = await window.api?.ledger?.get(editingId);
      if (!doc) return;
      setCustomerName(doc.customerName || '');
      setContactNo(doc.contactNo || '');
      setItems(
        (doc.rows || []).map((r: any) => ({
          id: Number(r.id),
          date: r.date || '',
          particulars: r.particulars || '',
          debit: Number(r.debit) || 0,
          credit: Number(r.credit) || 0,
          crDr: (r.crDr as 'CR' | 'DR') || 'CR',
          position: Number(r.position) || 0,
        }))
      );
      setInputRows([
        {
          id: -Date.now(),
          date: '',
          particulars: '',
          debit: '',
          credit: '',
          crDr: 'CR',
        },
      ]);
    })();
  }, [editingId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const persisted = items.map((r, idx) => ({
      id: Number(r.id) || 0,
      date: r.date || '',
      particulars: r.particulars || '',
      debit: Number(r.debit) || 0,
      credit: Number(r.credit) || 0,
      crDr: (r.crDr as 'CR' | 'DR') || 'CR',
      position: idx + 1,
    }));

    const inputs = inputRows
      .filter(
        (r) =>
          r.date ||
          r.particulars ||
          (parseFloat(String(r.debit)) || 0) !== 0 ||
          (parseFloat(String(r.credit)) || 0) !== 0
      )
      .map((r, i) => ({
        id: 0,
        date: r.date || '',
        particulars: r.particulars || '',
        debit: parseFloat(String(r.debit)) || 0,
        credit: parseFloat(String(r.credit)) || 0,
        crDr: (r.crDr as 'CR' | 'DR') || 'CR',
        position: persisted.length + i + 1,
      }));

    const rows = [...persisted, ...inputs];

    if (!customerName.trim()) {
      alert('Customer Name is required');
      return;
    }
    if (rows.length === 0) {
      alert('Add at least one row');
      return;
    }

    const rowTotals = rows.reduce(
      (acc, r) => {
        acc.debit += r.debit;
        acc.credit += r.credit;
        return acc;
      },
      {debit: 0, credit: 0}
    );

    const payload = {
      id: editingId,
      customerName: customerName.trim(),
      contactNo: (contactNo || '').trim(),
      totals: {
        debit: rowTotals.debit,
        credit: rowTotals.credit,
        net: rowTotals.credit - rowTotals.debit,
      },
      rows,
    };

    setSaving(true);
    try {
      const res = await window.api?.ledger?.save(payload);
      if (res?.error) {
        console.error('Ledger save error:', res.error);
        alert('Failed to save ledger');
        return;
      }
      navigate('/ledger');
    } catch (err) {
      console.error('Ledger save failed:', err);
      alert('Failed to save ledger');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader title={editingId ? 'Edit Ledger' : 'New Ledger'}>
        {selectedArray.length > 0 && (
          <button
            type="button"
            onClick={handleDeleteSelected}
            className="inline-flex items-center gap-2 h-9 px-3 rounded-md border border-red-200 text-red-700 hover:bg-red-50"
            title="Delete selected">
            <FiTrash2 className="size-4" />
            <span>Delete</span>
          </button>
        )}
        <button
          form="ledger-form"
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 h-9 px-3 rounded-md bg-neutral-900 text-white hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed">
          <FiSave className="size-4" />
          <span>{saving ? 'Saving…' : 'Save Ledger'}</span>
        </button>
        <button
          type="button"
          onClick={() => navigate('/ledger')}
          disabled={saving}
          className="inline-flex items-center gap-2 h-9 px-3 rounded-md border border-neutral-200 hover:bg-neutral-100 disabled:opacity-50 disabled:cursor-not-allowed">
          Cancel
        </button>
      </PageHeader>

      <form
        id="ledger-form"
        onSubmit={handleSubmit}
        onKeyDown={preventEnterSubmit}
        className="mt-4 space-y-4">
        {/* Header inputs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white p-4 rounded-md border border-neutral-200">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-neutral-700">
              Customer Name <span className="text-red-500">*</span>
            </span>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.currentTarget.value)}
              className="h-9 border border-neutral-300 rounded-md px-3 outline-none focus:ring-2 focus:ring-neutral-400/40 focus:border-neutral-400"
              required
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-neutral-700">
              Contact No
            </span>
            <input
              type="tel"
              value={contactNo}
              onChange={(e) => setContactNo(e.currentTarget.value)}
              className="h-9 border border-neutral-300 rounded-md px-3 outline-none focus:ring-2 focus:ring-neutral-400/40 focus:border-neutral-400"
            />
          </label>
        </div>

        {/* Ledger table */}
        <div className="bg-white rounded-md border border-neutral-200 overflow-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 bg-neutral-50 border-b border-neutral-200">
              <tr className="text-neutral-600">
                <Th className="w-8 text-center">
                  <input
                    type="checkbox"
                    className="size-5 accent-neutral-800"
                    checked={allSelected}
                    onChange={toggleAll}
                    aria-label="Select all"
                  />
                </Th>
                <Th className="w-12 text-center">S.No</Th>
                <Th className="w-32 text-center">Date</Th>
                <Th className="text-left">Particulars</Th>
                <Th className="w-28 text-center">Debit</Th>
                <Th className="w-28 text-center">Credit</Th>
                <Th className="w-32 text-center">Balance</Th>
                <Th className="w-16 text-center">CR/DR</Th>
              </tr>
            </thead>
            <tbody>
              {/* Persisted rows */}
              {items.map((r, i) => {
                const isSelected = selectedIds.has(r.id);
                return (
                  <tr key={r.id} className="border-b border-neutral-100">
                    <Td className="text-center">
                      <input
                        type="checkbox"
                        className="size-5 accent-neutral-900"
                        checked={isSelected}
                        onChange={() => toggleRow(r.id)}
                      />
                    </Td>
                    <Td className="text-center">{i + 1}</Td>
                    <Td>
                      <input
                        type="date"
                        value={r.date}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          updateItemRow(r.id, {date: e.currentTarget.value})
                        }
                        onKeyDown={handleGridKey}
                        data-section="items"
                        data-row-index={String(i)}
                        data-col="date"
                        className="w-full h-8 bg-transparent border-0 outline-none px-2"
                      />
                    </Td>
                    <Td>
                      <input
                        type="text"
                        value={r.particulars}
                        placeholder="Details"
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          updateItemRow(r.id, {
                            particulars: e.currentTarget.value,
                          })
                        }
                        onKeyDown={handleGridKey}
                        data-section="items"
                        data-row-index={String(i)}
                        data-col="particulars"
                        className="w-full h-8 bg-transparent border-0 outline-none px-2"
                      />
                    </Td>
                    <Td className="text-center">
                      <input
                        type="number"
                        step="0.01"
                        value={String(r.debit ?? '')}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          updateItemRow(r.id, {
                            debit: Number(e.currentTarget.value) || 0,
                          })
                        }
                        onKeyDown={handleGridKey}
                        data-section="items"
                        data-row-index={String(i)}
                        data-col="debit"
                        className="w-full h-8 bg-transparent border-0 outline-none px-2 text-center"
                        placeholder="0.00"
                      />
                    </Td>
                    <Td className="text-center">
                      <input
                        type="number"
                        step="0.01"
                        value={String(r.credit ?? '')}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          updateItemRow(r.id, {
                            credit: Number(e.currentTarget.value) || 0,
                          })
                        }
                        onKeyDown={handleGridKey}
                        data-section="items"
                        data-row-index={String(i)}
                        data-col="credit"
                        className="w-full h-8 bg-transparent border-0 outline-none px-2 text-center"
                        placeholder="0.00"
                      />
                    </Td>
                    <Td className="text-center tabular-nums font-semibold">
                      {(runningBalances[i] ?? 0).toFixed(2)}
                    </Td>
                    <Td className="text-center">
                      <select
                        className="w-full h-8 bg-transparent border-0 outline-none"
                        value={r.crDr}
                        onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                          updateItemRow(r.id, {
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

              {/* Input rows */}
              {inputRows.map((r, idx) => {
                const serial = items.length + idx + 1;
                const runIdx = items.length + idx;
                const isSelected = selectedIds.has(r.id);
                const showBal = !!(
                  r.date ||
                  r.particulars ||
                  r.debit ||
                  r.credit
                );
                return (
                  <tr key={r.id} className="border-b border-neutral-100">
                    <Td className="text-center">
                      <input
                        type="checkbox"
                        className="size-5 accent-neutral-900"
                        checked={isSelected}
                        onChange={() => toggleRow(r.id)}
                      />
                    </Td>
                    <Td className="text-center text-neutral-400">{serial}</Td>
                    <Td>
                      <input
                        type="date"
                        value={r.date}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          updateInputRow(r.id, {date: e.currentTarget.value})
                        }
                        onKeyDown={handleGridKey}
                        data-section="inputs"
                        data-row-index={String(idx)}
                        data-col="date"
                        className="w-full h-8 bg-transparent border-0 outline-none px-2"
                      />
                    </Td>
                    <Td>
                      <input
                        type="text"
                        value={r.particulars}
                        placeholder="Details"
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          updateInputRow(r.id, {
                            particulars: e.currentTarget.value,
                          })
                        }
                        onKeyDown={handleGridKey}
                        data-section="inputs"
                        data-row-index={String(idx)}
                        data-col="particulars"
                        className="w-full h-8 bg-transparent border-0 outline-none px-2"
                      />
                    </Td>
                    <Td className="text-center">
                      <input
                        type="number"
                        step="0.01"
                        value={r.debit}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          updateInputRow(r.id, {debit: e.currentTarget.value})
                        }
                        onKeyDown={handleGridKey}
                        data-section="inputs"
                        data-row-index={String(idx)}
                        data-col="debit"
                        className="w-full h-8 bg-transparent border-0 outline-none px-2 text-center"
                        placeholder="0.00"
                      />
                    </Td>
                    <Td className="text-center">
                      <input
                        type="number"
                        step="0.01"
                        value={r.credit}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          updateInputRow(r.id, {credit: e.currentTarget.value})
                        }
                        onKeyDown={handleGridKey}
                        data-section="inputs"
                        data-row-index={String(idx)}
                        data-col="credit"
                        className="w-full h-8 bg-transparent border-0 outline-none px-2 text-center"
                        placeholder="0.00"
                      />
                    </Td>
                    <Td className="text-center tabular-nums text-neutral-400">
                      {showBal ? (runningBalances[runIdx] ?? 0).toFixed(2) : ''}
                    </Td>
                    <Td className="text-center">
                      <select
                        className="w-full h-8 bg-transparent border-0 outline-none"
                        value={r.crDr}
                        onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
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

            {/* Totals */}
            <tfoot className="bg-neutral-50 border-t-2 border-neutral-200 font-semibold">
              <tr>
                <Td colSpan={4} className="text-right">
                  Totals:
                </Td>
                <Td className="text-center tabular-nums">
                  {totals.debit.toFixed(2)}
                </Td>
                <Td className="text-center tabular-nums">
                  {totals.credit.toFixed(2)}
                </Td>
                <Td className="text-center tabular-nums">
                  {totals.net.toFixed(2)}
                </Td>
                <Td />
              </tr>
            </tfoot>
          </table>

          <div className="flex items-center gap-3 px-4 py-3 border-t border-neutral-200">
            <AddRowButton onClick={addRow} />
          </div>
        </div>
      </form>
    </div>
  );
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
