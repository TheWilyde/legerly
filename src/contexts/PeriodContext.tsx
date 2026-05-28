import {
  createContext,
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
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

  const refresh = useCallback(async () => {
    if (!profileId) {
      setPeriods([]);
      setActivePeriod(null);
      setSelectedPeriodId(null);
      setReopenContext(null);
      return;
    }

    const list = (await window.api?.periods?.list?.(profileId)) ?? [];
    const active =
      (await window.api?.periods?.getActive?.(profileId)) ??
      list.find((period) => period.status === 'active') ??
      null;
    const reopenCtx =
      (await window.api?.periods?.getReopenContext?.(profileId)) ?? null;

    setPeriods(list);
    setActivePeriod(active);
    setReopenContext(reopenCtx);
    setSelectedPeriodId((prev) => {
      if (prev && list.some((period) => period.id === prev)) {
        return prev;
      }
      return active?.id ?? null;
    });
  }, [profileId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    setSelectedPeriodId(null);
  }, [profileId]);

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
