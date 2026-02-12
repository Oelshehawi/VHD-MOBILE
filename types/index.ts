export interface Schedule {
  id: string;
  invoiceRef: string;
  jobTitle: string;
  location: string;
  startDateTime: string;
  actualServiceDurationMinutes?: number;
  assignedTechnicians: string[];
  confirmed: boolean;
  hours: number;
  shifts: ShiftType[];
  payrollPeriod?: string;
  deadRun: boolean;
  canManage?: boolean;
  // Site access info
  onSiteContact?: {
    name?: string;
    phone?: string;
    email?: string;
  };
  accessInstructions?: string;
}

export interface PayrollPeriod {
  id: string;
  startDate: string;
  endDate: string;
  cutoffDate: string;
  payDay: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface EmployeeHours {
  technicianName: string;
  hours: number;
}

export interface PayrollSchedule {
  id: string;
  jobTitle: string;
  date: string;
  hours: number;
  location: string;
}

export interface Client {
  id: string;
  clientName?: string;
  email?: string;
  phoneNumber?: string;
  prefix?: string;
  notes?: string;
}

export interface PhotoType {
  id: string;
  _id?: string;
  url: string;
  timestamp: string;
  technicianId: string;
  type: 'before' | 'after' | 'estimate';
  status: 'pending' | 'uploaded';
}

export interface PhotosData {
  photos: PhotoType[];
  pendingOps: any[];
}

export interface PhotoQueryResult {
  photos: string; // PowerSync returns photos as a JSON string
}

export interface SignatureType {
  id: string;
  url: string;
  timestamp: string;
  technicianId: string;
  signerName: string;
  status: 'pending' | 'uploaded';
}

export interface InvoiceType {
  id: string;
  invoiceId: string;
  jobTitle: string;
  location: string;
  dateIssued: string;
  dateDue: string;
  items: string;
  notes?: string;
  photos?: string;
  signature?: string;
  frequency?: number;
  status?: 'pending' | 'overdue' | 'paid';
  clientId?: string;
  // Payment info
  paymentMethod?: 'eft' | 'e-transfer' | 'cheque' | 'credit-card' | 'other';
  paymentDatePaid?: string;
  paymentNotes?: string;
}

export interface ShiftType {
  technicianId: string;
  clockIn?: string;
  clockOut?: string;
  jobDetails?: string;
  hoursWorked?: number;
}

export interface DashboardData {
  name: string;
  canManage: boolean;
  todaySchedules: Schedule[];
  totalHours: number;
  userId: string;
  employeeHours?: EmployeeHours[];
  currentPayroll?: PayrollPeriod;
}

export interface DashboardSchedule {
  _id: string;
  invoiceRef: string;
  jobTitle: string;
  location: string;
  startDateTime: string;
  hours: number;
  confirmed: boolean;
  technicians?: Array<{
    id: string;
    name: string;
  }>;
}

export interface CurrentPayroll {
  _id: string;
  periodStart: string;
  periodEnd: string;
  cutoffDate: string;
  payDay: string;
  totalHours: number;
  schedules: PayrollSchedule[];
}

export interface DueInvoiceType {
  _id: string;
  invoiceId: string;
  jobTitle: string;
  dateDue: Date;
  isScheduled: boolean;
  emailSent: boolean;
  clientId: string | Client;
}

export interface ScheduleResponse {
  schedules: Schedule[];
  canManage: boolean;
}

export interface AppointmentType {
  id: string;
  startTime: string;
  clientName: string;
  status?: 'confirmed' | 'pending';
}
