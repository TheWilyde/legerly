import {useEffect, useRef, useState} from 'react';
// Force-load global ambient types (no-op import)
// This helps editors pick up src/types/electron-api.d.ts in some setups
import type {} from '../types/electron-api';

export type WorkspaceDTO = {
  id: string;
  name: string;
  path?: string;
  dirty: boolean;
  snapshot: object;
};

export function useWorkspaceStore() {
  const [workspaces, setWorkspaces] = useState<WorkspaceDTO[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const seededRef = useRef(false);

  useEffect(() => {
    const onOpened = (_: any, dto: WorkspaceDTO) => {
      setWorkspaces((prev) => {
        const i = prev.findIndex((w) => w.id === dto.id);
        if (i >= 0) {
          const next = prev.slice();
          next[i] = dto;
          return next;
        }
        return [...prev, dto];
      });
      setActiveId((prev) => prev ?? dto.id);
    };
    const onClosed = (_: any, id: string) => {
      setWorkspaces((prev) => prev.filter((w) => w.id !== id));
      setActiveId((prev) => (prev === id ? null : prev));
    };
    const onActivated = (_: any, id?: string) => {
      if (id && id !== activeId) setActiveId(id);
    };

    const off1 = (window as any).api?.events?.on?.(
      'workspace:opened',
      onOpened
    );
    const off2 = (window as any).api?.events?.on?.(
      'workspace:closed',
      onClosed
    );
    const off3 = (window as any).api?.events?.on?.(
      'workspace:activated',
      onActivated
    );

    (async () => {
      try {
        const list = await window.api?.workspaces?.list?.();
        if (Array.isArray(list) && list.length) {
          setWorkspaces(list);
          setActiveId((prev) => prev ?? list[0].id);
        }
      } catch {}
    })();

    return () => {
      off1?.();
      off2?.();
      off3?.();
    };
  }, []);

  // Seed in browser preview
  useEffect(() => {
    if (seededRef.current) return;
    const t = setTimeout(() => {
      const noIpc =
        !window.ipcRenderer || typeof window.ipcRenderer.on !== 'function';
      if (noIpc && workspaces.length === 0) {
        const seed: WorkspaceDTO[] = [
          {
            id: 'business',
            name: 'Bussiness Empire',
            dirty: false,
            snapshot: {},
          },
          {id: 'bartan', name: 'Bartan Markaz', dirty: false, snapshot: {}},
          {id: 'customers', name: 'Customers', dirty: false, snapshot: {}},
        ];
        setWorkspaces(seed);
        setActiveId(seed[0].id);
        seededRef.current = true;
      }
    }, 200);
    return () => clearTimeout(t);
  }, [workspaces.length]);

  useEffect(() => {
    // Notify main only
    window.api?.workspaces?.activate?.(activeId ?? null);
  }, [activeId]);

  return {workspaces, activeId, setActiveId};
}
