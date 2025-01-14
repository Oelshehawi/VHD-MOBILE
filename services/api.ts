import {
  ScheduleType,
  InvoiceType,
  DashboardData,
  ScheduleResponse,
  PhotoType,
  SignatureType,
} from '@/types';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Development URLs for different environments
const DEV_ANDROID_EMULATOR = 'http://10.0.2.2:3000';
const DEV_IOS_SIMULATOR = 'http://localhost:3000';
const DEV_PHYSICAL_DEVICE = 'http://192.168.1.128:3000';
const PROD_URL = 'https://vhd-psi.vercel.app';

// Choose the appropriate URL based on environment and platform
const getDevelopmentUrl = () => {
  // Check if running in Expo development client
  const isExpoGo = Constants.appOwnership === 'expo';
  if (isExpoGo) {
    return DEV_PHYSICAL_DEVICE;
  }

  if (Platform.OS === 'android') {
    // Check if running in Android Emulator
    if (
      Platform.constants.Model === 'sdk_gphone64_arm64' ||
      Platform.constants.Model?.includes('google_sdk')
    ) {
      return DEV_ANDROID_EMULATOR;
    }
  }

  // For all other cases (physical devices, iOS simulator)
  return DEV_PHYSICAL_DEVICE;
};

const API_URL = __DEV__ ? getDevelopmentUrl() : PROD_URL;

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
        Authorization: `Bearer ${token}`,
        'Content-Type':
          options.body instanceof FormData
            ? 'multipart/form-data'
            : 'application/json',
        ...options.headers,
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
    getAll: async (): Promise<ScheduleResponse> => {
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
    uploadPhotos: async (
      images: string[],
      type: 'before' | 'after',
      technicianId: string,
      jobTitle: string,
      invoiceId?: string
    ): Promise<{ message: string; type: string; data: PhotoType[] }> => {
      return fetchApi(`${API_URL}/api/upload`, token, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          images,
          type,
          technicianId,
          jobTitle,
          invoiceId,
        }),
      });
    },
    uploadSignature: async (
      image: string,
      technicianId: string,
      signerName: string,
      jobTitle: string,
      invoiceId?: string
    ): Promise<{ message: string; type: string; data: SignatureType }> => {
      return fetchApi(`${API_URL}/api/upload`, token, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          images: [image],
          type: 'signature',
          technicianId,
          signerName,
          jobTitle,
          invoiceId,
        }),
      });
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
