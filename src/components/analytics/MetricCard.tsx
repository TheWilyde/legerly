import type {ReactNode} from 'react';
import {
  FiTrendingUp,
  FiTrendingDown,
  FiShoppingCart,
  FiPackage,
  FiBarChart2,
  FiDollarSign,
} from 'react-icons/fi';

type Props = {
  title: string;
  value: number;
  format?: 'currency' | 'number' | 'percentage';
  trend?: 'up' | 'down' | 'neutral';
  icon?: ReactNode | string;
  subtitle?: string;
  onClick?: () => void;
};

export default function MetricCard({
  title,
  value,
  format = 'currency',
  trend,
  icon,
  subtitle,
  onClick,
}: Props) {
  const formattedValue = formatValue(value, format);
  const renderedIcon = getIconComponent(icon);

  return (
    <div
      className={`bg-white rounded-lg border border-neutral-200 p-6 hover:shadow-md transition-shadow ${onClick ? 'cursor-pointer hover:bg-neutral-50' : ''}`}
      onClick={onClick}>
      <div className="flex items-start">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-neutral-600">{title}</p>
          <p className="mt-2 text-3xl font-semibold text-neutral-900 tabular-nums">
            {formattedValue}
          </p>
          {subtitle && (
            <p className="mt-1 text-sm text-neutral-500">{subtitle}</p>
          )}
        </div>
        {renderedIcon && (
          <div className="shrink-0 ml-4 mt-1">{renderedIcon}</div>
        )}
      </div>
      {trend && (
        <div
          className={`mt-4 flex items-center gap-1 text-sm ${
            trend === 'up'
              ? 'text-green-600'
              : trend === 'down'
                ? 'text-red-600'
                : 'text-neutral-600'
          }`}>
          {trend === 'up' && <FiTrendingUp className="size-4" />}
          {trend === 'down' && <FiTrendingDown className="size-4" />}
        </div>
      )}
    </div>
  );
}

function getIconComponent(
  icon: ReactNode | string | undefined,
): ReactNode | null {
  if (!icon) return null;
  if (typeof icon !== 'string') return icon;

  const iconMap: Record<string, ReactNode> = {
    sales: <FiShoppingCart className="size-6 text-blue-600" />,
    purchases: <FiPackage className="size-6 text-green-600" />,
    stock: <FiBarChart2 className="size-6 text-purple-600" />,
    profit: <FiDollarSign className="size-6 text-green-600" />,
    revenue: <FiDollarSign className="size-6 text-blue-600" />,
  };

  return iconMap[icon.toLowerCase()] || null;
}

function formatValue(
  value: number,
  format: 'currency' | 'number' | 'percentage',
): string {
  switch (format) {
    case 'currency':
      return `Rs. ${value.toLocaleString('en-PK', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      })}`;
    case 'percentage':
      return `${value.toFixed(0)}%`;
    case 'number':
    default:
      return value.toLocaleString();
  }
}
