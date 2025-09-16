type Props = {
  items: RendererInvoiceItem[];
  purchaseRateByCode: Map<string, number>;
};

export default function ItemsSummaryProfit({items, purchaseRateByCode}: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-neutral-600 border-b border-neutral-200">
            <th className="p-2 w-24">Code</th>
            <th className="p-2">Item</th>
            <th className="p-2 w-28 text-right">Purchase Rate</th>
            <th className="p-2 w-24 text-right">Sale Rate</th>
            <th className="p-2 w-16 text-center">Qty</th>
            <th className="p-2 w-24 text-right">Total</th>
            <th className="p-2 w-24 text-right">Profit</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => {
            const purchase = toNum(purchaseRateByCode.get(it.code));
            const sale = toNum(it.rate);
            const qty = toNum(it.qty);
            const total = sale * qty;
            const profit = (sale - purchase) * qty;
            return (
              <tr
                key={it.id}
                className="border-b border-neutral-200 last:border-b-0">
                <td className="p-2 tabular-nums">{it.code}</td>
                <td className="p-2">{it.name}</td>
                <td className="p-2 text-right tabular-nums">
                  {toAmount(purchase)}
                </td>
                <td className="p-2 text-right tabular-nums">
                  {toAmount(sale)}
                </td>
                <td className="p-2 text-center tabular-nums">{qty}</td>
                <td className="p-2 text-right tabular-nums">
                  {toAmount(total)}
                </td>
                <td className="p-2 text-right tabular-nums">
                  {toAmount(profit)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function toNum(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function toAmount(n: number) {
  return toNum(n).toFixed(2);
}
