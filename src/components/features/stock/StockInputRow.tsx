import type React from 'react';

interface InputRow {
  id: number;
  code: string;
  name: string;
  purchaseRate: string;
  purchaseQty: string;
  saleRate: string;
  saleQty: string;
}

interface Props {
  row: InputRow;
  idx: number;
  selected: boolean;
  onToggleSelect: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onChange: (field: string, value: string) => void;
  onCommit: () => void;
}

export default function StockInputRow({
  row,
  idx,
  selected,
  onToggleSelect,
  onKeyDown,
  onChange,
  onCommit,
}: Props) {
  const purchaseRate = parseFloat(row.purchaseRate) || 0;
  const purchaseQty = parseInt(row.purchaseQty) || 0;
  const saleRate = parseFloat(row.saleRate) || 0;
  const saleQty = parseInt(row.saleQty) || 0;

  const purchaseTotal = purchaseRate * purchaseQty;
  const saleTotal = saleRate * saleQty;
  const inStock = purchaseQty - saleQty;
  const total = purchaseRate * inStock;

  const rowBg = selected ? 'bg-blue-50' : 'bg-green-50/30';

  return (
    <tr className={`text-sm ${rowBg} border-b border-neutral-100`}>
      {/* Checkbox */}
      <td className="px-2 py-2 text-center">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          className="size-4 rounded border-neutral-300 accent-neutral-900 cursor-pointer"
        />
      </td>

      {/* Code */}
      <td className="px-2 py-2">
        <input
          className="w-full h-8 rounded border border-neutral-300 px-1 text-center text-sm bg-white"
          placeholder="Code"
          value={row.code}
          onChange={(e) => onChange('code', e.target.value)}
          onBlur={onCommit}
          onKeyDown={onKeyDown}
          data-section="inputs"
          data-row-index={String(idx)}
          data-col="code"
        />
      </td>

      {/* Name */}
      <td className="px-2 py-2">
        <input
          className="w-full h-8 rounded border border-neutral-300 px-2 text-sm bg-white"
          placeholder="Item name"
          value={row.name}
          onChange={(e) => onChange('name', e.target.value)}
          onBlur={onCommit}
          onKeyDown={onKeyDown}
          data-section="inputs"
          data-row-index={String(idx)}
          data-col="name"
        />
      </td>

      {/* Purchase Rate */}
      <td className="px-2 py-2">
        <input
          className="w-full h-8 rounded border border-neutral-300 px-1 text-center text-sm bg-white"
          placeholder="0"
          type="number"
          step="0.01"
          value={row.purchaseRate}
          onChange={(e) => onChange('purchaseRate', e.target.value)}
          onBlur={onCommit}
          onKeyDown={onKeyDown}
          data-section="inputs"
          data-row-index={String(idx)}
          data-col="purchaseRate"
        />
      </td>

      {/* Purchase Qty */}
      <td className="px-2 py-2">
        <input
          className="w-full h-8 rounded border border-neutral-300 px-1 text-center text-sm bg-white"
          placeholder="0"
          type="number"
          step="1"
          value={row.purchaseQty}
          onChange={(e) => onChange('purchaseQty', e.target.value)}
          onBlur={onCommit}
          onKeyDown={onKeyDown}
          data-section="inputs"
          data-row-index={String(idx)}
          data-col="purchaseQty"
        />
      </td>

      {/* Purchase Total */}
      <td className="px-2 py-2 text-center tabular-nums text-neutral-400">
        {purchaseTotal > 0 ? purchaseTotal.toLocaleString() : '--'}
      </td>

      {/* Sale Rate */}
      <td className="px-2 py-2">
        <input
          className="w-full h-8 rounded border border-neutral-300 px-1 text-center text-sm bg-white"
          placeholder="0"
          type="number"
          step="0.01"
          value={row.saleRate}
          onChange={(e) => onChange('saleRate', e.target.value)}
          onBlur={onCommit}
          onKeyDown={onKeyDown}
          data-section="inputs"
          data-row-index={String(idx)}
          data-col="saleRate"
        />
      </td>

      {/* Sale Qty */}
      <td className="px-2 py-2">
        <input
          className="w-full h-8 rounded border border-neutral-300 px-1 text-center text-sm bg-white"
          placeholder="0"
          type="number"
          step="1"
          value={row.saleQty}
          onChange={(e) => onChange('saleQty', e.target.value)}
          onBlur={onCommit}
          onKeyDown={onKeyDown}
          data-section="inputs"
          data-row-index={String(idx)}
          data-col="saleQty"
        />
      </td>

      {/* Sale Total */}
      <td className="px-2 py-2 text-center tabular-nums text-neutral-400">
        {saleTotal > 0 ? saleTotal.toLocaleString() : '--'}
      </td>

      {/* In Stock */}
      <td className="px-2 py-2 text-center tabular-nums text-neutral-400">
        {purchaseQty > 0 || saleQty > 0 ? inStock : '--'}
      </td>

      {/* Total */}
      <td className="px-2 py-2 text-center tabular-nums text-neutral-400">
        {total > 0 ? total.toLocaleString() : '--'}
      </td>
    </tr>
  );
}
