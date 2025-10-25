import {useMemo} from 'react';

type Props = {
  items: Array<{
    id: number;
    code: string;
    name: string;
    rate: number;
    qty: number;
  }>;
  purchaseRateByCode: Map<string, number>;
};

export default function ItemsSummaryProfit({items, purchaseRateByCode}: Props) {
  const totalProfit = useMemo(() => {
    return items.reduce((sum, item) => {
      const purchaseRate = purchaseRateByCode.get(item.code) || 0;
      const profit = (item.rate - purchaseRate) * item.qty;
      return sum + profit;
    }, 0);
  }, [items, purchaseRateByCode]);

  return (
    <div className="p-4 bg-neutral-50 rounded-lg">
      <div className="space-y-2">
        {items.map((item) => {
          const purchaseRate = purchaseRateByCode.get(item.code) || 0;
          const profit = (item.rate - purchaseRate) * item.qty;
          const profitPerUnit = item.rate - purchaseRate;

          return (
            <div
              key={item.id}
              className="flex items-center justify-between py-2 border-b border-neutral-200 last:border-0">
              <div className="flex-1">
                <div className="font-medium text-neutral-900">
                  {item.code} - {item.name}
                </div>
                <div className="text-sm text-neutral-600">
                  Sale: Rs. {item.rate.toFixed(2)} × {item.qty} | Purchase: Rs.{' '}
                  {purchaseRate.toFixed(2)}
                </div>
              </div>
              <div className="text-right">
                <div
                  className={`font-semibold ${
                    profit >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                  {profit >= 0 ? '+' : ''}Rs. {profit.toFixed(2)}
                </div>
                <div className="text-xs text-neutral-500">
                  Rs. {profitPerUnit.toFixed(2)}/unit
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 pt-3 border-t-2 border-neutral-300 flex items-center justify-between">
        <span className="font-semibold text-neutral-900">Total Profit:</span>
        <span
          className={`text-lg font-bold ${
            totalProfit >= 0 ? 'text-green-600' : 'text-red-600'
          }`}>
          {totalProfit >= 0 ? '+' : ''}Rs. {totalProfit.toFixed(2)}
        </span>
      </div>
    </div>
  );
}
