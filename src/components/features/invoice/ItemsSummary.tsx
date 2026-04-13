interface Item {
  code?: string;
  name: string;
  rate: number;
  qty: number;
}

interface Props {
  items: Item[];
  saleRateByCode?: Map<string, number>;
  showProfit?: boolean;
  headers?: {
    item?: string;
    rate?: string;
    qty?: string;
    saleRate?: string;
    profit?: string;
  };
}

export default function ItemsSummary({
  items,
  saleRateByCode,
  showProfit = false,
  headers = {},
}: Props) {
  const {
    item: itemHeader = 'Item',
    rate: rateHeader = 'Rate',
    qty: qtyHeader = 'Qty',
    saleRate: saleRateHeader = 'Sale Rate',
    profit: profitHeader = 'Profit',
  } = headers;

  const showComparisonRate = Boolean(saleRateByCode);
  const showProfitColumn = showProfit && showComparisonRate;
  const itemColSpan = showProfitColumn ? 'col-span-4' : 'col-span-5';
  const comparisonColSpan = showProfitColumn ? 'col-span-2' : 'col-span-3';

  const formatAmount = (value: number) =>
    value.toLocaleString('en-PK', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  if (!items || items.length === 0) {
    return (
      <div className="px-4 py-3 text-sm text-neutral-500">No items found</div>
    );
  }

  return (
    <div className="bg-neutral-50 border-t border-neutral-200">
      {/* Header */}
      <div className="grid grid-cols-12 gap-2 px-4 py-2 text-xs font-semibold text-neutral-600 uppercase border-b border-neutral-100">
        <div className={itemColSpan}>{itemHeader}</div>
        <div className="col-span-2 text-right">{rateHeader}</div>
        <div className="col-span-2 text-right">{qtyHeader}</div>
        <div className={`${comparisonColSpan} text-right`}>
          {showComparisonRate ? saleRateHeader : 'Total'}
        </div>
        {showProfitColumn && (
          <div className="col-span-2 text-right">{profitHeader}</div>
        )}
      </div>

      {/* Items */}
      {items.map((item, idx) => {
        const comparisonRate = saleRateByCode?.get(item.code || '');
        const hasComparisonRate = typeof comparisonRate === 'number';
        const total = item.rate * item.qty;
        const profit =
          hasComparisonRate && showProfitColumn
            ? (item.rate - comparisonRate) * item.qty
            : null;

        return (
          <div
            key={idx}
            className="grid grid-cols-12 gap-2 px-4 py-2 text-sm border-b border-neutral-100 last:border-b-0">
            <div className={`${itemColSpan} truncate`}>
              <span className="font-medium">{item.name}</span>
              {item.code && (
                <span className="ml-2 text-xs text-neutral-400">
                  ({item.code})
                </span>
              )}
            </div>
            <div className="col-span-2 text-right tabular-nums">
              {formatAmount(item.rate)}
            </div>
            <div className="col-span-2 text-right tabular-nums">{item.qty}</div>
            <div
              className={`${comparisonColSpan} text-right tabular-nums font-medium`}>
              {showComparisonRate
                ? hasComparisonRate
                  ? formatAmount(comparisonRate)
                  : ''
                : formatAmount(total)}
            </div>
            {showProfitColumn && (
              <div className="col-span-2 text-right tabular-nums font-medium">
                {profit === null ? '' : formatAmount(profit)}
              </div>
            )}
          </div>
        );
      })}

      {/* Footer Total */}
      <div className="grid grid-cols-12 gap-2 px-4 py-2 text-sm font-semibold bg-neutral-100">
        <div className={itemColSpan}>Total</div>
        <div className="col-span-2 text-right"></div>
        <div className="col-span-2 text-right tabular-nums">
          {items.reduce((sum, item) => sum + item.qty, 0)}
        </div>
        <div className={`${comparisonColSpan} text-right tabular-nums`}>
          {formatAmount(
            items.reduce((sum, item) => sum + item.rate * item.qty, 0),
          )}
        </div>
        {showProfitColumn && (
          <div className="col-span-2 text-right tabular-nums">
            {formatAmount(
              items.reduce((sum, item) => {
                const comparisonRate = saleRateByCode?.get(item.code || '');
                if (typeof comparisonRate !== 'number') return sum;
                return sum + (item.rate - comparisonRate) * item.qty;
              }, 0),
            )}
          </div>
        )}
      </div>
    </div>
  );
}
