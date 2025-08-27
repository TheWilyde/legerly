import {useState, useEffect, useMemo} from 'react';
import {useNavigate, useSearchParams} from 'react-router-dom';
import {FiSave, FiTrash2, FiPlus} from 'react-icons/fi';
import type React from 'react';
import InvoiceHeaderForm from '../components/invoice/InvoiceHeaderForm';
import ItemsEditor from '../components/invoice/ItemsEditor';

export default function PurchaseInvoiceCreate() {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const editingId = search.get('id') ? Number(search.get('id')) : undefined;

  const [supplierName, setSupplierName] = useState(''); // Seller name
  const [contactNo, setContactNo] = useState('');
  const [address, setAddress] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(''); // yyyy-MM-dd
  const [invoiceNumber, setInvoiceNumber] = useState('');
  // Removed unused total state

  // Stock lookup by code -> name
  const [stockByCode, setStockByCode] = useState<
    Map<string, {name: string; purchaseRate: number}>
  >(new Map());
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
  const totalQty = useMemo(
    () => items.reduce((sum, it) => sum + it.qty, 0),
    [items]
  );

  // Arrow-key navigation across grid cells (items and input rows)
  const cols = ['code', 'rate', 'qty'] as const;
  type Col = (typeof cols)[number];

  function focusAndSelect(el?: HTMLInputElement | null) {
    el?.focus();
    el?.select?.();
  }
  function handleGridKey(e: React.KeyboardEvent<HTMLInputElement>) {
    const t = e.currentTarget as HTMLInputElement;
    const section = (t.dataset.section as 'items' | 'inputs') ?? 'items';
    const rowIndex = Number(t.dataset.rowIndex ?? 0);
    const col = (t.dataset.col as Col) ?? 'code';
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key))
      return;
    e.preventDefault();

    // Left/Right: move within the same row using data attributes
    const colIndex = cols.indexOf(col);
    if (e.key === 'ArrowRight' && colIndex < cols.length - 1) {
      const nextCol = cols[colIndex + 1];
      const el = document.querySelector<HTMLInputElement>(
        `[data-section="${section}"][data-row-index="${rowIndex}"][data-col="${nextCol}"]`
      );
      return focusAndSelect(el);
    }
    if (e.key === 'ArrowLeft' && colIndex > 0) {
      const prevCol = cols[colIndex - 1];
      const el = document.querySelector<HTMLInputElement>(
        `[data-section="${section}"][data-row-index="${rowIndex}"][data-col="${prevCol}"]`
      );
      return focusAndSelect(el);
    }

    // Up/Down: move within the same column across rows by DOM order
    const sameCol = Array.from(
      document.querySelectorAll<HTMLInputElement>(`input[data-col="${col}"]`)
    );
    const i = sameCol.indexOf(t);
    if (i === -1) return;
    if (e.key === 'ArrowDown' && i < sameCol.length - 1) {
      return focusAndSelect(sameCol[i + 1]);
    }
    if (e.key === 'ArrowUp' && i > 0) {
      return focusAndSelect(sameCol[i - 1]);
    }
  }

  // Load stock and (optional) existing invoice
  useEffect(() => {
    (async () => {
      const stock = await window.api?.stock.list();
      if (stock) {
        const map = new Map<string, {name: string; purchaseRate: number}>();
        for (const s of stock)
          map.set(s.code, {name: s.name, purchaseRate: s.purchaseRate});
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

  // Update persisted items (always editable)
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
          // If current rate is 0, auto-fill from stock; otherwise keep user-entered rate
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
      address, // include
      invoiceDate, // include (yyyy-MM-dd)
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
        <InvoiceHeaderForm
          partyLabel="Seller Name"
          supplierName={supplierName}
          setSupplierName={setSupplierName}
          address={address}
          setAddress={setAddress}
          invoiceDate={invoiceDate}
          setInvoiceDate={setInvoiceDate}
          invoiceNumber={invoiceNumber}
          setInvoiceNumber={setInvoiceNumber}
          showContact
          contactNo={contactNo}
          setContactNo={setContactNo}
        />

        <ItemsEditor
          items={items}
          setItems={setItems}
          inputRows={inputRows}
          setInputRows={setInputRows}
          stockByCode={stockByCode}
          allCodes={allCodes}
          selectedIds={selectedIds}
          setSelectedIds={setSelectedIds}
          codeHeader="Code"
          rateHeader="Rate"
          qtyHeader="Qty"
        />

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
