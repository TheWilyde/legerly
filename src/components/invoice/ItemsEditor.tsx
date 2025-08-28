import React, {useMemo, useState} from 'react';
import {FiPlus} from 'react-icons/fi';
import {useGridKey} from '../hooks/useGridKey';
import CodeSuggest from '../CodeSuggest';
import InvoiceTotalsRow from './InvoiceTotalsRow';
import Checkbox from '../common/Checkbox';
import NumberInput from '../common/NumberInput';

export type EditorItem = {
  id: number;
  code: string;
  name: string;
  rate: number;
  qty: number;
};
export type EditorInputRow = {
  id: number;
  code: string;
  rate: string;
  qty: string;
};

type Props = {
  items: EditorItem[];
  setItems: React.Dispatch<React.SetStateAction<EditorItem[]>>;
  inputRows: EditorInputRow[];
  setInputRows: React.Dispatch<React.SetStateAction<EditorInputRow[]>>;
  stockByCode: Map<string, {name: string; purchaseRate: number}>;
  allCodes: string[];

  // selection
  selectedIds: Set<number>;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<number>>>;

  // headers
  codeHeader?: string;
  rateHeader?: string;
  qtyHeader?: string;
};

export default function ItemsEditor({
  items,
  setItems,
  inputRows,
  setInputRows,
  stockByCode,
  allCodes,
  selectedIds,
  setSelectedIds,
  codeHeader = 'Code',
  rateHeader = 'Rate',
  qtyHeader = 'Qty',
}: Props) {
  const cols = ['code', 'rate', 'qty'] as const;
  const handleGridKey = useGridKey(cols);
  const [openSuggestId, setOpenSuggestId] = useState<number | null>(null);

  const allSelectableIds = useMemo(
    () => [...items.map((i) => i.id), ...inputRows.map((r) => r.id)],
    [items, inputRows]
  );
  const allSelected =
    allSelectableIds.length > 0 && selectedIds.size === allSelectableIds.length;

  const computedTotal = useMemo(
    () => items.reduce((sum, it) => sum + it.rate * it.qty, 0),
    [items]
  );
  const totalQty = useMemo(
    () => items.reduce((sum, it) => sum + it.qty, 0),
    [items]
  );

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleSelectAll() {
    setSelectedIds((prev) =>
      prev.size === allSelectableIds.length
        ? new Set()
        : new Set(allSelectableIds)
    );
  }
  function isRowComplete(r: EditorInputRow) {
    return r.code.trim() !== '' && r.rate.trim() !== '' && r.qty.trim() !== '';
  }
  function commitInputRow(idx: number) {
    const row = inputRows[idx];
    if (!isRowComplete(row)) return;
    const code = row.code.trim();
    const rate = Number(row.rate);
    const qty = Number(row.qty);
    const rec = stockByCode.get(code);
    const name = rec?.name ?? '';
    setItems((prev) => [
      ...prev,
      {
        id: Date.now() + idx,
        code,
        name,
        rate: isNaN(rate) ? 0 : rate,
        qty: isNaN(qty) ? 0 : qty,
      },
    ]);
    setInputRows((rows) => {
      const copy = [...rows];
      copy[idx] = {id: copy[idx].id, code: '', rate: '', qty: ''};
      return copy;
    });
  }
  function addEmptyRow() {
    setInputRows((rows) => [
      ...rows,
      {id: -(Date.now() + rows.length + 1), code: '', rate: '', qty: ''},
    ]);
  }
  function updateItemField(
    id: number,
    field: 'code' | 'rate' | 'qty',
    value: string
  ) {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it;
        if (field === 'code') {
          const code = value.trim();
          const rec = stockByCode.get(code);
          const name = rec?.name ?? '';
          const rate =
            it.rate === 0 && rec?.purchaseRate != null
              ? rec.purchaseRate
              : it.rate;
          return {...it, code, name, rate};
        }
        if (field === 'rate') {
          const rate = Number(value);
          return {...it, rate: isNaN(rate) ? 0 : rate};
        }
        const qty = Number(value);
        return {...it, qty: isNaN(qty) ? 0 : qty};
      })
    );
  }

  return (
    <div
      className={`bg-white rounded-md ${
        openSuggestId ? 'overflow-visible' : 'overflow-hidden'
      }`}>
      <div className="flex items-center gap-3 px-4 py-2 bg-neutral-50 border-b border-neutral-200 text-sm font-medium text-neutral-600">
        <div className="w-8 flex justify-center">
          <Checkbox
            checked={allSelected}
            onChange={toggleSelectAll}
            aria-label="Select all"
          />
        </div>
        <div className="w-8 text-center">S N</div>
        <div className="w-28 text-center">{codeHeader}</div>
        <div className="flex-1">Item Name</div>
        <div className="w-28 text-center">{rateHeader}</div>
        <div className="w-28 text-center">{qtyHeader}</div>
        <div className="w-32 text-center">Amount</div>
        <div className="w-6" aria-hidden />
      </div>

      {items.map((it, idx) => {
        const amount = it.rate * it.qty;
        return (
          <div
            key={it.id}
            className="flex items-center gap-3 px-4 py-2 border-b border-neutral-100">
            <div className="w-8 flex justify-center">
              <Checkbox
                checked={selectedIds.has(it.id)}
                onChange={() => toggleSelect(it.id)}
                title="Select"
              />
            </div>
            <div className="w-8 text-center tabular-nums">{idx + 1}</div>
            <div className="w-28 relative">
              <CodeSuggest
                value={it.code}
                options={allCodes}
                open={openSuggestId === it.id}
                onOpen={() => setOpenSuggestId(it.id)}
                onClose={() =>
                  setOpenSuggestId((cur) => (cur === it.id ? null : cur))
                }
                onPick={(code) => {
                  updateItemField(it.id, 'code', code);
                  setOpenSuggestId(null);
                }}
                inputProps={{
                  className:
                    'w-full h-9 rounded-md border border-neutral-300 px-2 text-center',
                  'data-section': 'items',
                  'data-row-index': String(idx),
                  'data-col': 'code',
                  onKeyDown: handleGridKey,
                  onChange: (e) =>
                    updateItemField(
                      it.id,
                      'code',
                      (e.target as HTMLInputElement).value
                    ),
                }}
              />
            </div>
            <div className="flex-1">
              <div className="h-9 px-2 flex items-center">
                <span className="truncate">{it.name || ''}</span>
              </div>
            </div>
            <div className="w-28">
              <NumberInput
                className="w-full"
                value={String(it.rate)}
                onChange={(e) => updateItemField(it.id, 'rate', e.target.value)}
                data-section="items"
                data-row-index={String(idx)}
                data-col="rate"
                onKeyDown={handleGridKey}
              />
            </div>
            <div className="w-28">
              <NumberInput
                className="w-full"
                value={String(it.qty)}
                onChange={(e) => updateItemField(it.id, 'qty', e.target.value)}
                data-section="items"
                data-row-index={String(idx)}
                data-col="qty"
                onKeyDown={handleGridKey}
              />
            </div>
            <div className="w-32 text-center tabular-nums font-semibold">
              {amount.toFixed(2)}
            </div>
            <div className="w-6" />
          </div>
        );
      })}

      {inputRows.map((row, idx) => {
        const rec = row.code.trim()
          ? stockByCode.get(row.code.trim())
          : undefined;
        const name = rec?.name ?? '';
        return (
          <div key={row.id} className="flex items-center gap-3 px-4 py-2">
            <div className="w-8 flex justify-center">
              <input
                type="checkbox"
                className="size-5 accent-neutral-900"
                checked={selectedIds.has(row.id)}
                onChange={() => toggleSelect(row.id)}
                title="Select"
              />
            </div>
            <div className="w-8 text-center text-neutral-400">--</div>
            <div className="w-28 relative">
              <CodeSuggest
                value={row.code}
                options={allCodes}
                open={openSuggestId === row.id}
                onOpen={() => setOpenSuggestId(row.id)}
                onClose={() =>
                  setOpenSuggestId((cur) => (cur === row.id ? null : cur))
                }
                onPick={(code) => {
                  setInputRows((rs) => {
                    const c = [...rs];
                    const rec = stockByCode.get(code.trim());
                    c[idx] = {
                      ...c[idx],
                      code,
                      rate:
                        c[idx].rate === '' && rec?.purchaseRate != null
                          ? String(rec.purchaseRate)
                          : c[idx].rate,
                    };
                    return c;
                  });
                  setOpenSuggestId(null);
                }}
                inputProps={{
                  className:
                    'w-full h-9 rounded-md border border-neutral-300 px-2 text-center',
                  placeholder: 'Code',
                  'data-section': 'inputs',
                  'data-row-index': String(idx),
                  'data-col': 'code',
                  onKeyDown: (e) => {
                    if (e.key === 'Enter') return commitInputRow(idx);
                    return handleGridKey(e);
                  },
                  onChange: (e) =>
                    setInputRows((rs) => {
                      const c = [...rs];
                      const code = (e.target as HTMLInputElement).value;
                      const rec = stockByCode.get(code.trim());
                      c[idx] = {
                        ...c[idx],
                        code,
                        rate:
                          c[idx].rate === '' && rec?.purchaseRate != null
                            ? String(rec.purchaseRate)
                            : c[idx].rate,
                      };
                      return c;
                    }),
                }}
              />
            </div>
            <div className="flex-1">
              <div className="h-9 px-2 flex items-center text-neutral-700">
                <span className="truncate">{name}</span>
              </div>
            </div>
            <div className="w-28">
              <NumberInput
                className="w-full"
                placeholder="0.00"
                step={0.01}
                value={row.rate}
                onChange={(e) =>
                  setInputRows((rs) => {
                    const c = [...rs];
                    c[idx] = {...c[idx], rate: e.target.value};
                    return c;
                  })
                }
                data-section="inputs"
                data-row-index={String(idx)}
                data-col="rate"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') return commitInputRow(idx);
                  return handleGridKey(e);
                }}
              />
            </div>
            <div className="w-28">
              <NumberInput
                className="w-full"
                placeholder="0"
                step={1}
                value={row.qty}
                onChange={(e) =>
                  setInputRows((rs) => {
                    const c = [...rs];
                    c[idx] = {...c[idx], qty: e.target.value};
                    return c;
                  })
                }
                data-section="inputs"
                data-row-index={String(idx)}
                data-col="qty"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') return commitInputRow(idx);
                  return handleGridKey(e);
                }}
              />
            </div>
            <div className="w-32 text-center tabular-nums text-neutral-400">
              --
            </div>
            <div className="w-6" />
          </div>
        );
      })}

      <InvoiceTotalsRow qty={totalQty} amount={computedTotal} />

      <div className="flex items-center gap-3 px-4 py-3 border-t border-neutral-200">
        <button
          type="button"
          className="inline-flex items-center gap-2 h-9 px-3 rounded-md border border-neutral-200 hover:bg-neutral-100 text-neutral-700"
          onClick={addEmptyRow}
          title="Add another input row">
          <FiPlus className="size-5" />
          <span>Add Row</span>
        </button>
      </div>
    </div>
  );
}
