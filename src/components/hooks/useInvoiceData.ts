import {useEffect, useState, useCallback} from 'react';

// ✅ Remove BaseInvoice constraint - make it fully generic
type UseInvoiceDataOptions<T> = {
  fetchInvoices: () => Promise<T[] | undefined> | undefined;
  sortInvoices?: (a: T, b: T) => number;
};

export function useInvoiceData<T>({
  // ✅ No constraint
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

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onChanged = () => load();
    window.addEventListener('workspace:active-changed', onChanged as any);
    return () =>
      window.removeEventListener('workspace:active-changed', onChanged as any);
  }, [load]);

  return {invoices, loading, reload: load};
}
