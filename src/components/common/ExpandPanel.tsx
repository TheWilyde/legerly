import React from 'react';

type Props = {
  header: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
};

export default function ExpandPanel({header, expanded, onToggle, children}: Props) {
  return (
    <div className="rounded-md border border-neutral-200 bg-white">
      <button type="button" className="w-full flex items-center justify-between px-3 py-2" onClick={onToggle}>
        <div>{header}</div>
        <span className={`transition-transform ${expanded ? 'rotate-180' : ''}`}>⌄</span>
      </button>
      {expanded && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}
