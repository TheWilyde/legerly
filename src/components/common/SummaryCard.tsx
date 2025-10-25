type Props = {
  cardTitle: string;
  cardValue: number;
  format?: 'currency' | 'number';
  profitLossIndicator?: boolean; // ✅ Add this prop
};

export default function SummaryCard({
  cardTitle,
  cardValue,
  format = 'currency',
  profitLossIndicator = false, // ✅ Add this prop with default
}: Props) {
  const formattedValue =
    format === 'number'
      ? cardValue.toLocaleString('en-PK')
      : `Rs. ${cardValue.toLocaleString('en-PK', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`;

  // ✅ Determine color based on profit/loss indicator
  const valueColor = profitLossIndicator
    ? cardValue >= 0
      ? 'text-green-600' // Profit (positive)
      : 'text-red-600' // Loss (negative)
    : 'text-neutral-900'; // Default color

  return (
    <div className="bg-white rounded-lg border border-neutral-200 p-4">
      <h3 className="text-sm font-medium text-neutral-600 mb-2">
        {cardTitle}
      </h3>
      <p className={`text-2xl font-bold ${valueColor}`}>{formattedValue}</p>
      {/* ✅ Optional: Add a visual indicator */}
      {profitLossIndicator && (
        <div className="mt-2 text-xs text-neutral-500">
          {cardValue >= 0 ? '↑ Profit' : '↓ Loss'}
        </div>
      )}
    </div>
  );
}
