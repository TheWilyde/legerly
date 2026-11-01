import {
  createContext,
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  use,
} from 'react';
import type {ReactNode} from 'react';
import {useActiveProfile} from '../hooks/useActiveProfile';
import type {
  RendererPeriod,
  RendererPeriodReopenContext,
} from '../types/electron-api';

type CloseActivePeriodPayload = {
  periodId?: number;
  startDate?: string;
  endDate?: string;
  label?: string;
};

type PeriodContextValue = {
  periods: RendererPeriod[];
  activePeriod: RendererPeriod | null;
  selectedPeriod: RendererPeriod | null;
  editingPeriod: RendererPeriod | null;
  reopenReturnPeriod: RendererPeriod | null;
  isViewingHistorical: boolean;
  selectPeriod: (periodId: number | null) => void;
  setEditingPeriod: (periodId: number | null) => void;
  resetToActive: () => void;
  refresh: () => Promise<void>;
  closeActivePeriod: (payload: CloseActivePeriodPayload) => Promise<void>;
  closeReopenedPeriod: () => Promise<void>;
  reopenPeriod: (periodId: number) => Promise<void>;
  deletePeriod: (periodId: number) => Promise<void>;
};

const PeriodContext = createContext<PeriodContextValue | undefined>(undefined);

export function PeriodProvider({children}: {children: ReactNode}) {
  const profileId = useActiveProfile();
  const [periods, setPeriods] = useState<RendererPeriod[]>([]);
  const [activePeriod, setActivePeriod] = useState<RendererPeriod | null>(null);
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null);
  const [editingPeriodId, setEditingPeriodId] = useState<number | null>(null);
  const [reopenContext, setReopenContext] =
    useState<RendererPeriodReopenContext | null>(null);
  const refreshSequence = useRef(0);
  const loadedProfileId = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    const sequence = ++refreshSequence.current;
    const requestedProfileId = profileId;

    if (!requestedProfileId) {
      loadedProfileId.current = null;
      setPeriods([]);
      setActivePeriod(null);
      setSelectedPeriodId(null);
      setEditingPeriodId(null);
      setReopenContext(null);
      return;
    }

    const [listResult, activeResult, reopenContextResult] = await Promise.all([
      window.api?.periods?.list?.(requestedProfileId),
      window.api?.periods?.getActive?.(requestedProfileId),
      window.api?.periods?.getReopenContext?.(requestedProfileId),
    ]);

    // A profile switch or a newer refresh can finish while these IPC requests
    // are in flight. Never let that stale response replace the current
    // profile's period selection.
    if (sequence !== refreshSequence.current) return;

    const list = listResult ?? [];
    const active =
      activeResult ??
      list.find((period) => period.status === 'active') ??
      null;
    const reopenCtx = reopenContextResult ?? null;
    const profileChanged = loadedProfileId.current !== requestedProfileId;

    setPeriods(list);
    setActivePeriod(active);
    setReopenContext(reopenCtx);
    setSelectedPeriodId((prev) => {
      if (
        !profileChanged &&
        prev &&
        list.some((period) => period.id === prev)
      ) {
        return prev;
      }
      return active?.id ?? null;
    });
    setEditingPeriodId((prev) =>
      !profileChanged && prev && list.some((period) => period.id === prev)
        ? prev
        : null,
    );
    loadedProfileId.current = requestedProfileId;
  }, [profileId]);

  useEffect(() => {
    // Invalidate requests for the previous profile immediately. Period IDs are
    // local to each profile database and commonly overlap, so retaining an ID
    // can otherwise select a closed period in the newly active profile.
    refreshSequence.current += 1;
    loadedProfileId.current = null;
    setPeriods([]);
    setActivePeriod(null);
    setSelectedPeriodId(null);
    setEditingPeriodId(null);
    setReopenContext(null);
  }, [profileId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onPeriodChanged = useEffectEvent(() => {
    void refresh();
  });

  useEffect(() => {
    window.addEventListener('period:changed', onPeriodChanged);
    return () => {
      window.removeEventListener('period:changed', onPeriodChanged);
    };
  }, []);

  const selectedPeriod = useMemo(
    () => periods.find((period) => period.id === selectedPeriodId) ?? null,
    [periods, selectedPeriodId],
  );

  const editingPeriod = useMemo(
    () => periods.find((period) => period.id === editingPeriodId) ?? null,
    [periods, editingPeriodId],
  );

  const reopenReturnPeriod = useMemo(() => {
    if (!reopenContext || !activePeriod) return null;
    if (reopenContext.activePeriodId !== activePeriod.id) return null;
    return (
      periods.find((period) => period.id === reopenContext.returnPeriodId) ??
      null
    );
  }, [reopenContext, activePeriod, periods]);

  const selectPeriod = useCallback((periodId: number | null) => {
    setSelectedPeriodId(periodId);
  }, []);

  const setEditingPeriod = useCallback((periodId: number | null) => {
    setEditingPeriodId(periodId);
  }, []);

  const resetToActive = useCallback(() => {
    setSelectedPeriodId(activePeriod?.id ?? null);
  }, [activePeriod]);

  const closeActivePeriod = useCallback(
    async (payload: CloseActivePeriodPayload) => {
      if (!profileId) return;
      const targetPeriodId =
        payload.periodId ?? selectedPeriod?.id ?? activePeriod?.id;
      if (!targetPeriodId) return;
      const result = await window.api.periods.close(profileId, {
        periodId: targetPeriodId,
        ...payload,
      });
      await refresh();
      setSelectedPeriodId(result.activePeriod?.id ?? result.closedPeriod.id);
      window.dispatchEvent(new CustomEvent('period:changed'));
      window.dispatchEvent(new CustomEvent('invoice:changed'));
      window.dispatchEvent(new CustomEvent('stock:changed'));
      window.dispatchEvent(new CustomEvent('analytics:invalidate'));
    },
    [profileId, activePeriod, refresh, selectedPeriod],
  );

  const closeReopenedPeriod = useCallback(async () => {
    if (!profileId) return;
    const result = await window.api.periods.closeReopened(profileId);
    await refresh();
    setSelectedPeriodId(result.activePeriod.id);
    window.dispatchEvent(new CustomEvent('period:changed'));
    window.dispatchEvent(new CustomEvent('invoice:changed'));
    window.dispatchEvent(new CustomEvent('stock:changed'));
    window.dispatchEvent(new CustomEvent('analytics:invalidate'));
  }, [profileId, refresh]);

  const reopenPeriod = useCallback(
    async (periodId: number) => {
      if (!profileId) return;
      const period = await window.api.periods.reopen(profileId, periodId);
      await refresh();
      setSelectedPeriodId(period.id);
      window.dispatchEvent(new CustomEvent('period:changed'));
      window.dispatchEvent(new CustomEvent('invoice:changed'));
      window.dispatchEvent(new CustomEvent('stock:changed'));
      window.dispatchEvent(new CustomEvent('analytics:invalidate'));
    },
    [profileId, refresh],
  );

  const deletePeriod = useCallback(
    async (periodId: number) => {
      if (!profileId) return;
      await window.api.periods.delete(profileId, periodId);
      await refresh();
      setSelectedPeriodId(activePeriod?.id ?? null);
      window.dispatchEvent(new CustomEvent('period:changed'));
      window.dispatchEvent(new CustomEvent('stock:changed'));
      window.dispatchEvent(new CustomEvent('analytics:invalidate'));
    },
    [profileId, activePeriod, refresh],
  );

  const value = useMemo<PeriodContextValue>(
    () => ({
      periods,
      activePeriod,
      selectedPeriod: selectedPeriod ?? activePeriod,
      editingPeriod: editingPeriod ?? null,
      reopenReturnPeriod,
      isViewingHistorical:
        (selectedPeriod ?? activePeriod)?.status === 'closed',
      selectPeriod,
      setEditingPeriod,
      resetToActive,
      refresh,
      closeActivePeriod,
      closeReopenedPeriod,
      reopenPeriod,
      deletePeriod,
    }),
    [
      periods,
      activePeriod,
      selectedPeriod,
      editingPeriod,
      reopenReturnPeriod,
      selectPeriod,
      setEditingPeriod,
      resetToActive,
      refresh,
      closeActivePeriod,
      closeReopenedPeriod,
      reopenPeriod,
      deletePeriod,
    ],
  );

  return <PeriodContext value={value}>{children}</PeriodContext>;
}

export function usePeriod() {
  const context = use(PeriodContext);
  if (!context) {
    throw new Error('usePeriod must be used within PeriodProvider');
  }
  return context;
}
