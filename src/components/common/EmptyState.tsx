import React from 'react';

type Props = {
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
};

export default function EmptyState({title = 'No items', subtitle, action}: Props) {
  return (
    <div className="flex flex-col items-center justify-center p-6 text-center text-neutral-600">
      <div className="text-lg font-semibold">{title}</div>
      {subtitle && <div className="text-sm mt-1">{subtitle}</div>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
