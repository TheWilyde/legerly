import {useCallback} from 'react';
import type {KeyboardEvent} from 'react';

type GridSection = 'items' | 'inputs';

// Allow navigating across both <input> and <select> cells
export function useGridKey(cols: readonly string[]) {
  return useCallback(
    (e: KeyboardEvent<HTMLElement>) => {
      const t = e.currentTarget as HTMLElement;
      const section = (t.dataset.section as GridSection) ?? 'items';
      const rowIndex = String(t.dataset.rowIndex ?? '0');
      const col = (t.dataset.col as string) ?? cols[0];
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key))
        return;
      e.preventDefault();

      const focusAndSelect = (el?: HTMLElement | null) => {
        el?.focus();
        if (
          el instanceof HTMLInputElement ||
          el instanceof HTMLTextAreaElement
        ) {
          el.select();
        }
      };

      const colIndex = cols.indexOf(col);

      if (e.key === 'ArrowRight' && colIndex < cols.length - 1) {
        const nextCol = cols[colIndex + 1];
        const el = document.querySelector<HTMLElement>(
          `[data-section="${section}"][data-row-index="${rowIndex}"][data-col="${nextCol}"]`,
        );
        return focusAndSelect(
          el ??
            document.querySelector<HTMLElement>(
              `input[data-section="${section}"][data-row-index="${rowIndex}"][data-col="${nextCol}"], select[data-section="${section}"][data-row-index="${rowIndex}"][data-col="${nextCol}"]`,
            ),
        );
      }

      if (e.key === 'ArrowLeft' && colIndex > 0) {
        const prevCol = cols[colIndex - 1];
        const el = document.querySelector<HTMLElement>(
          `[data-section="${section}"][data-row-index="${rowIndex}"][data-col="${prevCol}"]`,
        );
        return focusAndSelect(
          el ??
            document.querySelector<HTMLElement>(
              `input[data-section="${section}"][data-row-index="${rowIndex}"][data-col="${prevCol}"], select[data-section="${section}"][data-row-index="${rowIndex}"][data-col="${prevCol}"]`,
            ),
        );
      }

      // Up/Down within same column across inputs/selects
      const sameCol = Array.from(
        document.querySelectorAll<HTMLElement>(
          `input[data-col="${col}"], select[data-col="${col}"]`,
        ),
      );
      const i = sameCol.indexOf(t);
      if (i === -1) return;
      if (e.key === 'ArrowDown' && i < sameCol.length - 1)
        return focusAndSelect(sameCol[i + 1]);
      if (e.key === 'ArrowUp' && i > 0) return focusAndSelect(sameCol[i - 1]);
    },
    [cols],
  );
}
