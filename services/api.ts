import { ScheduleType, InvoiceType, DashboardData } from '@/types';

const API_URL = __DEV__ ? 'http://10.0.2.2:3000' : 'https://vhd-psi.vercel.app';

const fetchWithTimeout = async (url: string, options: RequestInit) => {
  const timeout = 10000; // 10 seconds
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
};

export const createSchedulesApi = (token: string | null) => {
  if (!token) return null;

  return {
    getAll: async (): Promise<ScheduleType[]> => {
      const url = `${API_URL}/api/schedules`;

      try {
        const response = await fetchWithTimeout(url, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          const error = await response.text();
          console.error('❌ Schedules API Error:', error);
          throw new Error(`Failed to fetch schedules: ${error}`);
        }

        return response.json();
      } catch (error) {
        console.error('💥 Schedules API Error:', error);
        throw error;
      }
    },
  };
};

export const createInvoicesApi = (token: string | null) => {
  if (!token) return null;

  return {
    getById: async (id: string): Promise<InvoiceType> => {
      const url = `${API_URL}/api/invoices/${id}`;

      try {
        const response = await fetchWithTimeout(url, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          const error = await response.text();
          console.error('❌ Invoice API Error:', error);
          throw new Error(`Failed to fetch invoice: ${error}`);
        }

        return response.json();
      } catch (error) {
        console.error('💥 Invoice API Error:', error);
        throw error;
      }
    },
  };
};

export const createDashboardApi = (token: string | null) => {
  if (!token) return null;

  return {
    getData: async (): Promise<DashboardData> => {
      const url = `${API_URL}/api/dashboard`;

      try {
        const response = await fetchWithTimeout(url, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          const error = await response.text();
          console.error('❌ Dashboard API Error:', error);
          throw new Error(`Failed to fetch dashboard data: ${error}`);
        }

        return response.json();
      } catch (error) {
        console.error('💥 Dashboard API Error:', error);
        throw error;
      }
    },
  };
};
