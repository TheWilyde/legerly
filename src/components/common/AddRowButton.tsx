import React from 'react';
import {FiPlus} from 'react-icons/fi';

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  label?: string;
};

export default function AddRowButton({
  label = 'Add Row',
  className = '',
  ...rest
}: Props) {
  return (
    <button
      type="button"
      className={`inline-flex items-center gap-2 h-9 px-3 rounded-md border border-neutral-200 hover:bg-neutral-100 text-neutral-700 ${className}`}
      {...rest}>
      <FiPlus className="size-5" />
      <span>{label}</span>
    </button>
  );
}
