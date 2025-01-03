export interface Job {
  id: string;
  clientName: string;
  address: string;
  date: string;
  time: string;
  status: 'pending' | 'in-progress' | 'completed';
  description: string;
}

export interface Invoice {
  id: string;
  jobId: string;
  clientName: string;
  date: string;
  amount: number;
  status: 'draft' | 'pending' | 'paid';
  items: InvoiceItem[];
  signatures?: {
    technician?: string;
    client?: string;
  };
  images?: string[];
}

export interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  rate: number;
  amount: number;
}

export interface TechnicianProfile {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  hourlyRate: number;
  totalHours: number;
  nextPayday: string;
}
