import {useEffect, useState, useCallback, useRef} from 'react';

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

  // ✅ Use ref to store latest functions without causing re-renders
  const fetchRef = useRef(fetchInvoices);
  const sortRef = useRef(sortInvoices);

  useEffect(() => {
    fetchRef.current = fetchInvoices;
    sortRef.current = sortInvoices;
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchRef.current();
      const data = result || [];
      const sorted = sortRef.current ? [...data].sort(sortRef.current) : data;
      setInvoices(sorted);
    } catch (error) {
      console.error('Failed to load data:', error);
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  }, []); // ✅ Empty deps - stable reference

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onChanged = () => load();
    window.addEventListener('profile:switched', onChanged as any);
    window.addEventListener('workspace:active-changed', onChanged as any);
    window.addEventListener('invoice:changed', onChanged as any);
    return () => {
      window.removeEventListener('profile:switched', onChanged as any);
      window.removeEventListener('workspace:active-changed', onChanged as any);
      window.removeEventListener('invoice:changed', onChanged as any);
    };
  }, [load]);

  return {invoices, loading, reload: load};
}
