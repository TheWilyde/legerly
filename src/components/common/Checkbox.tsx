import React from 'react';

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>;

export default function Checkbox(props: Props) {
  return (
    <input
      type="checkbox"
      className={`size-5 accent-neutral-800 ${props.className ?? ''}`}
      {...props}
    />
  );
}
