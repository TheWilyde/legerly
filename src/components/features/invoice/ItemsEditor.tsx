// @ts-nocheck
import React, {useEffect, useMemo, useState} from 'react';
import AddRowButton from '../../common/AddRowButton';
import {useGridKey} from '../../hooks/useGridKey';
import CodeSuggest from '../../ui/CodeSuggest';
import InvoiceTotalsRow from './InvoiceTotalsRow';

type EditorItem = {
  id: number;
  code: string;
  name: string;
  rate: number;
  qty: number;
};

type EditorInputRow = {
  id: number;
  code: string;
  name: string;
  rate: string;
  qty: string;
};

type Props = {
  items: EditorItem[];
  setItems: React.Dispatch<React.SetStateAction<EditorItem[]>>;
  inputRows: EditorInputRow[];
  setInputRows: React.Dispatch<React.SetStateAction<EditorInputRow[]>>;
  selectedIds: Set<number>;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<number>>>;
  codeHeader?: string;
  rateHeader?: string;
  qtyHeader?: string;
  stockByCode: Map<
    string,
    {name: string; purchaseRate: number; saleRate: number}
  >;
  allCodes: string[];
  rateSource?: 'purchase' | 'sale';
};

export default function ItemsEditor(props: Props) {
  const {
    items,
    setItems,
    inputRows,
    setInputRows,
    selectedIds,
    setSelectedIds,
    allCodes,
    codeHeader = 'Code',
    rateHeader = 'Rate',
    qtyHeader = 'Qty',
    stockByCode,
    rateSource = 'purchase',
  } = props;

  const cols = ['code', 'name', 'rate', 'qty'] as const;
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

  function addEmptyRow() {
    setInputRows((rows) => [
      ...rows,
      {
        id: -(Date.now() + rows.length + 1),
        code: '',
        name: '',
        rate: '',
        qty: '',
      },
    ]);
  }

  // ✅ NEW: Add row below current input row when Enter is pressed
  function handleInputRowEnter(idx: number) {
    setInputRows((rows) => {
      const newRow = {
        id: -(Date.now() + Math.random()),
        code: '',
        name: '',
        rate: '',
        qty: '',
      };

      // Insert new row after current index
      const updated = [
        ...rows.slice(0, idx + 1),
        newRow,
        ...rows.slice(idx + 1),
      ];

      return updated;
    });

    // Focus on the new row's code field
    setTimeout(() => {
      const codeField = document.querySelector<HTMLInputElement>(
        `[data-section="inputs"][data-row-index="${idx + 1}"][data-col="code"]`
      );
      if (codeField) {
        codeField.focus();
        codeField.select();
      }
    }, 50);
  }

  function updateItemField(
    id: number,
    field: 'code' | 'name' | 'rate' | 'qty',
    value: string
  ) {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it;
        if (field === 'code') {
          const code = value.trim().toUpperCase();
          const rec = stockByCode.get(code);
          const name = rec?.name ?? it.name;
          const rate =
            it.rate === 0 && rec
              ? rateSource === 'sale'
                ? rec.saleRate
                : rec.purchaseRate
              : it.rate;
          return {...it, code, name, rate};
        }
        if (field === 'name') {
          return {...it, name: value};
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

  // Auto-fill name and rate when code changes in input rows
  useEffect(() => {
    let changed = false;
    const next = inputRows.map((row) => {
      if (!row.code.trim()) return row;
      const rec = stockByCode.get(row.code.trim().toUpperCase());
      if (!rec) return row;

      let updates: Partial<EditorInputRow> = {};

      // Auto-fill name only if empty
      if (!row.name.trim()) {
        updates.name = rec.name;
        changed = true;
      }

      // Auto-fill rate only if empty
      if (!row.rate.trim()) {
        const fillRate =
          rateSource === 'sale' ? rec.saleRate : rec.purchaseRate;
        if (fillRate) {
          updates.rate = String(fillRate);
          changed = true;
        }
      }

      return Object.keys(updates).length > 0 ? {...row, ...updates} : row;
    });
    if (changed) setInputRows(next);
  }, [inputRows, setInputRows, stockByCode, rateSource]);

  return (
    <div className="bg-white rounded-md border border-neutral-200 overflow-hidden">
      {/* Column headers */}
      <div className="flex items-center gap-3 px-4 py-2 bg-neutral-50 border-b border-neutral-200 text-sm font-medium text-neutral-600">
        <div className="w-8 flex justify-center">
          <input
            type="checkbox"
            className="size-5 accent-neutral-800"
            checked={allSelected}
            onChange={toggleSelectAll}
            aria-label="Select all"
          />
        </div>
        <div className="w-10 text-center">S. NO</div>
        <div className="w-28 text-center">{codeHeader}</div>
        <div className="flex-1">Item Name</div>
        <div className="w-28 text-center">{rateHeader}</div>
        <div className="w-28 text-center">{qtyHeader}</div>
        <div className="w-32 text-center">Amount</div>
        <div className="w-6" aria-hidden />
      </div>

      {/* Existing items */}
      {items.map((it, idx) => {
        const amount = it.rate * it.qty;
        return (
          <div
            key={it.id}
            className="flex items-center gap-3 px-4 py-2 border-b border-neutral-100 hover:bg-neutral-50">
            <div className="w-8 flex justify-center">
              <input
                type="checkbox"
                className="size-5 accent-neutral-900"
                checked={selectedIds.has(it.id)}
                onChange={() => toggleSelect(it.id)}
                title="Select"
              />
            </div>
            <div className="w-10 text-center tabular-nums">{idx + 1}</div>
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
                    'w-full h-9 rounded-md border border-neutral-300 px-2 text-center uppercase',
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
              <input
                type="text"
                className="w-full h-9 rounded-md border border-neutral-300 px-2"
                value={it.name}
                onChange={(e) => updateItemField(it.id, 'name', e.target.value)}
                data-section="items"
                data-row-index={String(idx)}
                data-col="name"
                onKeyDown={handleGridKey}
                placeholder="Item name"
              />
            </div>
            <div className="w-28">
              <input
                type="number"
                step="0.01"
                className="w-full h-9 rounded-md border border-neutral-300 px-2 text-center"
                value={String(it.rate)}
                onChange={(e) => updateItemField(it.id, 'rate', e.target.value)}
                data-section="items"
                data-row-index={String(idx)}
                data-col="rate"
                onKeyDown={handleGridKey}
              />
            </div>
            <div className="w-28">
              <input
                type="number"
                step="1"
                className="w-full h-9 rounded-md border border-neutral-300 px-2 text-center"
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

      {/* Input Rows */}
      {inputRows.map((row, idx) => {
        // ✅ Calculate amount for input rows
        const rate = Number(row.rate);
        const qty = Number(row.qty);
        const amount = !isNaN(rate) && !isNaN(qty) ? rate * qty : 0;

        return (
          <div
            key={row.id}
            className="flex items-center gap-3 px-4 py-2 border-b border-neutral-100 bg-neutral-50">
            <div className="w-8 flex justify-center">
              <input
                type="checkbox"
                className="size-5 accent-neutral-900"
                checked={selectedIds.has(row.id)}
                onChange={() => toggleSelect(row.id)}
                title="Select"
              />
            </div>
            <div className="w-10 text-center text-neutral-400">•</div>
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
                    c[idx] = {...c[idx], code: code.toUpperCase()};
                    return c;
                  });
                  setOpenSuggestId(null);
                }}
                inputProps={{
                  className:
                    'w-full h-9 rounded-md border border-neutral-300 px-2 text-center uppercase',
                  placeholder: 'Code',
                  'data-section': 'inputs',
                  'data-row-index': String(idx),
                  'data-col': 'code',
                  onKeyDown: (e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleInputRowEnter(idx);
                      return;
                    }
                    return handleGridKey(e);
                  },
                  onChange: (e) =>
                    setInputRows((rs) => {
                      const c = [...rs];
                      c[idx] = {...c[idx], code: e.target.value.toUpperCase()};
                      return c;
                    }),
                }}
              />
            </div>
            <div className="flex-1">
              <input
                type="text"
                className="w-full h-9 rounded-md border border-neutral-300 px-2"
                value={row.name}
                onChange={(e) =>
                  setInputRows((rs) => {
                    const c = [...rs];
                    c[idx] = {...c[idx], name: e.target.value};
                    return c;
                  })
                }
                placeholder="Item name"
                data-section="inputs"
                data-row-index={String(idx)}
                data-col="name"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleInputRowEnter(idx);
                    return;
                  }
                  return handleGridKey(e);
                }}
              />
            </div>
            <div className="w-28">
              <input
                type="number"
                step="0.01"
                className="w-full h-9 rounded-md border border-neutral-300 px-2 text-center"
                placeholder="Rate"
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
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleInputRowEnter(idx);
                    return;
                  }
                  return handleGridKey(e);
                }}
              />
            </div>
            <div className="w-28">
              <input
                type="number"
                step="1"
                className="w-full h-9 rounded-md border border-neutral-300 px-2 text-center"
                placeholder="Qty"
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
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleInputRowEnter(idx);
                    return;
                  }
                  return handleGridKey(e);
                }}
              />
            </div>
            {/* ✅ Show calculated amount instead of dash */}
            <div className="w-32 text-center tabular-nums text-neutral-600">
              {amount > 0 ? amount.toFixed(2) : '-'}
            </div>
            <div className="w-6" />
          </div>
        );
      })}

      {/* Add Row Button */}
      <div className="flex items-center gap-3 px-4 py-3">
        <AddRowButton onClick={addEmptyRow} title="Add item" />
      </div>
    </div>
  );
}
