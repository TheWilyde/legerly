type Props = {
  cardTitle: string;
  cardValue: number;
  profitLossIndicator?: boolean;
};

export default function SummaryCard({
  cardTitle,
  cardValue,
  profitLossIndicator,
}: Props) {
  /*If profitLossIndicator is true then it checks the cardValue. If cardValue is true is turns green
   showing profit and turns red showing loss if cardValue is false. If profitLossIndicator is false
   it does nothing. */
  const indicatorClass = profitLossIndicator
    ? cardValue > 0
      ? 'text-emerald-600'
      : cardValue < 0
      ? 'text-red-600'
      : ''
    : '';

  return (
    <>
      <div className="bg-white rounded-md border border-neutral-200 p-3">
        <div className="text-sm text-neutral-500">{cardTitle}</div>
        <div className={`text-xl font-semibold tabular-nums ${indicatorClass}`}>
          {formatPKR(cardValue)}
        </div>
      </div>
    </>
  );
}

function formatPKR(n: number) {
  return new Intl.NumberFormat('en-PK', {
    style: 'currency',
    currency: 'PKR',
    minimumFractionDigits: 2,
  }).format(Number(n) || 0);
}
