import {useEffect, useState, useCallback, useEffectEvent} from 'react';

type UseInvoiceDataOptions<T> = {
  fetchInvoices: () => Promise<T[] | undefined> | undefined;
  sortInvoices?: (a: T, b: T) => number;
};

export function useInvoiceData<T>({
  fetchInvoices,
  sortInvoices,
}: UseInvoiceDataOptions<T>) {
  const [invoices, setInvoices] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchInvoices();
      const data = result || [];
      const sorted = sortInvoices ? [...data].sort(sortInvoices) : data;
      setInvoices(sorted);
    } catch (error) {
      console.error('Failed to load data:', error);
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  }, [fetchInvoices, sortInvoices]);

  const onInvoiceChanged = useEffectEvent(() => {
    void load();
  });

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onChanged = () => {
      onInvoiceChanged();
    };

    window.addEventListener('profile:switched', onChanged);
    window.addEventListener('workspace:active-changed', onChanged);
    window.addEventListener('invoice:changed', onChanged);

    return () => {
      window.removeEventListener('profile:switched', onChanged);
      window.removeEventListener('workspace:active-changed', onChanged);
      window.removeEventListener('invoice:changed', onChanged);
    };
  }, []);

  return {invoices, loading, reload: load};
}
