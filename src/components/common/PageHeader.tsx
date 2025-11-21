import React from 'react';

type Props = {
  title: string;
  children?: React.ReactNode;
  subtitle?: string;
};

export default function PageHeader({title, subtitle, children}: Props) {
  return (
    <div className="mb-6 w-full">
      <div className="flex w-full items-center rounded-lg bg-white px-4 py-3 border border-neutral-200 shadow-sm">
        <div className="flex-1 min-w-0 text-left">
          <h1 className="text-xl font-semibold text-neutral-900 leading-tight truncate">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-0.5 text-xs font-medium text-neutral-500 truncate">
              {subtitle}
            </p>
          )}
        </div>
        {children && (
          <div className="flex items-center gap-2 justify-end">{children}</div>
        )}
      </div>
    </div>
  );
}
