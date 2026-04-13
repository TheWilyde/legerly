import {useCallback, useEffect, useRef, useState, useMemo} from 'react';
// FIX: Added FiClock, FiSave
import {FiTrash2, FiEdit2, FiClock, FiSave} from 'react-icons/fi';
import {FaFileImport, FaSortAlphaDown} from 'react-icons/fa';
import Papa from 'papaparse';
import PageHeader from '../components/common/PageHeader';
import AddRowButton from '../components/common/AddRowButton';
import SummaryCard from '../components/common/SummaryCard';
import StockItemRow from '../components/features/stock/StockItemRow';
import StockInputRow from '../components/features/stock/StockInputRow';
import {useSelection} from '../components/hooks/useSelection';
import {useGridKey} from '../components/hooks/useGridKey';
import {useActiveProfile} from '../hooks/useActiveProfile';

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
  purchaseRate: string;
  purchaseQty: string;
  saleRate: string;
  saleQty: string;
};

let nextId = 1;

function normalizeStockItem(raw: any): StockItem {
  return {
    id: raw.id,
    code: raw.code ?? '',
    name: raw.name ?? '',
    purchaseRate: Number(raw.purchaseRate) || 0,
    purchaseQty: Number(raw.purchaseQty ?? raw.qty ?? 0) || 0,
    saleRate: Number(raw.saleRate) || 0,
    saleQty: Number(raw.saleQty ?? 0) || 0,
  };
}

function applySort(list: StockItem[], mode: 'none' | 'name-asc') {
  return mode === 'name-asc'
    ? [...list].sort((a, b) => a.name.localeCompare(b.name))
    : list;
}

export default function Stock() {
  const profileId = useActiveProfile();
  const [items, setItems] = useState<StockItem[]>([]);
  const [snapshots, setSnapshots] = useState<string[]>([]);
  const [selectedSnapshot, setSelectedSnapshot] = useState<string>('current');
  const [editMode, setEditMode] = useState(false);
  const [inputRows, setInputRows] = useState<InputRow[]>([
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
  const [sortMode, setSortMode] = useState<'none' | 'name-asc'>(
    (localStorage.getItem('stock.sort') as any) || 'none',
  );
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const persistTimers = useRef<Record<number, number>>({});
  const pendingPersist = useRef<Record<number, StockItem>>({});

  const flushPendingPersists = useCallback(
    async (
      targetProfileId: string | null | undefined,
      options?: {emitFeedback?: boolean},
    ) => {
      Object.values(persistTimers.current).forEach((t) => clearTimeout(t));
      persistTimers.current = {};

      const queued = Object.values(pendingPersist.current);
      pendingPersist.current = {};

      if (!targetProfileId || queued.length === 0) {
        if (options?.emitFeedback) {
          window.dispatchEvent(
            new CustomEvent('app:feedback', {detail: 'success'}),
          );
        }
        return true;
      }

      try {
        await Promise.all(
          queued.map((item) =>
            window.api.stock.update(targetProfileId, item.id, item),
          ),
        );
        window.dispatchEvent(new CustomEvent('stock:changed'));
        if (options?.emitFeedback) {
          window.dispatchEvent(
            new CustomEvent('app:feedback', {detail: 'success'}),
          );
        }
        return true;
      } catch (err) {
        console.error('Failed to persist stock edits:', err);
        setError('Failed to save stock changes');
        if (options?.emitFeedback) {
          window.dispatchEvent(
            new CustomEvent('app:feedback', {detail: 'error'}),
          );
        }
        return false;
      }
    },
    [],
  );

  // Flush queued edits when leaving the page or switching profiles.
  useEffect(() => {
    return () => {
      void flushPendingPersists(profileId);
    };
  }, [flushPendingPersists, profileId]);

  const allIds = useMemo(
    () => [
      ...items.map((i) => i.id),
      ...(editMode ? inputRows.map((r) => r.id) : []),
    ],
    [items, inputRows, editMode],
  );

  const {
    selected: selectedIds,
    selectedArray,
    toggle,
    toggleAll,
    clear,
    allSelected,
  } = useSelection(allIds);

  useEffect(() => {
    setItems((prev) => applySort(prev, sortMode));
  }, [sortMode]);

  const loadStock = useCallback(async () => {
    if (!profileId) return;
    try {
      setError(null);
      const data = await window.api.stock.list(profileId);
      setItems(applySort((data as any[]).map(normalizeStockItem), sortMode));
    } catch {
      setError('Failed to load stock');
    }
  }, [profileId, sortMode]);

  useEffect(() => {
    if (profileId) void loadStock();
  }, [profileId, loadStock]);

  async function handleDeleteSelected() {
    if (!profileId || selectedArray.length === 0) return;
    const ids = selectedArray;
    const itemIds = ids.filter((id) => items.some((i) => i.id === id));
    const inputIds = ids.filter((id) => inputRows.some((r) => r.id === id));

    try {
      await Promise.all(
        itemIds.map((id) => window.api.stock.delete(profileId, id)),
      );

      const data = await window.api.stock.list(profileId);
      if (data)
        setItems(applySort((data as any[]).map(normalizeStockItem), sortMode));

      setInputRows((rows) => {
        let updated = rows.filter((r) => !inputIds.includes(r.id));
        if (!updated.length) {
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
      window.dispatchEvent(new CustomEvent('stock:changed'));
    } catch (err) {
      console.error('Delete failed:', err);
      setError('Failed to delete selected items');
      void loadStock(); // Try to reload to ensure UI matches DB
      window.dispatchEvent(new CustomEvent('stock:changed'));
    }
  }

  function schedulePersist(next: StockItem) {
    if (!profileId) return;
    const id = next.id;
    pendingPersist.current[id] = next;

    if (persistTimers.current[id]) clearTimeout(persistTimers.current[id]);
    persistTimers.current[id] = window.setTimeout(() => {
      const pending = pendingPersist.current[id];
      delete persistTimers.current[id];
      if (!pending) return;

      delete pendingPersist.current[id];
      window.api.stock
        .update(profileId, id, pending)
        .then(() => {
          window.dispatchEvent(new CustomEvent('stock:changed'));
        })
        .catch(() => {});
    }, 500);
  }

  function updateItemField(id: number, field: keyof StockItem, value: string) {
    if (!editMode) return;
    setItems((prev) =>
      prev.map((i) => {
        if (i.id !== id) return i;
        const num = Number(value);
        const next: StockItem =
          field === 'name' || field === 'code'
            ? {...i, [field]: value}
            : {...i, [field]: isNaN(num) ? 0 : num};
        schedulePersist(next);
        return next;
      }),
    );
  }

  const purchaseSum = useMemo(
    () => items.reduce((s, it) => s + it.purchaseRate * it.purchaseQty, 0),
    [items],
  );
  const saleSum = useMemo(
    () => items.reduce((s, it) => s + it.saleRate * it.saleQty, 0),
    [items],
  );
  const grandTotal = useMemo(
    () =>
      items.reduce(
        (s, it) => s + it.purchaseRate * (it.purchaseQty - it.saleQty),
        0,
      ),
    [items],
  );

  function handleInputRowChange(
    idx: number,
    field: keyof InputRow,
    value: string,
  ) {
    setInputRows((rows) => {
      const updated = [...rows];
      updated[idx] = {...updated[idx], [field]: value};
      return updated;
    });
  }

  function isRowComplete(r: InputRow) {
    return (
      r.code.trim() &&
      r.name.trim() &&
      r.purchaseRate.trim() &&
      r.purchaseQty.trim() &&
      r.saleRate.trim() &&
      r.saleQty.trim()
    );
  }

  function commitInputRow(idx: number) {
    if (!profileId || !editMode) return;
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
    window.api.stock.create(profileId, payload).then((created: any) => {
      if (!created) return;
      setItems((prev) =>
        applySort(
          [
            ...prev,
            normalizeStockItem({
              ...created,
              purchaseQty: created.purchaseQty ?? created.qty ?? 0,
            }),
          ],
          sortMode,
        ),
      );
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
      window.dispatchEvent(new CustomEvent('stock:changed'));
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
    setItems((prev) => applySort(prev, 'name-asc'));
  }

  function getField(obj: any, candidates: string[]) {
    const norm = (s: string) => s.toLowerCase().replace(/[\s_]/g, '');
    const map = new Map<string, any>();
    for (const k of Object.keys(obj ?? {})) map.set(norm(k), obj[k]);
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
    if (!profileId) return;
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    try {
      const isCSV = file.name.toLowerCase().endsWith('.csv');
      let rows: any[] = [];
      if (isCSV) {
        const text = await file.text();
        const parsed = Papa.parse(text, {
          header: true,
          skipEmptyLines: true,
          transformHeader: (h) => h.trim(),
        });
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
      if (!rows.length) {
        alert('No items found.');
        return;
      }
      const byCode = new Map<string, StockItem>(items.map((i) => [i.code, i]));
      let created = 0,
        updated = 0;
      for (const rec of rows) {
        const code = String(getField(rec, ['code', 'item code']) ?? '').trim();
        const name = String(getField(rec, ['name', 'item name']) ?? '').trim();
        const purchaseRate = toNumber(
          getField(rec, ['purchaseRate', 'purchase rate']),
        );
        const purchaseQty = toNumber(
          getField(rec, ['purchaseQty', 'purchase qty']),
        );
        const saleRate = toNumber(getField(rec, ['saleRate', 'sale rate']));
        const saleQty = toNumber(getField(rec, ['saleQty', 'sale qty']));
        if (!code || !name) continue;
        const existing = byCode.get(code);
        if (existing) {
          await window.api.stock.update(profileId, existing.id, {
            code,
            name,
            purchaseRate,
            purchaseQty,
            saleRate,
            saleQty,
          });
          updated++;
        } else {
          const res = await window.api.stock.create(profileId, {
            code,
            name,
            purchaseRate,
            purchaseQty,
            saleRate,
            saleQty,
          });
          if (res) {
            created++;
            byCode.set(code, normalizeStockItem(res));
          }
        }
      }
      const fresh = await window.api.stock.list(profileId);
      if (fresh)
        setItems(applySort((fresh as any[]).map(normalizeStockItem), sortMode));
      window.dispatchEvent(new CustomEvent('stock:changed'));
      alert(`Import complete. Created: ${created}, Updated: ${updated}.`);
    } catch {
      alert('Import failed.');
    } finally {
      setIsImporting(false);
      // Fix: Reset input so the same file can be selected again if needed
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  // FIX: Fetch snapshots on load with safety check
  useEffect(() => {
    if (!profileId) return;
    (window as any).api?.stock
      ?.listSnapshots?.(profileId)
      .then((list: string[]) => {
        setSnapshots(list || []);
      });
  }, [profileId]);

  // FIX: Load data based on selection (Current vs History)
  useEffect(() => {
    if (!profileId) return;

    const loadData = async () => {
      let data;
      if (selectedSnapshot === 'current') {
        data = await window.api?.stock.list(profileId);
      } else {
        data = await (window as any).api?.stock?.getSnapshot?.(
          profileId,
          selectedSnapshot,
        );
      }

      if (data) {
        setItems(data);
        // Reset sort when data changes
        setItems((prev) => applySort(prev, sortMode));
      }
    };

    loadData();
  }, [profileId, selectedSnapshot, sortMode]);

  // FIX: Function to close month with safety check
  const handleCloseMonth = async () => {
    if (!profileId) return;
    await flushPendingPersists(profileId);

    if (
      !confirm(
        'Close stock for this month? This will save a snapshot of your current stock.',
      )
    )
      return;

    try {
      await (window as any).api?.stock?.createSnapshot?.(profileId);
      // Refresh list
      const list = await (window as any).api?.stock?.listSnapshots?.(profileId);
      setSnapshots(list || []); // FIX: Default to empty array if undefined
      alert('Month closed successfully!');
    } catch (err) {
      console.error(err);
      alert('Failed to close month');
    }
  };

  // ✅ FIX: Disable edit when viewing history
  const isViewingHistory = selectedSnapshot !== 'current';

  async function handleEditToggle() {
    if (isViewingHistory) return;

    if (editMode) {
      const saved = await flushPendingPersists(profileId, {emitFeedback: true});
      if (saved) {
        setEditMode(false);
      }
      return;
    }

    setEditMode(true);
  }

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <PageHeader title="Stock">
          <div className="flex flex-wrap gap-2">
            {/* FIX: History Dropdown */}
            <div className="flex items-center gap-2 bg-white border border-neutral-300 rounded-md px-3">
              <FiClock className="text-neutral-500" />
              <select
                value={selectedSnapshot}
                onChange={(e) => {
                  if (editMode) {
                    void flushPendingPersists(profileId);
                  }
                  setSelectedSnapshot(e.target.value);
                  if (e.target.value !== 'current') setEditMode(false);
                }}
                className="bg-transparent border-none outline-none text-sm py-2 min-w-30">
                <option value="current">Current Stock</option>
                {snapshots.map((date) => (
                  <option key={date} value={date}>
                    {date} (Snapshot)
                  </option>
                ))}
              </select>
            </div>

            {/* FIX: Close Month Button (Only visible on current) */}
            {selectedSnapshot === 'current' && (
              <button
                type="button"
                onClick={handleCloseMonth}
                className="px-3 py-2 rounded-md bg-neutral-100 hover:bg-neutral-200 text-neutral-700 flex items-center gap-2 text-sm font-medium transition-colors"
                title="Save current stock state">
                <FiSave className="size-4" />
                Close Month
              </button>
            )}

            <button
              type="button"
              onClick={handleEditToggle}
              // ✅ FIX: Disable edit button when viewing history
              disabled={isViewingHistory}
              className={`px-3 py-2 rounded-md flex items-center gap-2 transition-colors ${
                isViewingHistory
                  ? 'bg-neutral-100 text-neutral-400 cursor-not-allowed'
                  : editMode
                    ? 'bg-green-600 text-white hover:bg-green-700'
                    : 'bg-neutral-800 text-white hover:bg-neutral-700'
              }`}>
              {editMode ? <FiSave /> : <FiEdit2 />}
              {editMode ? 'Save' : 'Edit'}
            </button>
            <button
              type="button"
              onClick={handleImportClick}
              disabled={isImporting}
              className="px-3 py-2 rounded-md bg-blue-600 text-white flex items-center gap-2 disabled:opacity-50">
              <FaFileImport />
              {isImporting ? 'Importing…' : 'Import'}
            </button>
            <button
              type="button"
              onClick={handleSortAZ}
              className="px-3 py-2 rounded-md bg-neutral-200 text-neutral-800 flex items-center gap-2">
              <FaSortAlphaDown />
              Sort A–Z
            </button>
            {selectedArray.length > 0 && (
              <button
                type="button"
                onClick={handleDeleteSelected}
                className="px-3 py-2 rounded-md bg-red-600 text-white flex items-center gap-2">
                <FiTrash2 />
                Delete
              </button>
            )}
          </div>
        </PageHeader>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <SummaryCard
          cardTitle="Purchase Value"
          cardValue={purchaseSum}
          format="currency"
        />
        <SummaryCard
          cardTitle="Sale Value"
          cardValue={saleSum}
          format="currency"
        />
        <SummaryCard
          cardTitle="Stock Value"
          cardValue={grandTotal}
          format="currency"
        />
      </div>

      {/* ✅ Redesigned: Proper HTML table for better alignment */}
      <div className="flex-1 overflow-auto bg-white border border-neutral-200 rounded-lg">
        <table className="w-full border-collapse">
          {/* Header */}
          <thead className="sticky top-0 z-10 bg-neutral-50 border-b border-neutral-200">
            <tr className="text-xs font-semibold text-neutral-600 uppercase">
              {editMode && !isViewingHistory && (
                <th className="w-10 px-2 py-3 text-center">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    title="Select all"
                    className="size-4 rounded border-neutral-300 accent-neutral-900 cursor-pointer"
                  />
                </th>
              )}
              <th className="w-16 px-2 py-3 text-center">Code</th>
              <th className="px-2 py-3 text-left">Name</th>
              <th className="w-24 px-2 py-3 text-center">Pur. Rate</th>
              <th className="w-20 px-2 py-3 text-center">Pur. Qty</th>
              <th className="w-28 px-2 py-3 text-center">Pur. Total</th>
              <th className="w-24 px-2 py-3 text-center">Sale Rate</th>
              <th className="w-20 px-2 py-3 text-center">Sale Qty</th>
              <th className="w-28 px-2 py-3 text-center">Sale Total</th>
              <th className="w-20 px-2 py-3 text-center">In Stock</th>
              <th className="w-28 px-2 py-3 text-center">Total</th>
            </tr>
          </thead>

          {/* Body */}
          <tbody>
            {items.map((item, idx) => (
              <StockItemRow
                key={item.id}
                item={item}
                idx={idx}
                editMode={editMode && !isViewingHistory}
                selected={selectedIds.has(item.id)}
                onToggleSelect={() => toggle(item.id)}
                onUpdate={(field: string, value: string) =>
                  updateItemField(item.id, field as keyof StockItem, value)
                }
                onKeyDown={handleGridKey}
              />
            ))}

            {editMode &&
              !isViewingHistory &&
              inputRows.map((row, idx) => (
                <StockInputRow
                  key={row.id}
                  row={row}
                  idx={idx}
                  selected={selectedIds.has(row.id)}
                  onToggleSelect={() => toggle(row.id)}
                  onChange={(field: string, v: string) =>
                    handleInputRowChange(idx, field as keyof InputRow, v)
                  }
                  onCommit={() => commitInputRow(idx)}
                  onKeyDown={handleGridKey}
                />
              ))}
          </tbody>
        </table>

        {editMode && !isViewingHistory && (
          <div className="flex items-center px-3 py-3 border-t border-neutral-100">
            <AddRowButton onClick={addEmptyRow} title="Add item" />
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.json,application/json,text/csv"
        onChange={handleFileSelected}
        className="hidden"
      />
    </>
  );
}
