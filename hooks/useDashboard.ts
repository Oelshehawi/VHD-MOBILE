import { useState, useEffect } from 'react';
import { useAuth } from '@clerk/clerk-expo';
import { createDashboardApi } from '../services/api';
import type { DashboardData } from '../types';

export function useDashboard() {
  const { getToken } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      setError(null);
      const token = await getToken();
      const api = createDashboardApi(token);
      if (!api) throw new Error('Failed to initialize API');
      const result = await api.getData();
      setData(result);
    } catch (err) {
      console.error('Error fetching dashboard:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  return {
    data,
    loading,
    error,
    refreshDashboard: fetchDashboard,
  };
}
