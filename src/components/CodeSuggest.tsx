import React from 'react';

type Props = {
  value: string;
  options: string[];
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onPick: (code: string) => void;
  inputProps?: React.InputHTMLAttributes<HTMLInputElement>;
};

export default function CodeSuggest({
  value,
  options,
  open,
  onOpen,
  onClose,
  onPick,
  inputProps,
}: Props) {
  const filtered = React.useMemo(() => {
    const q = value.trim().toLowerCase();
    return options
      .filter((c) => (q ? c.toLowerCase().includes(q) : true))
      .slice(0, 10);
  }, [value, options]);

  return (
    <div className="relative">
      <input
        {...inputProps}
        value={value}
        onFocus={(e) => {
          inputProps?.onFocus?.(e);
          onOpen();
        }}
        onBlur={(e) => {
          inputProps?.onBlur?.(e);
          setTimeout(onClose, 100);
        }}
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border border-neutral-200 bg-white shadow">
          {filtered.map((code) => (
            <li
              key={code}
              className="px-2 py-1 hover:bg-neutral-100 cursor-pointer"
              onMouseDown={(e) => {
                e.preventDefault();
                onPick(code);
              }}>
              {code}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
