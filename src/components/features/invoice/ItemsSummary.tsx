export type SummaryItem = {
  id: number;
  code: string;
  name: string;
  rate: number;
  qty: number;
};

type Headers = {
  item?: string;
  rate?: string;
  qty?: string;
  saleRate?: string;
};

type Props = {
  items: SummaryItem[];
  saleRateByCode: Map<string, number>;
  headers?: Headers;
};

export default function ItemsSummary({items, saleRateByCode, headers}: Props) {
  const h = {
    item: headers?.item ?? 'Item',
    rate: headers?.rate ?? 'Purchase Rate',
    qty: headers?.qty ?? 'Purchase Qty',
    saleRate: headers?.saleRate ?? 'Sale Rate',
  } as const;

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[560px]">
        <div className="grid grid-cols-[1fr_120px_120px_120px] gap-2 px-4 py-1 text-neutral-600 font-medium">
          <div>{h.item}</div>
          <div className="text-center">{h.rate}</div>
          <div className="text-center">{h.qty}</div>
          <div className="text-center">{h.saleRate}</div>
        </div>
        {items.length > 0 ? (
          items.map((it) => {
            const saleRate = saleRateByCode.get(it.code) ?? 0;
            return (
              <div
                key={it.id}
                className="grid grid-cols-[1fr_120px_120px_120px] gap-2 px-4 py-1 border-t border-neutral-200">
                <div className="truncate">{it.name}</div>
                <div className="text-center tabular-nums">
                  {it.rate.toFixed(2)}
                </div>
                <div className="text-center tabular-nums">{it.qty}</div>
                <div className="text-center tabular-nums">
                  {saleRate.toFixed(2)}
                </div>
              </div>
            );
          })
        ) : (
          <div className="px-1 py-2 text-neutral-500">No items.</div>
        )}
      </div>
    </div>
  );
}
