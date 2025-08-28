import React, {forwardRef} from 'react';

type Props = React.InputHTMLAttributes<HTMLInputElement>;

const Input = forwardRef<HTMLInputElement, Props>(function Input(
  {className = '', ...rest},
  ref
) {
  return (
    <input
      ref={ref}
      className={`h-9 rounded-md border border-neutral-300 px-2 ${className}`}
      {...rest}
    />
  );
});

export default Input;
