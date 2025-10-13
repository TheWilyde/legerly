type TopListItem = {
  name: string;
  total: number;
  count?: number;
};

type Props = {
  items: TopListItem[];
  title?: string;
  emptyMessage?: string;
};

export default function TopList({
  items,
  title,
  emptyMessage = 'No data available',
}: Props) {
  if (items.length === 0) {
    return (
      <div className="text-center py-8 text-neutral-500">{emptyMessage}</div>
    );
  }

  const maxTotal = Math.max(...items.map((item) => item.total));

  return (
    <div className="space-y-3">
      {title && (
        <h3 className="text-sm font-semibold text-neutral-700 mb-4">{title}</h3>
      )}
      {items.map((item, idx) => (
        <div key={idx} className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-neutral-900 truncate flex-1">
              {idx + 1}. {item.name}
            </span>
            <span className="font-semibold text-neutral-900 ml-2">
              Rs.{' '}
              {item.total.toLocaleString('en-PK', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </div>
          {item.count && (
            <div className="text-xs text-neutral-500">
              {item.count} invoice{item.count !== 1 ? 's' : ''}
            </div>
          )}
          {/* Progress bar */}
          <div className="h-2 bg-neutral-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all"
              style={{width: `${(item.total / maxTotal) * 100}%`}}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
