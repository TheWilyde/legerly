import Checkbox from '../common/Checkbox';
import {FiMove} from 'react-icons/fi';
import type React from 'react';

type StockItem = {
  id: number;
  code: string;
  name: string;
  purchaseRate: number;
  purchaseQty: number;
  saleRate: number;
  saleQty: number;
};

type Props = {
  item: StockItem;
  idx: number;
  editMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onDragStart: () => void;
  onDrop: () => void;
  onUpdate: (
    field:
      | 'code'
      | 'name'
      | 'purchaseRate'
      | 'purchaseQty'
      | 'saleRate'
      | 'saleQty',
    value: string
  ) => void;
  onKeyDown: React.KeyboardEventHandler<HTMLInputElement>;
};

export default function StockItemRow({
  item,
  idx,
  editMode,
  selected,
  onToggleSelect,
  onDragStart,
  onDrop,
  onUpdate,
  onKeyDown,
}: Props) {
  const inStock = item.purchaseQty - item.saleQty;
  const purchaseTotal = item.purchaseRate * item.purchaseQty;
  const saleTotal = item.saleRate * item.saleQty;
  const total = item.purchaseRate * inStock;

  return (
    <div
      className="flex items-center gap-3 px-4 py-2 border-b border-neutral-100"
      draggable={editMode}
      onDragStart={onDragStart}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}>
      <div className="w-8 flex justify-center">
        <Checkbox
          checked={selected}
          onChange={onToggleSelect}
          title="Select item"
        />
      </div>
      <div className="w-8 flex items-center justify-center text-neutral-400">
        <FiMove className={`size-4 ${editMode ? 'cursor-move' : ''}`} />
      </div>
      <input
        className="w-28 h-9 rounded-md border border-neutral-300 px-2 text-center disabled:bg-transparent disabled:border-transparent"
        value={item.code}
        onChange={(e) => onUpdate('code', e.target.value)}
        disabled={!editMode}
        data-section="items"
        data-row-index={String(idx)}
        data-col="code"
        onKeyDown={onKeyDown}
      />
      <input
        className="flex-1 h-9 rounded-md border border-neutral-300 px-2 disabled:bg-transparent disabled:border-transparent"
        value={item.name}
        onChange={(e) => onUpdate('name', e.target.value)}
        disabled={!editMode}
        data-section="items"
        data-row-index={String(idx)}
        data-col="name"
        onKeyDown={onKeyDown}
      />
      <input
        className="w-28 h-9 rounded-md border border-neutral-300 px-2 text-center disabled:bg-transparent disabled:border-transparent"
        value={String(item.purchaseRate)}
        onChange={(e) => onUpdate('purchaseRate', e.target.value)}
        disabled={!editMode}
        data-section="items"
        data-row-index={String(idx)}
        data-col="purchaseRate"
        onKeyDown={onKeyDown}
      />
      <input
        className="w-28 h-9 rounded-md border border-neutral-300 px-2 text-center disabled:bg-transparent disabled:border-transparent"
        value={String(item.purchaseQty)}
        onChange={(e) => onUpdate('purchaseQty', e.target.value)}
        disabled={!editMode}
        data-section="items"
        data-row-index={String(idx)}
        data-col="purchaseQty"
        onKeyDown={onKeyDown}
      />
      <div className="w-32 text-center tabular-nums">
        {purchaseTotal.toFixed(2)}
      </div>
      <input
        className="w-28 h-9 rounded-md border border-neutral-300 px-2 text-center disabled:bg-transparent disabled:border-transparent"
        value={String(item.saleRate)}
        onChange={(e) => onUpdate('saleRate', e.target.value)}
        disabled={!editMode}
        data-section="items"
        data-row-index={String(idx)}
        data-col="saleRate"
        onKeyDown={onKeyDown}
      />
      <input
        className="w-28 h-9 rounded-md border border-neutral-300 px-2 text-center disabled:bg-transparent disabled:border-transparent"
        value={String(item.saleQty)}
        onChange={(e) => onUpdate('saleQty', e.target.value)}
        disabled={!editMode}
        data-section="items"
        data-row-index={String(idx)}
        data-col="saleQty"
        onKeyDown={onKeyDown}
      />
      <div className="w-32 text-center tabular-nums">
        {saleTotal.toFixed(2)}
      </div>
      <div className="w-28 text-center tabular-nums">{inStock.toFixed(2)}</div>
      <div className="w-28 text-center tabular-nums font-semibold">
        {total.toFixed(2)}
      </div>
    </div>
  );
}
