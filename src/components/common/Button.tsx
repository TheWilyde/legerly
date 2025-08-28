import React from 'react';

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'primary' | 'danger' | 'ghost';
};

export default function Button({
  variant = 'default',
  className = '',
  children,
  ...rest
}: ButtonProps) {
  const base = 'inline-flex items-center gap-2 h-9 px-3 rounded-md';
  const variants: Record<string, string> = {
    default: 'border border-neutral-200 hover:bg-neutral-100',
    primary: 'bg-neutral-900 text-white hover:bg-neutral-800',
    danger: 'border border-red-200 text-red-700 hover:bg-red-50',
    ghost: 'text-neutral-700 hover:bg-neutral-100',
  };
  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
}
