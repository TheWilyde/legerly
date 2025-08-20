import {useEffect, useState} from 'react';
import {FiTrash2, FiPlus, FiEdit2, FiMove} from 'react-icons/fi';

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

function Stock() {
  const [items, setItems] = useState<StockItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
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
  const [draggingId, setDraggingId] = useState<number | null>(null);

  // Compute Select All across items and visible input rows (only in edit mode)
  const totalSelectable = items.length + (editMode ? inputRows.length : 0);
  const allSelected =
    totalSelectable > 0 && selectedIds.size === totalSelectable;

  useEffect(() => {
    (async () => {
      const data = await window.api?.stock.list();
      if (data) {
        setItems(data);
        nextId =
          ((data as {id: number}[]).reduce(
            (max: number, i: {id: number}) => Math.max(max, i.id),
            0
          ) || 0) + 1;
      }
    })();
  }, []);

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    const allIds = [
      ...items.map((i) => i.id),
      ...(editMode ? inputRows.map((r) => r.id) : []),
    ];
    setSelectedIds((prev) =>
      prev.size === allIds.length ? new Set() : new Set(allIds)
    );
  }

  function handleDelete() {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
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
        setSelectedIds(new Set());
      }
    );
  }

  function updateItemField(id: number, field: keyof StockItem, value: string) {
    if (!editMode) return;
    setItems((prev) =>
      prev.map((i) => {
        if (i.id !== id) return i;
        if (field === 'name' || field === 'code') {
          const next = {...i, [field]: value} as StockItem;
          window.api?.stock.update(id, {
            code: next.code,
            name: next.name,
            purchaseRate: next.purchaseRate,
            purchaseQty: next.purchaseQty,
            saleRate: next.saleRate,
            saleQty: next.saleQty,
          });
          return next;
        }
        const num = Number(value);
        const next = {...i, [field]: isNaN(num) ? 0 : num} as StockItem;
        window.api?.stock.update(id, {
          code: next.code,
          name: next.name,
          purchaseRate: next.purchaseRate,
          purchaseQty: next.purchaseQty,
          saleRate: next.saleRate,
          saleQty: next.saleQty,
        });
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

  // DnD: reorder items
  function reorderItems(dragId: number, targetId: number) {
    if (dragId === targetId) return;
    setItems((prev) => {
      const from = prev.findIndex((i) => i.id === dragId);
      const to = prev.findIndex((i) => i.id === targetId);
      if (from < 0 || to < 0) return prev;
      const arr = [...prev];
      const [moved] = arr.splice(from, 1);
      arr.splice(to, 0, moved);
      return arr;
    });
  }

  return (
    <div>
      {/* Main header */}
      <header className="bg-white shadow flex items-center justify-between px-4 py-3 rounded-md">
        <h1 className="text-xl font-semibold">Stock</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setEditMode((v) => !v)}
            className="inline-flex items-center gap-2 h-9 px-3 rounded-md bg-neutral-900 text-white"
            title={editMode ? 'Stop Editing' : 'Edit'}>
            <FiEdit2 className="size-4" />
            <span>{editMode ? 'Done' : 'Edit'}</span>
          </button>
          {selectedIds.size > 0 && (
            <button
              className="inline-flex items-center gap-2 h-9 px-3 rounded-md border border-red-200 text-red-700 hover:bg-red-50"
              onClick={handleDelete}
              title="Delete selected">
              <FiTrash2 className="size-4" />
              <span>Delete</span>
            </button>
          )}
        </div>
      </header>

      {/* Column headers */}
      <div className="mt-4 bg-white rounded-md overflow-hidden">
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
          <div className="w-8" aria-hidden /> {/* drag handle space */}
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

        {/* Existing items (draggable) */}
        {items.map((item) => {
          const inStock = computeInStock(item);
          const purchaseTotal = computePurchaseTotal(item);
          const saleTotal = computeSaleTotal(item);
          const total = computeTotal(item);

          return (
            <div
              key={item.id}
              className="flex items-center gap-3 px-4 py-2 border-b border-neutral-100"
              draggable={editMode}
              onDragStart={() => setDraggingId(item.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (draggingId != null) reorderItems(draggingId, item.id);
                setDraggingId(null);
              }}>
              <div className="w-8 flex justify-center">
                <input
                  type="checkbox"
                  className="size-5 accent-neutral-900"
                  checked={selectedIds.has(item.id)}
                  onChange={() => toggleSelect(item.id)}
                  title="Select item"
                />
              </div>
              <div className="w-8 flex items-center justify-center text-neutral-400">
                <FiMove className={`size-4 ${editMode ? 'cursor-move' : ''}`} />
              </div>
              <input
                className="w-28 h-9 rounded-md border border-neutral-300 px-2 text-center disabled:bg-transparent disabled:border-transparent"
                value={item.code}
                onChange={(e) =>
                  updateItemField(item.id, 'code', e.target.value)
                }
                disabled={!editMode}
              />
              <input
                className="flex-1 h-9 rounded-md border border-neutral-300 px-2 disabled:bg-transparent disabled:border-transparent"
                value={item.name}
                onChange={(e) =>
                  updateItemField(item.id, 'name', e.target.value)
                }
                disabled={!editMode}
              />
              <input
                className="w-28 h-9 rounded-md border border-neutral-300 px-2 text-center disabled:bg-transparent disabled:border-transparent"
                value={String(item.purchaseRate)}
                onChange={(e) =>
                  updateItemField(item.id, 'purchaseRate', e.target.value)
                }
                disabled={!editMode}
              />
              <input
                className="w-28 h-9 rounded-md border border-neutral-300 px-2 text-center disabled:bg-transparent disabled:border-transparent"
                value={String(item.purchaseQty)}
                onChange={(e) =>
                  updateItemField(item.id, 'purchaseQty', e.target.value)
                }
                disabled={!editMode}
              />
              <div className="w-32 text-center tabular-nums">
                {purchaseTotal.toFixed(2)}
              </div>
              <input
                className="w-28 h-9 rounded-md border border-neutral-300 px-2 text-center disabled:bg-transparent disabled:border-transparent"
                value={String(item.saleRate)}
                onChange={(e) =>
                  updateItemField(item.id, 'saleRate', e.target.value)
                }
                disabled={!editMode}
              />
              <input
                className="w-28 h-9 rounded-md border border-neutral-300 px-2 text-center disabled:bg-transparent disabled:border-transparent"
                value={String(item.saleQty)}
                onChange={(e) =>
                  updateItemField(item.id, 'saleQty', e.target.value)
                }
                disabled={!editMode}
              />
              <div className="w-32 text-center tabular-nums">
                {saleTotal.toFixed(2)}
              </div>
              <div className="w-28 text-center tabular-nums">
                {inStock.toFixed(2)}
              </div>
              <div className="w-28 text-center tabular-nums font-semibold">
                {total.toFixed(2)}
              </div>
            </div>
          );
        })}

        {/* Inline input rows (always at end). Only one is guaranteed unless user adds more */}
        {editMode &&
          inputRows.map((row, idx) => (
            <div key={row.id} className="flex items-center gap-3 px-4 py-2">
              <div className="w-8 flex justify-center">
                <input
                  type="checkbox"
                  className="size-5 accent-neutral-900"
                  checked={selectedIds.has(row.id)}
                  onChange={() => toggleSelect(row.id)}
                  title="Select input row"
                />
              </div>
              <div className="w-8" />
              <input
                className="w-28 h-9 rounded-md border border-neutral-300 px-2 text-center"
                placeholder="Code"
                value={row.code}
                onChange={(e) =>
                  handleInputRowChange(idx, 'code', e.target.value)
                }
                onBlur={() => commitInputRow(idx)}
                onKeyDown={(e) => e.key === 'Enter' && commitInputRow(idx)}
              />
              <input
                className="flex-1 h-9 rounded-md border border-neutral-300 px-2"
                placeholder="Item name"
                value={row.name}
                onChange={(e) =>
                  handleInputRowChange(idx, 'name', e.target.value)
                }
                onBlur={() => commitInputRow(idx)}
                onKeyDown={(e) => e.key === 'Enter' && commitInputRow(idx)}
              />
              <input
                className="w-28 h-9 rounded-md border border-neutral-300 px-2 text-center"
                placeholder="0.00"
                type="number"
                step="0.01"
                value={row.purchaseRate}
                onChange={(e) =>
                  handleInputRowChange(idx, 'purchaseRate', e.target.value)
                }
                onBlur={() => commitInputRow(idx)}
                onKeyDown={(e) => e.key === 'Enter' && commitInputRow(idx)}
              />
              <input
                className="w-28 h-9 rounded-md border border-neutral-300 px-2 text-center"
                placeholder="0"
                type="number"
                step="1"
                value={row.purchaseQty}
                onChange={(e) =>
                  handleInputRowChange(idx, 'purchaseQty', e.target.value)
                }
                onBlur={() => commitInputRow(idx)}
                onKeyDown={(e) => e.key === 'Enter' && commitInputRow(idx)}
              />
              <div className="w-32 text-center tabular-nums text-neutral-400">
                --
              </div>
              <input
                className="w-28 h-9 rounded-md border border-neutral-300 px-2 text-center"
                placeholder="0.00"
                type="number"
                step="0.01"
                value={row.saleRate}
                onChange={(e) =>
                  handleInputRowChange(idx, 'saleRate', e.target.value)
                }
                onBlur={() => commitInputRow(idx)}
                onKeyDown={(e) => e.key === 'Enter' && commitInputRow(idx)}
              />
              <input
                className="w-28 h-9 rounded-md border border-neutral-300 px-2 text-center"
                placeholder="0"
                type="number"
                step="1"
                value={row.saleQty}
                onChange={(e) =>
                  handleInputRowChange(idx, 'saleQty', e.target.value)
                }
                onBlur={() => commitInputRow(idx)}
                onKeyDown={(e) => e.key === 'Enter' && commitInputRow(idx)}
              />
              <div className="w-32 text-center tabular-nums text-neutral-400">
                --
              </div>
              <div className="w-28 text-center tabular-nums text-neutral-400">
                --
              </div>
              <div className="w-28 text-center tabular-nums text-neutral-400">
                --
              </div>
            </div>
          ))}

        {/* Footer row with Add button (separate row) */}
        {editMode && (
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
        )}
      </div>
    </div>
  );
}

export default Stock;
