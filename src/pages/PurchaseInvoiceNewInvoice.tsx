import {useState, useEffect, useMemo} from 'react';
import {useNavigate, useSearchParams} from 'react-router-dom';
import {FiSave, FiTrash2, FiPlus} from 'react-icons/fi';

export default function PurchaseInvoiceCreate() {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const editingId = search.get('id') ? Number(search.get('id')) : undefined;

  const [supplierName, setSupplierName] = useState(''); // Seller name
  const [contactNo, setContactNo] = useState('');
  const [address, setAddress] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(''); // yyyy-MM-dd
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [total, setTotal] = useState<number>(0);

  // Stock lookup by code -> name
  const [stockByCode, setStockByCode] = useState<Map<string, string>>(
    new Map()
  );
  const allCodes = useMemo(
    () => Array.from(stockByCode.keys()).sort(),
    [stockByCode]
  );

  // Persisted invoice item rows
  type Item = {
    id: number;
    code: string;
    name: string;
    rate: number;
    qty: number;
  };
  const [items, setItems] = useState<Item[]>([]);

  // Input rows
  type InputRow = {id: number; code: string; rate: string; qty: string};
  const [inputRows, setInputRows] = useState<InputRow[]>([
    {id: -1, code: '', rate: '', qty: ''},
  ]);

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Suggestions state
  const [openSuggestId, setOpenSuggestId] = useState<number | null>(null);

  // Totals
  const computedTotal = useMemo(
    () => items.reduce((sum, it) => sum + it.rate * it.qty, 0),
    [items]
  );
  useEffect(() => setTotal(computedTotal), [computedTotal]);

  // Load stock and (optional) existing invoice
  useEffect(() => {
    (async () => {
      const stock = await window.api?.stock.list();
      if (stock) {
        const map = new Map<string, string>();
        for (const s of stock) map.set(s.code, s.name);
        setStockByCode(map);
      }
      if (editingId) {
        const data = await window.api?.invoices.get(editingId);
        if (data) {
          setSupplierName(data.invoice.supplierName);
          setInvoiceNumber(data.invoice.number);
          setItems(
            data.items.map((it) => ({
              id: it.id,
              code: it.code,
              name: it.name,
              rate: it.rate,
              qty: it.qty,
            }))
          );
        }
      } else {
        const list = await window.api?.invoices.list();
        if (!invoiceNumber) setInvoiceNumber(String((list?.length ?? 0) + 1));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId]);

  function formatDateToDDMMMYYYY(value: string) {
    if (!value) return '';
    const [y, m, d] = value.split('-');
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    return `${d}-${months[Number(m) - 1]}-${y}`;
  }

  // Selection
  const allSelectableIds = useMemo(
    () => [...items.map((i) => i.id), ...inputRows.map((r) => r.id)],
    [items, inputRows]
  );
  const allSelected =
    allSelectableIds.length > 0 && selectedIds.size === allSelectableIds.length;

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
  function handleDeleteSelected() {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    setItems((prev) => prev.filter((i) => !ids.includes(i.id)));
    setInputRows((prev) => {
      const kept = prev.filter((r) => !ids.includes(r.id));
      return kept.length === 0
        ? [{id: -Date.now(), code: '', rate: '', qty: ''}]
        : kept;
    });
    setSelectedIds(new Set());
  }

  // Commit input row on blur/Enter
  function isRowComplete(r: InputRow) {
    return r.code.trim() !== '' && r.rate.trim() !== '' && r.qty.trim() !== '';
  }
  function commitInputRow(idx: number) {
    const row = inputRows[idx];
    if (!isRowComplete(row)) return;
    const code = row.code.trim();
    const rate = Number(row.rate);
    const qty = Number(row.qty);
    const name = stockByCode.get(code) ?? '';

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

  // Update persisted items (always editable)
  function updateItemField(
    id: number,
    field: 'code' | 'rate' | 'qty',
    value: string
  ) {
    setItems((prev) =>
      prev.map((it, iIdx) => {
        if (it.id !== id) return it;
        if (field === 'code') {
          const code = value.trim();
          const name = stockByCode.get(code) ?? '';
          return {...it, code, name};
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

  // Prevent Enter from submitting the form
  function preventEnterSubmit(e: React.KeyboardEvent<HTMLFormElement>) {
    if (e.key === 'Enter') e.preventDefault();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const number = (invoiceNumber || '').trim() || '0';
    const payload = {
      id: editingId,
      number,
      supplierName,
      total: computedTotal,
      items: items.map((it, idx) => ({
        code: it.code,
        name: it.name,
        rate: it.rate,
        qty: it.qty,
        position: idx,
      })),
    };
    await window.api?.invoices.save(payload);
    navigate('/purchase-invoice');
  }

  // Suggestions list helper
  function renderCodeSuggestions(
    currentValue: string,
    onPick: (code: string) => void
  ) {
    const q = currentValue.trim().toLowerCase();
    const options = allCodes
      .filter((c) => (q ? c.toLowerCase().includes(q) : true))
      .slice(0, 10);
    if (options.length === 0) return null;
    return (
      <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border border-neutral-200 bg-white shadow">
        {options.map((code) => (
          <li
            key={code}
            className="px-2 py-1 hover:bg-neutral-100 cursor-pointer"
            onMouseDown={(e) => {
              e.preventDefault();
              onPick(code);
            }}>
            {code}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div>
      <header className="bg-white shadow px-4 py-3 rounded-md">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">
            {editingId ? 'Edit Purchase Invoice' : 'New Purchase Invoice'}
          </h1>
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
        </div>
      </header>

      <form
        onSubmit={handleSubmit}
        onKeyDown={preventEnterSubmit}
        className="mt-4 space-y-4">
        {/* Header form */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white p-4 rounded-md">
          <label className="flex flex-col gap-1">
            <span className="text-base text-neutral-800">Seller Name</span>
            <input
              className="h-9 rounded-md border border-neutral-300 px-2"
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
              required
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-base text-neutral-800">Contact No</span>
            <input
              type="tel"
              className="h-9 rounded-md border border-neutral-300 px-2"
              value={contactNo}
              onChange={(e) => setContactNo(e.target.value)}
            />
          </label>

          <label className="flex flex-col gap-1 md:col-span-2">
            <span className="text-base text-neutral-800">Address</span>
            <input
              type="text"
              className="h-9 rounded-md border border-neutral-300 px-2 py-2 resize-none"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-base text-neutral-800">Invoice Date</span>
            <input
              type="date"
              className="h-9 rounded-md border border-neutral-300 px-2"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
            />
            {invoiceDate && (
              <span className="text-xs text-neutral-500">
                {formatDateToDDMMMYYYY(invoiceDate)}
              </span>
            )}
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-base text-neutral-800">Invoice #</span>
            <input
              className="h-9 rounded-md border border-neutral-300 px-2"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
            />
          </label>

          <div className="flex flex-col gap-1">
            <span className="text-base text-neutral-800">Total</span>
            <div className="h-9 rounded-md border border-neutral-200 px-2 flex items-center font-semibold tabular-nums bg-neutral-50">
              {computedTotal.toFixed(2)}
            </div>
          </div>
        </div>

        {/* Items editor */}
        <div className="bg-white rounded-md overflow-hidden">
          {/* Second header */}
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
            <div className="w-8 text-center">S N</div>
            <div className="w-28 text-center">Code</div>
            <div className="flex-1">Item Name</div>
            <div className="w-28 text-center">Rate</div>
            <div className="w-28 text-center">Qty</div>
            <div className="w-32 text-center">Amount</div>
            <div className="w-6" aria-hidden />
          </div>

          {/* Persisted items (no drag, show S N) */}
          {items.map((it, idx) => {
            const amount = it.rate * it.qty;
            return (
              <div
                key={it.id}
                className="flex items-center gap-3 px-4 py-2 border-b border-neutral-100">
                <div className="w-8 flex justify-center">
                  <input
                    type="checkbox"
                    className="size-5 accent-neutral-900"
                    checked={selectedIds.has(it.id)}
                    onChange={() => toggleSelect(it.id)}
                    title="Select"
                  />
                </div>
                <div className="w-8 text-center tabular-nums">{idx + 1}</div>
                <div className="w-28 relative">
                  <input
                    className="w-full h-9 rounded-md border border-neutral-300 px-2 text-center"
                    value={it.code}
                    onFocus={() => setOpenSuggestId(it.id)}
                    onBlur={() =>
                      setTimeout(
                        () =>
                          setOpenSuggestId((cur) =>
                            cur === it.id ? null : cur
                          ),
                        100
                      )
                    }
                    onChange={(e) =>
                      updateItemField(it.id, 'code', e.target.value)
                    }
                  />
                  {openSuggestId === it.id &&
                    renderCodeSuggestions(it.code, (code) => {
                      updateItemField(it.id, 'code', code);
                      setOpenSuggestId(null);
                    })}
                </div>
                <div className="flex-1">
                  <div className="h-9 px-2 flex items-center">
                    <span className="truncate">{it.name || ''}</span>
                  </div>
                </div>
                <div className="w-28">
                  <input
                    className="w-full h-9 rounded-md border border-neutral-300 px-2 text-center"
                    value={String(it.rate)}
                    onChange={(e) =>
                      updateItemField(it.id, 'rate', e.target.value)
                    }
                  />
                </div>
                <div className="w-28">
                  <input
                    className="w-full h-9 rounded-md border border-neutral-300 px-2 text-center"
                    value={String(it.qty)}
                    onChange={(e) =>
                      updateItemField(it.id, 'qty', e.target.value)
                    }
                  />
                </div>
                <div className="w-32 text-center tabular-nums font-semibold">
                  {amount.toFixed(2)}
                </div>
                <div className="w-6" />
              </div>
            );
          })}

          {/* Input rows (always at end) */}
          {inputRows.map((row, idx) => {
            const name = row.code.trim()
              ? stockByCode.get(row.code.trim()) ?? ''
              : '';
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
                  <input
                    className="w-full h-9 rounded-md border border-neutral-300 px-2 text-center"
                    placeholder="Code"
                    value={row.code}
                    onFocus={() => setOpenSuggestId(row.id)}
                    onBlur={() =>
                      setTimeout(
                        () =>
                          setOpenSuggestId((cur) =>
                            cur === row.id ? null : cur
                          ),
                        100
                      )
                    }
                    onChange={(e) =>
                      setInputRows((rs) => {
                        const c = [...rs];
                        c[idx] = {...c[idx], code: e.target.value};
                        return c;
                      })
                    }
                    onKeyDown={(e) => e.key === 'Enter' && commitInputRow(idx)}
                  />
                  {openSuggestId === row.id &&
                    renderCodeSuggestions(row.code, (code) => {
                      setInputRows((rs) => {
                        const c = [...rs];
                        c[idx] = {...c[idx], code};
                        return c;
                      });
                      commitInputRow(idx);
                      setOpenSuggestId(null);
                    })}
                </div>
                <div className="flex-1">
                  <div className="h-9 px-2 flex items-center text-neutral-700">
                    <span className="truncate">{name}</span>
                  </div>
                </div>
                <div className="w-28">
                  <input
                    className="w-full h-9 rounded-md border border-neutral-300 px-2 text-center"
                    placeholder="0.00"
                    type="number"
                    step="0.01"
                    value={row.rate}
                    onChange={(e) =>
                      setInputRows((rs) => {
                        const c = [...rs];
                        c[idx] = {...c[idx], rate: e.target.value};
                        return c;
                      })
                    }
                    onKeyDown={(e) => e.key === 'Enter' && commitInputRow(idx)}
                  />
                </div>
                <div className="w-28">
                  <input
                    className="w-full h-9 rounded-md border border-neutral-300 px-2 text-center"
                    placeholder="0"
                    type="number"
                    step="1"
                    value={row.qty}
                    onChange={(e) =>
                      setInputRows((rs) => {
                        const c = [...rs];
                        c[idx] = {...c[idx], qty: e.target.value};
                        return c;
                      })
                    }
                    onKeyDown={(e) => e.key === 'Enter' && commitInputRow(idx)}
                  />
                </div>
                <div className="w-32 text-center tabular-nums text-neutral-400">
                  --
                </div>
                <div className="w-6" />
              </div>
            );
          })}

          {/* Footer row with Add button */}
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

        <div className="flex gap-2">
          <button
            type="submit"
            className="inline-flex items-center gap-2 h-9 px-3 rounded-md bg-neutral-900 text-white hover:bg-neutral-800">
            <FiSave className="size-4" />
            <span>Save Invoice</span>
          </button>
          <button
            type="button"
            className="h-9 px-3 rounded-md border border-neutral-200 hover:bg-neutral-100"
            onClick={() => navigate('/purchase-invoice')}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
