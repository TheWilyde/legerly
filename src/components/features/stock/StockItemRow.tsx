import {useMemo} from 'react';

interface StockItem {
  id: number;
  code: string;
  name: string;
  purchaseRate: number;
  purchaseQty: number;
  saleRate: number;
  saleQty: number;
}

interface Props {
  item: StockItem;
  idx: number;
  editMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onUpdate: (field: string, value: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

export default function StockItemRow({
  item,
  idx,
  editMode,
  selected,
  onToggleSelect,
  onUpdate,
  onKeyDown,
}: Props) {
  const purchaseTotal = useMemo(
    () => item.purchaseRate * item.purchaseQty,
    [item.purchaseRate, item.purchaseQty]
  );
  const saleTotal = useMemo(
    () => item.saleRate * item.saleQty,
    [item.saleRate, item.saleQty]
  );
  const inStock = useMemo(
    () => item.purchaseQty - item.saleQty,
    [item.purchaseQty, item.saleQty]
  );
  const total = useMemo(
    () => item.purchaseRate * inStock,
    [item.purchaseRate, inStock]
  );

  const rowBg = selected
    ? 'bg-blue-50'
    : idx % 2 === 0
      ? 'bg-white'
      : 'bg-neutral-50/50';

  return (
    <tr
      className={`text-sm ${rowBg} hover:bg-neutral-100 transition-colors border-b border-neutral-100`}>
      {/* Checkbox - only in edit mode */}
      {editMode && (
        <td className="px-2 py-2 text-center">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            className="size-4 rounded border-neutral-300 accent-neutral-900 cursor-pointer"
          />
        </td>
      )}

      {/* Code */}
      <td className="px-2 py-2">
        {editMode ? (
          <input
            className="w-full h-8 rounded border border-neutral-300 px-1 text-center text-sm"
            value={item.code}
            onChange={(e) => onUpdate('code', e.target.value)}
            onKeyDown={onKeyDown}
            data-section="items"
            data-row-index={String(idx)}
            data-col="code"
          />
        ) : (
          <div className="text-center font-mono text-neutral-700">
            {item.code}
          </div>
        )}
      </td>

      {/* Name - Left aligned */}
      <td className="px-2 py-2">
        {editMode ? (
          <input
            className="w-full h-8 rounded border border-neutral-300 px-2 text-sm"
            value={item.name}
            onChange={(e) => onUpdate('name', e.target.value)}
            onKeyDown={onKeyDown}
            data-section="items"
            data-row-index={String(idx)}
            data-col="name"
          />
        ) : (
          <div className="truncate">{item.name}</div>
        )}
      </td>

      {/* Purchase Rate */}
      <td className="px-2 py-2">
        {editMode ? (
          <input
            className="w-full h-8 rounded border border-neutral-300 px-1 text-center text-sm"
            type="number"
            step="0.01"
            value={item.purchaseRate}
            onChange={(e) => onUpdate('purchaseRate', e.target.value)}
            onKeyDown={onKeyDown}
            data-section="items"
            data-row-index={String(idx)}
            data-col="purchaseRate"
          />
        ) : (
          <div className="text-center tabular-nums">
            {item.purchaseRate.toLocaleString()}
          </div>
        )}
      </td>

      {/* Purchase Qty */}
      <td className="px-2 py-2">
        {editMode ? (
          <input
            className="w-full h-8 rounded border border-neutral-300 px-1 text-center text-sm"
            type="number"
            step="1"
            value={item.purchaseQty}
            onChange={(e) => onUpdate('purchaseQty', e.target.value)}
            onKeyDown={onKeyDown}
            data-section="items"
            data-row-index={String(idx)}
            data-col="purchaseQty"
          />
        ) : (
          <div className="text-center tabular-nums">{item.purchaseQty}</div>
        )}
      </td>

      {/* Purchase Total */}
      <td className="px-2 py-2 text-center tabular-nums text-neutral-600">
        {purchaseTotal.toLocaleString()}
      </td>

      {/* Sale Rate */}
      <td className="px-2 py-2">
        {editMode ? (
          <input
            className="w-full h-8 rounded border border-neutral-300 px-1 text-center text-sm"
            type="number"
            step="0.01"
            value={item.saleRate}
            onChange={(e) => onUpdate('saleRate', e.target.value)}
            onKeyDown={onKeyDown}
            data-section="items"
            data-row-index={String(idx)}
            data-col="saleRate"
          />
        ) : (
          <div className="text-center tabular-nums">
            {item.saleRate.toLocaleString()}
          </div>
        )}
      </td>

      {/* Sale Qty */}
      <td className="px-2 py-2">
        {editMode ? (
          <input
            className="w-full h-8 rounded border border-neutral-300 px-1 text-center text-sm"
            type="number"
            step="1"
            value={item.saleQty}
            onChange={(e) => onUpdate('saleQty', e.target.value)}
            onKeyDown={onKeyDown}
            data-section="items"
            data-row-index={String(idx)}
            data-col="saleQty"
          />
        ) : (
          <div className="text-center tabular-nums">{item.saleQty}</div>
        )}
      </td>

      {/* Sale Total */}
      <td className="px-2 py-2 text-center tabular-nums text-neutral-600">
        {saleTotal.toLocaleString()}
      </td>

      {/* In Stock */}
      <td
        className={`px-2 py-2 text-center tabular-nums font-medium ${
          inStock <= 0
            ? 'text-red-600'
            : inStock <= 10
              ? 'text-orange-600'
              : 'text-green-600'
        }`}>
        {inStock}
      </td>

      {/* Total */}
      <td className="px-2 py-2 text-center tabular-nums font-semibold">
        {total.toLocaleString()}
      </td>
    </tr>
  );
}
