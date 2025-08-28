import {useMemo, useState} from 'react';

export function useSelection(allIds: number[]) {
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const allSelected = allIds.length > 0 && selected.size === allIds.length;
  const selectedArray = useMemo(() => Array.from(selected), [selected]);

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === allIds.length ? new Set() : new Set(allIds)
    );
  }

  function clear() {
    setSelected(new Set());
  }

  return {selected, allSelected, selectedArray, toggle, toggleAll, clear};
}
