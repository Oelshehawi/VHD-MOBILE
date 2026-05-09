export type ScheduleServiceType =
  | 'hoodCleaning'
  | 'touchUp'
  | 'beltChange'
  | 'inspection'
  | 'repair'
  | 'estimate'
  | 'other';

export type {
  GeofenceTarget,
  LocationEventPlatform,
  LocationEventSource,
  LocationEventType,
  LocationRegionType,
  LocationUpdateMode,
  MobileLocationEvent,
  ParsedTrackingWindow,
  TechnicianTrackingWindow,
  TrackingWindowStatus
} from './locationTracking';

export interface Schedule {
  id: string;
  invoiceRef: string;
  serviceJobId?: string;
  jobTitle: string;
  location: string;
  startDateTime: string;
  scheduledStartAtUtc?: string;
  timeZone?: string;
  serviceTypes?: ScheduleServiceType[] | string;
  requiresReport?: boolean | number;
  requiresEquipmentProfile?: boolean | number;
  affectsRecurrence?: boolean | number;
  isBackfilledHistorical?: boolean | number;
  actualServiceDurationMinutes?: number;
  assignedTechnicians: string[];
  confirmed: boolean;
  hours: number;
  shifts: ShiftType[];
  payrollPeriod?: string;
  deadRun: boolean;
  canManage?: boolean;
  technicianNotes?: string | null;
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

export interface EquipmentFilterGroup {
  type: string;
  quantity: number;
  notes?: string | null;
}

export interface HoodEquipment {
  id: string;
  label: string;
  filterGroups?: EquipmentFilterGroup[] | string;
  notes?: string | null;
}

export interface HoodGroup {
  id: string;
  label?: string | null;
  hoodIds?: string[] | string;
  spacerNotes?: string | null;
}

export interface AirMoverEquipment {
  id: string;
  label: string;
  type: 'exhaustFan' | 'ecologyUnit' | 'other' | string;
  manufacturer?: string | null;
  modelNumber?: string | null;
  serialNumber?: string | null;
  accessPoint?: string | null;
  filterGroups?: EquipmentFilterGroup[] | string;
  filterReplacementNeeded?: boolean | number | null;
  hasHingesAndChains?: boolean | number | null;
  notes?: string | null;
}

export interface EquipmentProfile {
  id: string;
  profileKey: string;
  serviceJobId: string;
  clientId?: string | null;
  normalizedLocation?: string | null;
  location: string;
  jobTitle?: string | null;
  scopeLabel?: string | null;
  hoods?: HoodEquipment[] | string;
  hoodGroups?: HoodGroup[] | string;
  airMovers?: AirMoverEquipment[] | string;
  lastSourceReportId?: string | null;
  lastSourceScheduleId?: string | null;
  lastObservedAt?: string | null;
  updatedBy?: string | null;
  source?: 'report' | 'legacyReport' | 'admin' | string | null;
  needsReview?: boolean | number | string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface EmployeeHours {
  technicianName: string;
  hours: number;
}

export interface PayrollSchedule {
  id: string;
  jobTitle: string;
  date: string;
  scheduledStartAtUtc?: string;
  timeZone?: string;
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
  type: 'before' | 'after' | 'estimate' | 'signature';
  status: 'pending' | 'uploaded';
  photoCategoryKey?: string | null;
  photoCategoryLabel?: string | null;
  photoCategoryKind?: PhotoCategoryKind | null;
}

export type PhotoCategoryKind =
  | 'hood'
  | 'hoodGroup'
  | 'exhaustFan'
  | 'ecologyUnit'
  | 'other';

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
  serviceJobIds?: string[] | string;
  visitIds?: string[] | string;
  frequency?: number;
  status?: 'pending' | 'overdue' | 'paid';
  clientId?: string;
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
  serviceJobId?: string;
  jobTitle: string;
  location: string;
  startDateTime: string;
  scheduledStartAtUtc?: string;
  timeZone?: string;
  serviceTypes?: ScheduleServiceType[] | string;
  requiresReport?: boolean | number;
  requiresEquipmentProfile?: boolean | number;
  affectsRecurrence?: boolean | number;
  isBackfilledHistorical?: boolean | number;
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
