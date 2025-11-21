import type React from 'react';

export type InputRow = {
  id: number;
  code: string;
  name: string;
  purchaseRate: string;
  purchaseQty: string;
  saleRate: string;
  saleQty: string;
};

type Props = {
  row: InputRow;
  idx?: number;
  selected?: boolean;
  onToggleSelect?: () => void;
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
  onChange: (
    field:
      | 'code'
      | 'name'
      | 'purchaseRate'
      | 'purchaseQty'
      | 'saleRate'
      | 'saleQty',
    value: string
  ) => void;
  onCommit: () => void;
  onDelete?: () => void;
};

export default function StockInputRow({
  row,
  idx,
  selected,
  onToggleSelect,
  onKeyDown,
  onChange,
  onCommit,
  onDelete,
}: Props) {
  // reference onDelete to silence unused warning if not rendered
  onDelete && void 0;

  return (
    <div className="flex items-center gap-3 px-4 py-2">
      <div className="w-8 flex justify-center">
        {/* ✅ Replace Checkbox with inline input */}
        <input
          type="checkbox"
          className="size-5 accent-neutral-900"
          checked={selected}
          onChange={onToggleSelect}
          title="Select input row"
        />
      </div>
      <input
        className="w-28 h-9 rounded-md border border-neutral-300 px-2 text-center"
        placeholder="Code"
        value={row.code}
        onChange={(e) => onChange('code', e.target.value)}
        onBlur={onCommit}
        onKeyDown={onKeyDown}
        data-section="inputs"
        data-row-index={String(idx)}
        data-col="code"
      />
      <input
        className="flex-1 h-9 rounded-md border border-neutral-300 px-2"
        placeholder="Item name"
        value={row.name}
        onChange={(e) => onChange('name', e.target.value)}
        onBlur={onCommit}
        onKeyDown={onKeyDown}
        data-section="inputs"
        data-row-index={String(idx)}
        data-col="name"
      />
      <input
        className="w-28 h-9 rounded-md border border-neutral-300 px-2 text-center"
        placeholder="0.00"
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
      <input
        className="w-28 h-9 rounded-md border border-neutral-300 px-2 text-center"
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
      <div className="w-32 text-center tabular-nums text-neutral-400">--</div>
      <input
        className="w-28 h-9 rounded-md border border-neutral-300 px-2 text-center"
        placeholder="0.00"
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
      <input
        className="w-28 h-9 rounded-md border border-neutral-300 px-2 text-center"
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
      <div className="w-32 text-center tabular-nums text-neutral-400">--</div>
      <div className="w-28 text-center tabular-nums text-neutral-400">--</div>
      <div className="w-28 text-center tabular-nums text-neutral-400">--</div>
    </div>
  );
}
