import { useState, useCallback, useEffect, useRef } from 'react';
import { ScheduleResponse } from '../types';

interface ApiMethods<T> {
  getAll: () => Promise<T>;
}

interface UseApiResult<T> {
  data: T extends ScheduleResponse ? T['schedules'] : T | null;
  canManage?: boolean;
  loading: boolean;
  error: Error | null;
  fetchData: () => Promise<void>;
}

export function useApi<T>(
  apiPromise: Promise<ApiMethods<T> | null>
): UseApiResult<T> {
  const [data, setData] = useState<
    T extends ScheduleResponse ? T['schedules'] : T | null
  >([] as unknown as T extends ScheduleResponse ? T['schedules'] : T | null);
  const [canManage, setCanManage] = useState<boolean>(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const apiRef = useRef<ApiMethods<T> | null>(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    const initApi = async () => {
      if (fetchedRef.current) return;

      try {
        const api = await apiPromise;
        if (!mounted) return;

        apiRef.current = api;
        if (api) {
          setLoading(true);
          const result = await api.getAll();
          if (mounted) {
            if (isScheduleResponse(result)) {
              setData(result.schedules as any);
              setCanManage(result.canManage);
            } else {
              setData(result as any);
            }
            fetchedRef.current = true;
          }
        }
      } catch (e) {
        if (mounted) setError(e as Error);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    initApi();
    return () => {
      mounted = false;
    };
  }, [apiPromise]);

  const fetchData = useCallback(async () => {
    if (!apiRef.current) return;

    setLoading(true);
    setError(null);
    try {
      const result = await apiRef.current.getAll();
      if (isScheduleResponse(result)) {
        setData(result.schedules as any);
        setCanManage(result.canManage);
      } else {
        setData(result as any);
      }
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, canManage, loading, error, fetchData };
}

function isScheduleResponse(value: any): value is ScheduleResponse {
  return (
    value &&
    typeof value === 'object' &&
    Array.isArray(value.schedules) &&
    typeof value.canManage === 'boolean'
  );
}
