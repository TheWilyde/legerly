import {useCallback} from 'react';

export type GridSection = 'items' | 'inputs';

export function useGridKey(cols: readonly string[]) {
  return useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      const t = e.currentTarget as HTMLInputElement;
      const section = (t.dataset.section as GridSection) ?? 'items';
      const rowIndex = String(t.dataset.rowIndex ?? '0');
      const col = (t.dataset.col as string) ?? cols[0];
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key))
        return;
      e.preventDefault();

      const focusAndSelect = (el?: HTMLInputElement | null) => {
        el?.focus();
        el?.select?.();
      };

      const colIndex = cols.indexOf(col);
      if (e.key === 'ArrowRight' && colIndex < cols.length - 1) {
        const nextCol = cols[colIndex + 1];
        const el = document.querySelector<HTMLInputElement>(
          `[data-section="${section}"][data-row-index="${rowIndex}"][data-col="${nextCol}"]`
        );
        return focusAndSelect(el);
      }
      if (e.key === 'ArrowLeft' && colIndex > 0) {
        const prevCol = cols[colIndex - 1];
        const el = document.querySelector<HTMLInputElement>(
          `[data-section="${section}"][data-row-index="${rowIndex}"][data-col="${prevCol}"]`
        );
        return focusAndSelect(el);
      }

      const sameCol = Array.from(
        document.querySelectorAll<HTMLInputElement>(`input[data-col="${col}"]`)
      );
      const i = sameCol.indexOf(t);
      if (i === -1) return;
      if (e.key === 'ArrowDown' && i < sameCol.length - 1)
        return focusAndSelect(sameCol[i + 1]);
      if (e.key === 'ArrowUp' && i > 0) return focusAndSelect(sameCol[i - 1]);
    },
    [cols]
  );
}
