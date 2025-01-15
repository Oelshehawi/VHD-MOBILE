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
  // For production or preview builds, always use PROD_URL
  if (!__DEV__) {
    console.log('VHD-INFO: Using production URL:', PROD_URL);
    return PROD_URL;
  }

  // For Expo Go development
  const isExpoGo = Constants.appOwnership === 'expo';
  if (isExpoGo) {
    console.log('VHD-INFO: Using physical device URL:', DEV_PHYSICAL_DEVICE);
    return DEV_PHYSICAL_DEVICE;
  }

  // For web development
  if (Platform.OS === 'web') {
    console.log('VHD-INFO: Using localhost URL');
    return 'http://localhost:3000';
  }

  // For Android Emulator
  if (
    Platform.OS === 'android' &&
    (Platform.constants.Model === 'sdk_gphone64_arm64' ||
      Platform.constants.Model?.includes('google_sdk'))
  ) {
    console.log('VHD-INFO: Using Android emulator URL:', DEV_ANDROID_EMULATOR);
    return DEV_ANDROID_EMULATOR;
  }

  // For all other development cases
  console.log('VHD-INFO: Using physical device URL:', DEV_PHYSICAL_DEVICE);
  return DEV_PHYSICAL_DEVICE;
};

const API_URL = getDevelopmentUrl();
console.log('VHD-INFO: Final API URL:', API_URL);

const fetchApi = async (
  url: string,
  token: string | null,
  options: RequestInit = {}
) => {
  if (!token) {
    console.error('VHD-ERROR: No token provided for API call');
    throw new Error('No token provided');
  }

  console.log('VHD-INFO: Making request to:', url);
  console.log('VHD-INFO: Request method:', options.method || 'GET');
  console.log('VHD-INFO: Request headers:', JSON.stringify(options.headers));

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
    }).catch((error) => {
      console.error('VHD-ERROR: Fetch failed:', error.message);
      console.error('VHD-ERROR: Network error details:', {
        name: error.name,
        message: error.message,
        cause: error.cause,
        url,
        method: options.method || 'GET',
      });
      throw error;
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('VHD-ERROR: API Error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
        url,
      });
      throw new Error(
        `API Error: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    let data;
    try {
      data = await response.json();
      console.log('VHD-INFO: Response received successfully');
    } catch (parseError) {
      console.error('VHD-ERROR: JSON parse error:', parseError);
      throw new Error('Invalid JSON response from server');
    }

    return data;
  } catch (error) {
    console.error('💥 API Error:', {
      error,
      url,
      method: options.method || 'GET',
    });
    throw error;
  }
};

export const createSchedulesApi = (token: string | null) => {
  if (!token) {
    console.error('❌ No token provided to createSchedulesApi');
    return null;
  }

  return {
    getAll: async (): Promise<ScheduleResponse> => {
      try {
        const data = await fetchApi(`${API_URL}/api/schedules`, token);
        return {
          schedules: data.schedules || [],
          canManage: !!data.canManage,
        };
      } catch (error) {
        console.error('❌ Error fetching schedules:', error);
        throw error;
      }
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
