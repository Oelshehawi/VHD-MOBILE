export interface DashboardSchedule {
  _id: string;
  jobTitle: string;
  location: string;
  startDateTime: Date;
  hours: number;
  confirmed: boolean;
}

export interface EmployeeHours {
  userId: string;
  name: string;
  hours: number;
}

export interface DashboardData {
  name: string;
  canManage: boolean;
  todaySchedules: DashboardSchedule[];
  totalHours: number;
  userId: string;
  employeeHours?: EmployeeHours[];
}

export interface ClientType {
  _id: string;
  clientName?: string;
  email?: string;
  phoneNumber?: string;
  prefix?: string;
  notes?: string;
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
