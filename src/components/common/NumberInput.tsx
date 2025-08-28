import React, {forwardRef} from 'react';

type Props = React.InputHTMLAttributes<HTMLInputElement> & {
  step?: string | number;
};

const NumberInput = forwardRef<HTMLInputElement, Props>(function NumberInput(
  {className = '', step = 1, ...rest},
  ref
) {
  return (
    <input
      ref={ref}
      type="number"
      step={step}
      className={`h-9 rounded-md border border-neutral-300 px-2 text-center ${className}`}
      {...rest}
    />
  );
});

export default NumberInput;
