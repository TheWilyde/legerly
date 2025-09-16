import {useEffect, useRef, useState, useMemo} from 'react';
import {FiTrash2, FiEdit2} from 'react-icons/fi';
import Papa from 'papaparse';
import type React from 'react';
import {useGridKey} from '../components/hooks/useGridKey';
import Checkbox from '../components/common/Checkbox';
import PageHeader from '../components/common/PageHeader';
import {useSelection} from '../components/hooks/useSelection';
import AddRowButton from '../components/common/AddRowButton';
import StockItemRow from '../components/stock/StockItemRow';
import StockInputRow from '../components/stock/StockInputRow';
import {FaFileImport, FaSortAlphaDown} from 'react-icons/fa';

type StockItem = {
  id: number;
  code: string;
  name: string;
  purchaseRate: number;
  purchaseQty: number;
  saleRate: number;
  saleQty: number;
};

type InputRow = {
  id: number;
  code: string;
  name: string;
  purchaseRate: string; // keep as string while typing
  purchaseQty: string;
  saleRate: string;
  saleQty: string;
};

let nextId = 1;

export default function Stock() {
  const [items, setItems] = useState<StockItem[]>([]);
  const [sortMode, setSortMode] = useState<'none' | 'name-asc'>(() => {
    const saved = localStorage.getItem('stock.sort');
    return (saved as 'none' | 'name-asc') || 'none';
  });
  const [editMode, setEditMode] = useState(false);
  const [inputRows, setInputRows] = useState<InputRow[]>([
    {
      id: 0,
      code: '',
      name: '',
      purchaseRate: '',
      purchaseQty: '',
      saleRate: '',
      saleQty: '',
    },
  ]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  // Debounce timers per item
  const persistTimers = useRef<Record<number, number>>({});

  // Selection across items and visible input rows (when editing)
  const allIds = useMemo(
    () => [
      ...items.map((i) => i.id),
      ...(editMode ? inputRows.map((r) => r.id) : []),
    ],
    [items, inputRows, editMode]
  );
  const {
    selected: selectedIds,
    allSelected,
    selectedArray,
    toggle,
    toggleAll,
    clear,
  } = useSelection(allIds);

  useEffect(() => {
    (async () => {
      const data = await window.api?.stock.list();
      if (data) {
        setItems(applySort(data, sortMode));
        nextId =
          ((data as {id: number}[]).reduce(
            (max: number, i: {id: number}) => Math.max(max, i.id),
            0
          ) || 0) + 1;
      }
    })();
  }, []);

  useEffect(() => {
    // re-apply sorting when mode changes
    setItems((prev) => applySort(prev, sortMode));
  }, [sortMode]);

  function handleDelete() {
    if (selectedArray.length === 0) return;
    const ids = selectedArray;
    const itemIds = ids.filter((id) => items.some((i) => i.id === id));
    const inputIds = ids.filter((id) => inputRows.some((r) => r.id === id));

    Promise.all(itemIds.map((id) => window.api?.stock.delete(id))).then(
      async () => {
        const data = await window.api?.stock.list();
        if (data) setItems(data);
        setInputRows((rows) => {
          let updated = rows.filter((r) => !inputIds.includes(r.id));
          if (updated.length === 0) {
            updated = [
              {
                id: nextId++,
                code: '',
                name: '',
                purchaseRate: '',
                purchaseQty: '',
                saleRate: '',
                saleQty: '',
              },
            ];
          }
          return updated;
        });
        clear();
      }
    );
  }

  function schedulePersist(next: StockItem) {
    const prevTimer = persistTimers.current[next.id];
    if (prevTimer) {
      window.clearTimeout(prevTimer);
    }
    persistTimers.current[next.id] = window.setTimeout(() => {
      window.api?.stock.update(next.id, {
        code: next.code,
        name: next.name,
        purchaseRate: next.purchaseRate,
        purchaseQty: next.purchaseQty,
        saleRate: next.saleRate,
        saleQty: next.saleQty,
      });
      delete persistTimers.current[next.id];
    }, 400); // debounce ms
  }

  function updateItemField(id: number, field: keyof StockItem, value: string) {
    if (!editMode) return;
    setItems((prev) =>
      prev.map((i) => {
        if (i.id !== id) return i;
        let next: StockItem;
        if (field === 'name' || field === 'code') {
          next = {...i, [field]: value} as StockItem;
        } else {
          const num = Number(value);
          next = {...i, [field]: isNaN(num) ? 0 : num} as StockItem;
        }
        schedulePersist(next); // debounce IPC persist
        return next;
      })
    );
  }

  // In Stock = Purchase Qty - Sale Qty
  function computeInStock(item: {purchaseQty: number; saleQty: number}) {
    return item.purchaseQty - item.saleQty;
  }

  function computePurchaseTotal(item: {
    purchaseRate: number;
    purchaseQty: number;
  }) {
    return item.purchaseRate * item.purchaseQty;
  }

  function computeSaleTotal(item: {saleRate: number; saleQty: number}) {
    return item.saleRate * item.saleQty;
  }

  // Total = Purchase Rate * In Stock
  function computeTotal(item: StockItem) {
    return item.purchaseRate * computeInStock(item);
  }

  // Currency formatter for Pakistani Rupees
  const formatPKR = (n: number) =>
    new Intl.NumberFormat('en-PK', {
      style: 'currency',
      currency: 'PKR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);

  // Aggregated totals
  const purchaseSum = useMemo(
    () => items.reduce((s, it) => s + computePurchaseTotal(it), 0),
    [items]
  );
  const saleSum = useMemo(
    () => items.reduce((s, it) => s + computeSaleTotal(it), 0),
    [items]
  );
  const grandTotal = useMemo(
    () => items.reduce((s, it) => s + computeTotal(it), 0),
    [items]
  );

  function handleInputRowChange(
    idx: number,
    field: keyof InputRow,
    value: string
  ) {
    setInputRows((rows) => {
      const updated = [...rows];
      updated[idx] = {...updated[idx], [field]: value};
      return updated;
    });
  }

  function isRowComplete(row: InputRow) {
    return (
      row.code.trim() !== '' &&
      row.name.trim() !== '' &&
      row.purchaseRate.trim() !== '' &&
      row.purchaseQty.trim() !== '' &&
      row.saleRate.trim() !== '' &&
      row.saleQty.trim() !== ''
    );
  }

  function commitInputRow(idx: number) {
    if (!editMode) return;
    const row = inputRows[idx];
    if (!isRowComplete(row)) return;

    const payload = {
      code: row.code.trim(),
      name: row.name.trim(),
      purchaseRate: Number(row.purchaseRate) || 0,
      purchaseQty: Number(row.purchaseQty) || 0,
      saleRate: Number(row.saleRate) || 0,
      saleQty: Number(row.saleQty) || 0,
    };

    window.api?.stock
      .create(payload)
      .then((created: RendererStockItem | undefined) => {
        if (!created) return;
        setItems((prev) => [...prev, created]);
        setInputRows((rows) => {
          const updated = [...rows];
          updated[idx] = {
            id: updated[idx].id,
            code: '',
            name: '',
            purchaseRate: '',
            purchaseQty: '',
            saleRate: '',
            saleQty: '',
          };
          return updated;
        });
      });
  }

  function addEmptyRow() {
    if (!editMode) return;
    setInputRows((rows) => [
      ...rows,
      {
        id: nextId++,
        code: '',
        name: '',
        purchaseRate: '',
        purchaseQty: '',
        saleRate: '',
        saleQty: '',
      },
    ]);
  }

  // Keyboard navigation among editable cells (single handler)
  const cols = [
    'code',
    'name',
    'purchaseRate',
    'purchaseQty',
    'saleRate',
    'saleQty',
  ] as const;
  const handleGridKey = useGridKey(cols);

  function handleImportClick() {
    fileInputRef.current?.click();
  }

  function handleSortAZ() {
    setSortMode('name-asc');
    localStorage.setItem('stock.sort', 'name-asc');
  }

  // normalize field names and read a value by candidate keys
  function getField(obj: any, candidates: string[]) {
    const norm = (s: string) => s.toLowerCase().replace(/[\s_]/g, '');
    const map = new Map<string, any>();
    for (const k of Object.keys(obj ?? {})) map.set(norm(k), (obj as any)[k]);
    for (const c of candidates) {
      const v = map.get(norm(c));
      if (v !== undefined && v !== null) return v;
    }
    return undefined;
  }

  function toNumber(v: any) {
    if (typeof v === 'number') return v;
    if (typeof v === 'string') {
      const n = Number(v.replace(/,/g, ''));
      return isNaN(n) ? 0 : n;
    }
    return 0;
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    try {
      const name = (file.name || '').toLowerCase();
      const isCSV = name.endsWith('.csv');

      let rows: any[] = [];
      if (isCSV) {
        const text = await file.text();
        const parsed = Papa.parse(text, {
          header: true,
          skipEmptyLines: true,
          transformHeader: (h) => h.trim(),
        });
        if (parsed.errors?.length) {
          console.warn(parsed.errors);
        }
        rows = (parsed.data as any[]).filter(Boolean);
      } else {
        const text = await file.text();
        const json = JSON.parse(text);
        rows = Array.isArray(json)
          ? json
          : Array.isArray(json?.items)
          ? json.items
          : [];
      }

      if (!Array.isArray(rows) || rows.length === 0) {
        alert('No items found.');
        return;
      }

      // index existing by code
      const byCode = new Map(items.map((i) => [i.code, i]));
      let created = 0,
        updated = 0;

      for (const rec of rows) {
        const code = String(getField(rec, ['code', 'item code']) ?? '').trim();
        const name = String(getField(rec, ['name', 'item name']) ?? '').trim();
        const purchaseRate = toNumber(
          getField(rec, ['purchaseRate', 'purchase rate'])
        );
        const purchaseQty = toNumber(
          getField(rec, ['purchaseQty', 'purchase qty'])
        );
        const saleRate = toNumber(getField(rec, ['saleRate', 'sale rate']));
        const saleQty = toNumber(getField(rec, ['saleQty', 'sale qty']));
        if (!code || !name) continue;

        const existing = byCode.get(code);
        if (existing) {
          await window.api?.stock.update(existing.id, {
            code,
            name,
            purchaseRate,
            purchaseQty,
            saleRate,
            saleQty,
          });
          updated++;
        } else {
          const res = await window.api?.stock.create({
            code,
            name,
            purchaseRate,
            purchaseQty,
            saleRate,
            saleQty,
          });
          if (res) created++;
        }
      }

      const data = await window.api?.stock.list();
      if (data) setItems(data);
      alert(`Import complete. Created: ${created}, Updated: ${updated}.`);
    } catch (err) {
      console.error(err);
      alert('Failed to import file.');
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function applySort(list: StockItem[], mode: 'none' | 'name-asc') {
    if (mode === 'name-asc') {
      return [...list].sort((a, b) => {
        const byName = a.name.localeCompare(b.name, undefined, {
          sensitivity: 'base',
        });
        return byName !== 0
          ? byName
          : a.code.localeCompare(b.code, undefined, {sensitivity: 'base'});
      });
    }
    return list;
  }

  return (
    <div>
      <PageHeader title="Stock">
        <button
          type="button"
          onClick={() => setEditMode((v) => !v)}
          className="inline-flex items-center gap-2 h-9 px-3 rounded-md bg-neutral-900 text-white"
          title={editMode ? 'Stop Editing' : 'Edit'}>
          <FiEdit2 className="size-5" />
          <span>{editMode ? 'Done' : 'Edit'}</span>
        </button>
        <button
          type="button"
          onClick={handleImportClick}
          disabled={isImporting}
          className="inline-flex items-center gap-2 h-9 px-3 rounded-md border border-neutral-200 hover:bg-neutral-100 disabled:opacity-60"
          title="Import from CSV/JSON">
          <FaFileImport className="size-5" />
          <span>Import Items</span>
        </button>
        <button
          type="button"
          onClick={handleSortAZ}
          className="inline-flex items-center gap-2 h-9 px-3 rounded-md border border-neutral-200 hover:bg-neutral-100"
          title="Sort items by name (A–Z)">
          <FaSortAlphaDown />
          <span>Sort</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,text/csv,.csv"
          className="hidden"
          onChange={handleFileSelected}
        />
        {selectedIds.size > 0 && (
          <button
            className="inline-flex items-center gap-2 h-9 px-3 rounded-md border border-red-200 text-red-700 hover:bg-red-50"
            onClick={handleDelete}
            title="Delete selected">
            <FiTrash2 className="size-4" />
            <span>Delete</span>
          </button>
        )}
      </PageHeader>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-md border border-neutral-200 p-3">
          <div className="text-sm text-neutral-500">Purchase Total</div>
          <div className="text-xl font-semibold tabular-nums">
            {formatPKR(purchaseSum)}
          </div>
        </div>
        <div className="bg-white rounded-md border border-neutral-200 p-3">
          <div className="text-sm text-neutral-500">Sale Total</div>
          <div className="text-xl font-semibold tabular-nums">
            {formatPKR(saleSum)}
          </div>
        </div>
        <div className="bg-white rounded-md border border-neutral-200 p-3">
          <div className="text-sm text-neutral-500">Total</div>
          <div className="text-xl font-semibold tabular-nums">
            {formatPKR(grandTotal)}
          </div>
        </div>
      </div>

      {/* Column headers */}
      <div className="mt-4 bg-white rounded-md overflow-auto max-h-[78vh] no-scrollbar">
        <div className="sticky top-0 z-10 flex items-center gap-3 px-4 py-2 bg-neutral-50 border-b border-neutral-200 text-sm font-medium text-neutral-600">
          <div className="w-8 flex justify-center">
            <Checkbox
              checked={allSelected}
              onChange={toggleAll}
              aria-label="Select all"
            />
          </div>
          <div className="w-28 text-center">Code</div>
          <div className="flex-1">Item Name</div>
          <div className="w-28 text-center">Purchase Rate</div>
          <div className="w-28 text-center">Purchase Qty</div>
          <div className="w-32 text-center">Purchase Total</div>
          <div className="w-28 text-center">Sale Rate</div>
          <div className="w-28 text-center">Sale Qty</div>
          <div className="w-32 text-center">Sale Total</div>
          <div className="w-28 text-center">In Stock</div>
          <div className="w-28 text-center">Total</div>
        </div>

        {/* Existing items */}
        {items.map((item, idx) => (
          <StockItemRow
            key={item.id}
            item={item}
            idx={idx}
            editMode={editMode}
            selected={selectedIds.has(item.id)}
            onToggleSelect={() => toggle(item.id)}
            onUpdate={(field, value) =>
              updateItemField(item.id, field as any, value)
            }
            onKeyDown={handleGridKey}
          />
        ))}

        {/* Inline input rows (always at end). Only one is guaranteed unless user adds more */}
        {editMode &&
          inputRows.map((row, idx) => (
            <StockInputRow
              key={row.id}
              row={row}
              idx={idx}
              selected={selectedIds.has(row.id)}
              onToggleSelect={() => toggle(row.id)}
              onChange={(field, value) =>
                handleInputRowChange(idx, field as any, value)
              }
              onCommit={() => commitInputRow(idx)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') return commitInputRow(idx);
                return handleGridKey(e);
              }}
            />
          ))}

        {/* Footer row with Add button (separate row) */}
        {editMode && (
          <div className="flex items-center gap-3 px-4 py-3 border-t border-neutral-200">
            <AddRowButton onClick={addEmptyRow} title="Add another input row" />
          </div>
        )}
      </div>
    </div>
  );
}
