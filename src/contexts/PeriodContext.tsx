import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {useActiveProfile} from '../hooks/useActiveProfile';
import type {RendererPeriod} from '../types/electron-api';

type CloseActivePeriodPayload = {
  nextPeriodId?: number;
  nextPeriod?: {
    label?: string;
    startDate: string;
    endDate: string;
  };
};

type PeriodContextValue = {
  periods: RendererPeriod[];
  activePeriod: RendererPeriod | null;
  selectedPeriod: RendererPeriod | null;
  isViewingHistorical: boolean;
  selectPeriod: (periodId: number | null) => void;
  resetToActive: () => void;
  refresh: () => Promise<void>;
  closeActivePeriod: (payload: CloseActivePeriodPayload) => Promise<void>;
  reopenPeriod: (periodId: number) => Promise<void>;
};

const PeriodContext = createContext<PeriodContextValue | undefined>(undefined);

export function PeriodProvider({children}: {children: React.ReactNode}) {
  const profileId = useActiveProfile();
  const [periods, setPeriods] = useState<RendererPeriod[]>([]);
  const [activePeriod, setActivePeriod] = useState<RendererPeriod | null>(null);
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    if (!profileId) {
      setPeriods([]);
      setActivePeriod(null);
      setSelectedPeriodId(null);
      return;
    }

    const list = (await window.api?.periods?.list?.(profileId)) ?? [];
    const active =
      (await window.api?.periods?.getActive?.(profileId)) ??
      list.find((period) => period.status === 'active') ??
      null;

    setPeriods(list);
    setActivePeriod(active);
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

  useEffect(() => {
    const handlePeriodChanged = () => {
      void refresh();
    };

    window.addEventListener('period:changed', handlePeriodChanged);
    return () => {
      window.removeEventListener('period:changed', handlePeriodChanged);
    };
  }, [refresh]);

  const selectedPeriod = useMemo(
    () => periods.find((period) => period.id === selectedPeriodId) ?? null,
    [periods, selectedPeriodId],
  );

  const selectPeriod = useCallback((periodId: number | null) => {
    setSelectedPeriodId(periodId);
  }, []);

  const resetToActive = useCallback(() => {
    setSelectedPeriodId(activePeriod?.id ?? null);
  }, [activePeriod]);

  const closeActivePeriod = useCallback(
    async (payload: CloseActivePeriodPayload) => {
      if (!profileId || !activePeriod) return;
      const result = await window.api.periods.close(profileId, {
        periodId: activePeriod.id,
        ...payload,
      });
      await refresh();
      setSelectedPeriodId(result.activePeriod.id);
      window.dispatchEvent(new CustomEvent('period:changed'));
      window.dispatchEvent(new CustomEvent('invoice:changed'));
      window.dispatchEvent(new CustomEvent('stock:changed'));
      window.dispatchEvent(new CustomEvent('analytics:invalidate'));
    },
    [profileId, activePeriod, refresh],
  );

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
      isViewingHistorical:
        (selectedPeriod ?? activePeriod)?.status === 'closed',
      selectPeriod,
      resetToActive,
      refresh,
      closeActivePeriod,
      reopenPeriod,
    }),
    [
      periods,
      activePeriod,
      selectedPeriod,
      selectPeriod,
      resetToActive,
      refresh,
      closeActivePeriod,
      reopenPeriod,
    ],
  );

  return (
    <PeriodContext.Provider value={value}>{children}</PeriodContext.Provider>
  );
}

export function usePeriod() {
  const context = useContext(PeriodContext);
  if (!context) {
    throw new Error('usePeriod must be used within PeriodProvider');
  }
  return context;
}
