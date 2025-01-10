import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@clerk/clerk-expo';
import { createDashboardApi } from '../services/api';
import type { DashboardData } from '../types';

export function useDashboard() {
  const { getToken } = useAuth();
  const [token, setToken] = useState<string | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [lastFetch, setLastFetch] = useState(0);

  useEffect(() => {
    let mounted = true;
    const fetchToken = async () => {
      try {
        const newToken = await getToken();
        if (mounted) {
          setToken(newToken);
        }
      } catch (err) {
        console.error('Error fetching token:', err);
        if (mounted) {
          setError(err as Error);
        }
      }
    };
    fetchToken();
    return () => {
      mounted = false;
    };
  }, [getToken]);

  const dashboardApi = token ? createDashboardApi(token) : null;

  const fetchData = useCallback(async () => {
    if (!dashboardApi) return;

    // Prevent fetching more often than every 30 seconds
    const now = Date.now();
    if (now - lastFetch < 30000) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await dashboardApi.getData();
      setData(result);
      setLastFetch(now);
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [dashboardApi, lastFetch]);

  useEffect(() => {
    let mounted = true;
    if (token && mounted) {
      fetchData();
    }
    return () => {
      mounted = false;
    };
  }, [token, fetchData]);

  return {
    data,
    loading,
    error,
    refreshDashboard: fetchData,
  };
}
