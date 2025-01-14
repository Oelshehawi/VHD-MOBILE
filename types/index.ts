export interface DashboardSchedule {
  _id: string;
  jobTitle: string;
  location: string;
  startDateTime: Date;
  hours: number;
  confirmed: boolean;
  technicians?: Array<{
    id: string;
    name: string;
  }>;
}

export interface EmployeeHours {
  userId: string;
  name: string;
  hours: number;
}

export interface PayrollSchedule {
  _id: string;
  jobTitle: string;
  date: Date;
  hours: number;
  location: string;
}

export interface CurrentPayroll {
  periodStart: Date;
  periodEnd: Date;
  cutoffDate: Date;
  payDay: Date;
  totalHours: number;
  schedules: PayrollSchedule[];
}

export interface DashboardData {
  name: string;
  canManage: boolean;
  todaySchedules: DashboardSchedule[];
  totalHours: number;
  userId: string;
  employeeHours?: EmployeeHours[];
  currentPayroll?: CurrentPayroll;
}

export interface ClientType {
  _id: string;
  clientName?: string;
  email?: string;
  phoneNumber?: string;
  prefix?: string;
  notes?: string;
}

export interface PhotoType {
  url: string;
  timestamp: Date;
  technicianId: string;
}

export interface SignatureType {
  url: string;
  timestamp: Date;
  signerName: string;
  technicianId: string;
}

export interface InvoiceType {
  _id: string;
  invoiceId: string;
  jobTitle: string;
  dateIssued: Date;
  dateDue: Date;
  items: Array<{
    description: string;
    price: number;
  }>;
  frequency: number;
  location: string;
  notes?: string;
  status: 'pending' | 'overdue' | 'paid';
  clientId: string | ClientType;
  signature?: SignatureType;
  photos?: {
    before?: PhotoType[];
    after?: PhotoType[];
  };
}

export interface ShiftType {
  technicianId: string;
  clockIn?: Date;
  clockOut?: Date;
  jobDetails?: string;
  hoursWorked?: number;
}

export interface ScheduleType {
  _id: string;
  invoiceRef: string | InvoiceType;
  jobTitle: string;
  location: string;
  startDateTime: Date;
  assignedTechnicians: string[];
  confirmed: boolean;
  hours: number;
  shifts: ShiftType[];
  payrollPeriod?: string;
  deadRun: boolean;
  canManage?: boolean;
}

export interface PayrollPeriodType {
  _id: string;
  startDate: Date;
  endDate: Date;
  cutoffDate: Date;
  payDay: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface DueInvoiceType {
  _id: string;
  invoiceId: string;
  jobTitle: string;
  dateDue: Date;
  isScheduled: boolean;
  emailSent: boolean;
  clientId: string | ClientType;
}

export interface ScheduleResponse {
  schedules: ScheduleType[];
  canManage: boolean;
}
