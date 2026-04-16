import {
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import AddRowButton from '../../common/AddRowButton';
import {useGridKey} from '../../hooks/useGridKey';
import CodeSuggest from '../../ui/CodeSuggest';

// Minimal stub so screens render; replace with full editor later
type EditorItem = {
  id: number;
  code: string;
  name: string;
  rate: number;
  qty: number;
};

// input row shape used within this editor
type EditorInputRow = {
  id: number;
  code: string;
  name: string;
  rate: string;
  qty: string;
};

type Props = {
  items: EditorItem[];
  setItems: Dispatch<SetStateAction<EditorItem[]>>;
  inputRows?: EditorInputRow[];
  setInputRows?: Dispatch<SetStateAction<EditorInputRow[]>>;
  selectedIds?: Set<number>;
  setSelectedIds?: Dispatch<SetStateAction<Set<number>>>;
  // optional props passed by create pages
  stockByCode?: Map<
    string,
    {name: string; purchaseRate: number; saleRate: number}
  >;
  allCodes?: string[];
  codeHeader?: string;
  rateHeader?: string;
  qtyHeader?: string;
  rateSource?: 'purchase' | 'sale';
};

export default function ItemsEditor(props: Props) {
  const lastCommitRef = useRef<{key: string; ts: number} | null>(null);
  const noopSetInputRows: Dispatch<SetStateAction<EditorInputRow[]>> = () =>
    undefined;
  const noopSetSelectedIds: Dispatch<SetStateAction<Set<number>>> = () =>
    undefined;
  const {
    items,
    setItems,
    inputRows = [],
    setInputRows = noopSetInputRows,
    selectedIds = new Set<number>(),
    setSelectedIds = noopSetSelectedIds,
    allCodes = [],
    codeHeader = 'Code',
    rateHeader = 'Rate',
    qtyHeader = 'Qty',
    stockByCode = new Map<
      string,
      {name: string; purchaseRate: number; saleRate: number}
    >(),
    rateSource = 'purchase',
  } = props;

  const cols = ['code', 'name', 'rate', 'qty'] as const;
  const handleGridKey = useGridKey(cols);

  const [openSuggestId, setOpenSuggestId] = useState<number | null>(null);

  const allSelectableIds = useMemo(
    () => [...items.map((i) => i.id), ...inputRows.map((r) => r.id)],
    [items, inputRows],
  );
  const allSelected =
    allSelectableIds.length > 0 && selectedIds.size === allSelectableIds.length;

  // Totals across committed items + live inputs (rate sum, qty sum, amount sum)
  const totals = useMemo(() => {
    let rate = 0;
    let qty = 0;
    let amount = 0;

    // committed items
    for (const it of items ?? []) {
      const r = Number((it as any).rate) || 0;
      const q = Number((it as any).qty) || 0;
      rate += r; // sum of rates
      qty += q; // sum of qty
      amount += r * q; // sum of line totals
    }

    // live input rows
    for (const row of inputRows ?? []) {
      const r = Number(row.rate) || 0;
      const q = Number(row.qty) || 0;
      rate += r;
      qty += q;
      amount += r * q;
    }

    return {rate, qty, amount};
  }, [items, inputRows]);

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
        ? new Set<number>()
        : new Set<number>(allSelectableIds),
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
  // lightweight microtask lock to prevent duplicate Enter handling
  const enterLockRef = useRef(false);

  // focus helper (microtask) — minimal, no animation/timeouts
  function focusInput(rowIdx: number, col: 'code' | 'name' | 'rate' | 'qty') {
    const sel = `[data-section="inputs"][data-row-index="${rowIdx}"][data-col="${col}"]`;
    const el = document.querySelector<HTMLInputElement>(sel);
    if (el)
      Promise.resolve().then(() => {
        el.focus();
        try {
          el.select?.();
        } catch {}
      });
  }

  function isEmptyRow(r: EditorInputRow) {
    return !(r.code || r.name || r.rate || r.qty);
  }

  function handleInputRowEnter(idx: number) {
    // microtask lock
    if (enterLockRef.current) return;
    enterLockRef.current = true;
    Promise.resolve().then(() => (enterLockRef.current = false));

    const current = inputRows[idx];
    const code = (current.code || '').trim();
    const name = (current.name || '').trim();
    const rateNum = Number(current.rate);
    const qtyNum = Number(current.qty);
    const isValidRow =
      code &&
      name &&
      !isNaN(rateNum) &&
      rateNum > 0 &&
      !isNaN(qtyNum) &&
      qtyNum > 0;

    const key = `${idx}|${code}|${name}|${rateNum}|${qtyNum}`;
    const now = Date.now();
    if (
      lastCommitRef.current?.key === key &&
      now - lastCommitRef.current.ts < 600
    ) {
      return;
    }

    if (isValidRow) {
      lastCommitRef.current = {key, ts: now};
      const newId = now;

      // FIX: Update items state separately (outside the setInputRows callback)
      setItems((prev) => [
        ...prev,
        {id: newId, code, name, rate: rateNum, qty: qtyNum},
      ]);

      // Then update the UI rows
      setInputRows((rows) => {
        const updated = [...rows];
        const newEmptyRow = {
          id: -(Date.now() + Math.floor(Math.random() * 1000)),
          code: '',
          name: '',
          rate: '',
          qty: '',
        };

        // clear current row
        updated[idx] = {...updated[idx], code: '', name: '', rate: '', qty: ''};

        // insert new row if needed
        if (!updated[idx + 1] || !isEmptyRow(updated[idx + 1])) {
          updated.splice(idx + 1, 0, newEmptyRow);
        }

        // simple dedupe
        for (let i = updated.length - 1; i > 0; i--) {
          if (isEmptyRow(updated[i]) && isEmptyRow(updated[i - 1]))
            updated.splice(i, 1);
        }

        return updated;
      });

      // Ensure focus happens after DOM update
      setTimeout(() => {
        const nextRowSelector = `[data-section="inputs"][data-row-index="${idx + 1}"][data-col="code"]`;
        if (document.querySelector(nextRowSelector)) {
          focusInput(idx + 1, 'code');
        } else {
          focusInput(idx, 'code');
        }
      }, 0);
    }
  }

  // Minimal column-enter handler: move between columns; commit on qty
  function handleInputEnter(
    idx: number,
    col: 'code' | 'name' | 'rate' | 'qty',
  ) {
    // Special handling for code field: autofill name and rate, then move to qty
    if (col === 'code') {
      const row = inputRows[idx];
      const code = row.code.trim().toUpperCase();
      const rec = stockByCode.get(code);

      const updates: Partial<EditorInputRow> = {};

      // Auto-fill name only if empty
      if (!row.name.trim() && rec?.name) {
        updates.name = rec.name;
      }

      // Auto-fill rate only if empty
      if (!row.rate.trim() && rec) {
        const fillRate =
          rateSource === 'sale' ? rec.saleRate : rec.purchaseRate;
        if (fillRate) {
          updates.rate = String(fillRate);
        }
      }

      // Update the row with autofilled values
      if (Object.keys(updates).length > 0) {
        setInputRows((rs) => {
          const c = [...rs];
          c[idx] = {...c[idx], ...updates};
          return c;
        });
      }

      // Move focus to qty field
      focusInput(idx, 'qty');
      return;
    }

    if (col !== 'qty') {
      const next: Record<string, 'code' | 'name' | 'rate' | 'qty'> = {
        code: 'name',
        name: 'rate',
        rate: 'qty',
        qty: 'code',
      };
      focusInput(idx, next[col]);
      return;
    }
    // On qty Enter, commit the row and focus next row code
    handleInputRowEnter(idx);
  }

  function updateItemField(
    id: number,
    field: 'code' | 'name' | 'rate' | 'qty',
    value: string,
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
      }),
    );
  }

  // Auto-fill name and rate only when Enter is pressed on code field
  // (implemented in handleInputEnter for explicit control on code field Enter)

  // Handle code field blur to autofill if code is not empty, clear if empty
  function handleCodeBlur(idx: number) {
    const row = inputRows[idx];
    const code = row.code.trim().toUpperCase();

    // If code is empty, clear name and rate
    if (!code) {
      if (row.name || row.rate) {
        setInputRows((rs) => {
          const c = [...rs];
          c[idx] = {...c[idx], name: '', rate: ''};
          return c;
        });
      }
      return;
    }

    // If code exists, autofill name and rate if empty
    const rec = stockByCode.get(code);
    const updates: Partial<EditorInputRow> = {};

    if (!row.name.trim() && rec?.name) {
      updates.name = rec.name;
    }

    if (!row.rate.trim() && rec) {
      const fillRate = rateSource === 'sale' ? rec.saleRate : rec.purchaseRate;
      if (fillRate) {
        updates.rate = String(fillRate);
      }
    }

    if (Object.keys(updates).length > 0) {
      setInputRows((rs) => {
        const c = [...rs];
        c[idx] = {...c[idx], ...updates};
        return c;
      });
    }
  }

  // ✅ NEW: Auto-commit when qty is filled and row is valid
  function handleQtyBlur(idx: number) {
    const row = inputRows[idx];
    const code = (row.code || '').trim();
    const name = (row.name || '').trim();
    const rateNum = Number(row.rate);
    const qtyNum = Number(row.qty);

    // ✅ Check if row is complete (code, name, rate, qty all filled)
    const isValidRow =
      code &&
      name &&
      !isNaN(rateNum) &&
      rateNum > 0 &&
      !isNaN(qtyNum) &&
      qtyNum > 0;

    if (isValidRow) {
      handleInputRowEnter(idx);
    }
  }

  return (
    <div className="border border-neutral-200 rounded-md overflow-hidden bg-white">
      {/* Header */}
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
                      (e.target as HTMLInputElement).value,
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
                      handleInputEnter(idx, 'code');
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
                  onBlur: () => handleCodeBlur(idx),
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
                    handleInputEnter(idx, 'name');
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
                    handleInputEnter(idx, 'rate');
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
                onBlur={() => handleQtyBlur(idx)} // ✅ Auto-commit on blur
                data-section="inputs"
                data-row-index={String(idx)}
                data-col="qty"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleInputEnter(idx, 'qty');
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

      {/* Totals: separate container, aligned to editor columns */}
      <div className="mt-2 border-t border-neutral-200 bg-neutral-50">
        <div className="flex items-center gap-3 px-4 py-2">
          {/* Keep widths in sync with header/row columns */}
          <div className="w-8" /> {/* checkbox spacer */}
          <div className="w-10" /> {/* S. No. spacer */}
          <div className="w-28" /> {/* Code spacer */}
          <div className="flex-1 text-right pr-2">Totals:</div> {/* Name col */}
          <div className="w-28 text-center tabular-nums">
            {totals.rate.toFixed(2)}
          </div>{' '}
          {/* Rate sum */}
          <div className="w-28 text-center tabular-nums">{totals.qty}</div>{' '}
          {/* Qty sum */}
          <div className="w-32 text-center tabular-nums">
            {totals.amount.toFixed(2)}
          </div>{' '}
          {/* Amount sum */}
          <div className="w-6" /> {/* end spacer */}
        </div>
      </div>
    </div>
  );
}
