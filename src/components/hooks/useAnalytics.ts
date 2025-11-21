import {useEffect, useState} from 'react';
import {useActiveProfile} from '../../hooks/useActiveProfile';
import {api} from '../../utils/electronApi';

export function useAnalytics() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const profileId = useActiveProfile();

  useEffect(() => {
    (async () => {
      if (!profileId) return;
      try {
        setLoading(true);
        setError(null);
        const [purchases, sales, stock] = await Promise.all([
          api.invoices.list(profileId),
          api.saleInvoices.list(profileId),
          api.stock.list(profileId),
        ]);
        setData({purchases, sales, stock});
      } catch (err: any) {
        setError(err?.message || 'Failed to load analytics');
      } finally {
        setLoading(false);
      }
    })();
  }, [profileId]);

  return {loading, error, data};
}