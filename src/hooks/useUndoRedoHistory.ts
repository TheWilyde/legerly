import {useCallback, useRef, useState} from 'react';

type UseUndoRedoHistoryOptions = {
  limit?: number;
};

function cloneSnapshot<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

export function useUndoRedoHistory<T>(options?: UseUndoRedoHistoryOptions) {
  const limit = options?.limit ?? 100;
  const pastRef = useRef<T[]>([]);
  const futureRef = useRef<T[]>([]);
  const [, setRevision] = useState(0);

  const refresh = useCallback(() => {
    setRevision((v) => v + 1);
  }, []);

  const record = useCallback(
    (snapshot: T) => {
      pastRef.current.push(cloneSnapshot(snapshot));
      if (pastRef.current.length > limit) {
        pastRef.current.shift();
      }

      futureRef.current = [];
      refresh();
    },
    [limit, refresh],
  );

  const clear = useCallback(() => {
    pastRef.current = [];
    futureRef.current = [];
    refresh();
  }, [refresh]);

  const undo = useCallback(
    (currentSnapshot: T): T | null => {
      const previous = pastRef.current.pop();
      if (!previous) return null;

      futureRef.current.push(cloneSnapshot(currentSnapshot));
      refresh();
      return cloneSnapshot(previous);
    },
    [refresh],
  );

  const redo = useCallback(
    (currentSnapshot: T): T | null => {
      const next = futureRef.current.pop();
      if (!next) return null;

      pastRef.current.push(cloneSnapshot(currentSnapshot));
      refresh();
      return cloneSnapshot(next);
    },
    [refresh],
  );

  const canUndo = pastRef.current.length > 0;
  const canRedo = futureRef.current.length > 0;

  return {
    record,
    undo,
    redo,
    clear,
    canUndo,
    canRedo,
  };
}
