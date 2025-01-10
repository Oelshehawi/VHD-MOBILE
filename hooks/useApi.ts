import { useState, useCallback, useEffect, useRef } from 'react';

interface ApiMethods<T> {
  getAll: () => Promise<T[]>;
}

export function useApi<T>(apiPromise: Promise<ApiMethods<T> | null>) {
  const [data, setData] = useState<T[] | null>(null);
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
            setData(result);
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
      setData(result);
    } catch (e) {
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, loading, error, fetchData };
}
