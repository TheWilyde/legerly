interface Item {
  code?: string;
  name: string;
  rate: number;
  qty: number;
}

interface Props {
  items: Item[];
  saleRateByCode?: Map<string, number>;
  headers?: {
    item?: string;
    rate?: string;
    qty?: string;
    saleRate?: string;
  };
}

export default function ItemsSummary({
  items,
  saleRateByCode,
  headers = {},
}: Props) {
  const {
    item: itemHeader = 'Item',
    rate: rateHeader = 'Rate',
    qty: qtyHeader = 'Qty',
    saleRate: saleRateHeader = 'Sale Rate',
  } = headers;

  if (!items || items.length === 0) {
    return (
      <div className="px-4 py-3 text-sm text-neutral-500">No items found</div>
    );
  }

  return (
    <div className="bg-neutral-50 border-t border-neutral-200">
      {/* Header */}
      <div className="grid grid-cols-12 gap-2 px-4 py-2 text-xs font-semibold text-neutral-600 uppercase border-b border-neutral-100">
        <div className="col-span-5">{itemHeader}</div>
        <div className="col-span-2 text-right">{rateHeader}</div>
        <div className="col-span-2 text-right">{qtyHeader}</div>
        <div className="col-span-3 text-right">
          {saleRateByCode ? saleRateHeader : 'Total'}
        </div>
      </div>

      {/* Items */}
      {items.map((item, idx) => {
        const saleRate = saleRateByCode?.get(item.code || '') || 0;
        const total = item.rate * item.qty;

        return (
          <div
            key={idx}
            className="grid grid-cols-12 gap-2 px-4 py-2 text-sm border-b border-neutral-100 last:border-b-0">
            <div className="col-span-5 truncate">
              <span className="font-medium">{item.name}</span>
              {item.code && (
                <span className="ml-2 text-xs text-neutral-400">
                  ({item.code})
                </span>
              )}
            </div>
            <div className="col-span-2 text-right tabular-nums">
              {item.rate.toLocaleString('en-PK', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
            <div className="col-span-2 text-right tabular-nums">{item.qty}</div>
            <div className="col-span-3 text-right tabular-nums font-medium">
              {saleRateByCode
                ? saleRate.toLocaleString('en-PK', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })
                : total.toLocaleString('en-PK', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
            </div>
          </div>
        );
      })}

      {/* Footer Total */}
      <div className="grid grid-cols-12 gap-2 px-4 py-2 text-sm font-semibold bg-neutral-100">
        <div className="col-span-5">Total</div>
        <div className="col-span-2 text-right"></div>
        <div className="col-span-2 text-right tabular-nums">
          {items.reduce((sum, item) => sum + item.qty, 0)}
        </div>
        <div className="col-span-3 text-right tabular-nums">
          {items
            .reduce((sum, item) => sum + item.rate * item.qty, 0)
            .toLocaleString('en-PK', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
        </div>
      </div>
    </div>
  );
}
