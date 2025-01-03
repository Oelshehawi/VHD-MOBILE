import { Job, Invoice, TechnicianProfile } from '@/types';

export const mockJobs: Job[] = [
  {
    id: '1',
    clientName: 'John Doe',
    address: '123 Main St, City, State',
    date: '2024-03-20',
    time: '09:00',
    status: 'pending',
    description: 'HVAC maintenance and filter replacement',
  },
  // Add more mock jobs...
];

export const mockInvoices: Invoice[] = [
  {
    id: '1',
    jobId: '1',
    clientName: 'John Doe',
    date: '2024-03-20',
    amount: 250.0,
    status: 'pending',
    items: [
      {
        id: '1',
        description: 'HVAC Service',
        quantity: 1,
        rate: 150.0,
        amount: 150.0,
      },
      {
        id: '2',
        description: 'Replacement Filter',
        quantity: 1,
        rate: 100.0,
        amount: 100.0,
      },
    ],
  },
  // Add more mock invoices...
];

export const mockProfile: TechnicianProfile = {
  id: '1',
  name: 'Mike Smith',
  email: 'mike.smith@example.com',
  phone: '(555) 123-4567',
  role: 'Senior Technician',
  hourlyRate: 45.0,
  totalHours: 156,
  nextPayday: '2024-03-30',
};
