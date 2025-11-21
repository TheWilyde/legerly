type Props = {qty: number; amount: number};

export default function InvoiceTotalsRow({qty, amount}: Props) {
  return (
    <div className="flex items-center gap-3 px-4 py-2 border-t border-neutral-200 bg-neutral-50 font-semibold text-base">
      <div className="w-8" />   {/* checkbox */}
      <div className="w-10" />  {/* S. NO */}
      <div className="w-28" />  {/* Code */}
      <div className="flex-1 text-right pr-2">Totals:</div> {/* Name column */}
      <div className="w-28 text-center tabular-nums" />     {/* Rate (blank) */}
      <div className="w-28 text-center tabular-nums">{qty}</div>        {/* Qty */}
      <div className="w-32 text-center tabular-nums">{amount.toFixed(2)}</div> {/* Amount */}
      <div className="w-6" />   {/* spacer */}
    </div>
  );
}
