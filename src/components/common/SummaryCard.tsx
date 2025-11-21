type Props = {
  cardTitle: string;
  cardValue: number;
  format?: 'currency' | 'number';
  profitLossIndicator?: boolean;
};

function formatNumber(value: number, locale: string) {
  try {
    return new Intl.NumberFormat(locale).format(value);
  } catch {
    return value.toString();
  }
}

function formatCurrency(value: number, locale: string, currency: string) {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    // Fallback manual
    return `Rs. ${value.toFixed(2)}`;
  }
}

export default function SummaryCard({
  cardTitle,
  cardValue,
  format = 'currency',
  profitLossIndicator = false,
}: Props) {
  // Valid locale: en-PK (NOT en-PKR)
  const locale = 'en-PK';
  const formattedValue =
    format === 'number'
      ? formatNumber(cardValue, locale)
      : formatCurrency(cardValue, locale, 'PKR');

  const valueColor = profitLossIndicator
    ? cardValue >= 0
      ? 'text-green-600'
      : 'text-red-600'
    : 'text-neutral-900';

  return (
    <div className="p-4 rounded-md bg-white border border-neutral-200">
      <p className="text-xs font-medium text-neutral-500">{cardTitle}</p>
      <p className={`text-2xl font-bold tabular-nums ${valueColor}`}>
        {formattedValue}
      </p>
      {profitLossIndicator && (
        <div className="mt-2 text-xs text-neutral-500">
          {cardValue >= 0 ? '↑ Profit' : '↓ Loss'}
        </div>
      )}
    </div>
  );
}
