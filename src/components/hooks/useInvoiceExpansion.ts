import {useState, useCallback} from 'react';

type UseInvoiceExpansionOptions<T> = {
  fetchDetails: (id: number) => Promise<T | undefined> | undefined; // ✅ Allow undefined
  onExpand?: (id: number) => void;
};

export function useInvoiceExpansion<T>({
  fetchDetails,
  onExpand,
}: UseInvoiceExpansionOptions<T>) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [detailsById, setDetailsById] = useState<Record<number, T>>({});

  const toggleExpand = useCallback(
    async (id: number) => {
      const newExpandedId = expandedId === id ? null : id;
      setExpandedId(newExpandedId);

      if (newExpandedId !== null && !detailsById[newExpandedId]) {
        try {
          const result = await fetchDetails(newExpandedId); // ✅ Await the promise
          if (result) {
            setDetailsById((prev) => ({...prev, [newExpandedId]: result}));
          }
          onExpand?.(newExpandedId);
        } catch (error) {
          console.error('Failed to fetch invoice details:', error);
        }
      }
    },
    [expandedId, detailsById, fetchDetails, onExpand]
  );

  return {expandedId, detailsById, toggleExpand};
}
