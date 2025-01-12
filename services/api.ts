import { ScheduleType, InvoiceType, DashboardData } from '@/types';

const API_URL = __DEV__ ? 'http://10.0.2.2:3000' : 'https://vhd-psi.vercel.app';

const fetchApi = async (
  url: string,
  token: string | null,
  options: RequestInit = {}
) => {
  if (!token) throw new Error('No token provided');

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error);
    }

    return response.json();
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
};

export const createSchedulesApi = (token: string | null) => {
  if (!token) return null;

  return {
    getAll: async (): Promise<ScheduleType[]> => {
      return fetchApi(`${API_URL}/api/schedules`, token);
    },
  };
};

export const createInvoicesApi = (token: string | null) => {
  if (!token) return null;

  return {
    getById: async (id: string): Promise<InvoiceType> => {
      return fetchApi(`${API_URL}/api/invoices/${id}`, token);
    },
  };
};

export const createDashboardApi = (token: string | null) => {
  if (!token) return null;

  return {
    getData: async (): Promise<DashboardData> => {
      return fetchApi(`${API_URL}/api/dashboard`, token);
    },
  };
};
