import React from 'react';
import {FiTrendingUp, FiTrendingDown} from 'react-icons/fi';

type Props = {
  title: string;
  value: number;
  format?: 'currency' | 'number' | 'percentage';
  trend?: 'up' | 'down' | 'neutral';
  icon?: React.ReactNode;
  subtitle?: string;
};

export default function MetricCard({
  title,
  value,
  format = 'currency',
  trend,
  icon,
  subtitle,
}: Props) {
  const formattedValue = formatValue(value, format);

  return (
    <div className="bg-white rounded-lg border border-neutral-200 p-6 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-neutral-600">{title}</p>
          <p className="mt-2 text-3xl font-semibold text-neutral-900">
            {formattedValue}
          </p>
          {subtitle && (
            <p className="mt-1 text-sm text-neutral-500">{subtitle}</p>
          )}
        </div>
        {icon && <div className="ml-4">{icon}</div>}
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

function formatValue(
  value: number,
  format: 'currency' | 'number' | 'percentage'
): string {
  switch (format) {
    case 'currency':
      return `Rs. ${value.toLocaleString('en-PK', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
    case 'percentage':
      return `${value.toFixed(2)}%`;
    case 'number':
    default:
      return value.toLocaleString();
  }
}
