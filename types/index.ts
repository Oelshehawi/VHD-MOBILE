export interface Schedule {
  id: string;
  invoiceRef: string;
  jobTitle: string;
  location: string;
  startDateTime: string;
  assignedTechnicians: string[];
  confirmed: boolean;
  hours: number;
  shifts: ShiftType[];
  payrollPeriod?: string;
  deadRun: boolean;
  canManage?: boolean;
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
  type: 'before' | 'after';
  status: 'pending' | 'uploaded';
}

export interface PhotosData {
  photos: PhotoType[];
  pendingOps: PendingOp[];
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
}

export interface ShiftType {
  technicianId: string;
  clockIn?: string;
  clockOut?: string;
  jobDetails?: string;
  hoursWorked?: number;
}

export interface TechnicianLocation {
  id: string;
  technicianId: string;
  latitude: number;
  longitude: number;
  timestamp: string;
  isActive: number;
  currentJobId: string | null;
  accuracy?: number | null;
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
