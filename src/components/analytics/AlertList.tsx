import {FiAlertTriangle} from 'react-icons/fi';

type AlertItem = {
  code: string;
  name: string;
  inStock: number;
};

type Props = {
  items: AlertItem[];
  emptyMessage?: string;
};

export default function AlertList({
  items,
  emptyMessage = 'All items are well stocked',
}: Props) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-green-600">
        <FiAlertTriangle className="size-8 mb-2" />
        <p className="text-sm font-medium">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item, idx) => (
        <div
          key={idx}
          className={`flex items-center justify-between p-3 rounded-lg border ${
            item.inStock === 0
              ? 'bg-red-50 border-red-200'
              : item.inStock <= 5
              ? 'bg-orange-50 border-orange-200'
              : 'bg-yellow-50 border-yellow-200'
          }`}>
          <div className="flex items-center gap-3">
            <FiAlertTriangle
              className={`size-5 ${
                item.inStock === 0
                  ? 'text-red-600'
                  : item.inStock <= 5
                  ? 'text-orange-600'
                  : 'text-yellow-600'
              }`}
            />
            <div>
              <p className="text-sm font-semibold text-neutral-900">
                {item.code} - {item.name}
              </p>
              <p className="text-xs text-neutral-600">
                {item.inStock === 0
                  ? 'Out of stock'
                  : `Only ${item.inStock} left`}
              </p>
            </div>
          </div>
          <div
            className={`px-3 py-1 rounded-full text-xs font-semibold ${
              item.inStock === 0
                ? 'bg-red-600 text-white'
                : item.inStock <= 5
                ? 'bg-orange-600 text-white'
                : 'bg-yellow-600 text-white'
            }`}>
            {item.inStock}
          </div>
        </div>
      ))}
    </div>
  );
}
