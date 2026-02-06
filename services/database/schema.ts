import { Column, column, ColumnType, Schema, Table } from '@powersync/react-native';
import { AttachmentTable } from '@powersync/attachments';

export const SCHEDULES_TABLE = 'schedules';

const invoices = new Table(
  {
    // id column (text) is automatically included
    clientId: column.text,
    dateDue: column.text,
    dateIssued: column.text,
    frequency: column.integer,
    invoiceId: column.text,
    items: column.text, // JSON string of items array
    jobTitle: column.text,
    location: column.text,
    notes: column.text,
    status: column.text,
    // Payment info fields
    paymentMethod: column.text, // 'eft' | 'e-transfer' | 'cheque' | 'credit-card' | 'other'
    paymentDatePaid: column.text, // ISO date string
    paymentNotes: column.text // Optional payment notes
  },
  { indexes: {} }
);

const schedules = new Table(
  {
    // id column (text) is automatically included
    assignedTechnicians: column.text,
    confirmed: column.integer,
    deadRun: column.integer,
    hours: column.real,
    invoiceRef: column.text,
    jobTitle: column.text,
    location: column.text,
    payrollPeriod: column.text,
    shifts: column.text,
    startDateTime: column.text,
    technicianNotes: column.text, // Notes from technicians
    // Site access info
    onSiteContact: column.text, // JSON: { name, phone, email }
    accessInstructions: column.text // Free text
  },
  { indexes: { invoices: ['invoiceRef'] } }
);

const photos = new Table(
  {
    // id column (text) is automatically included
    scheduleId: column.text,
    cloudinaryUrl: column.text, // NULL = loading, has value = uploaded
    type: column.text, // 'before' | 'after' | 'signature' | 'estimate'
    technicianId: column.text,
    timestamp: column.text, // ISO string
    signerName: column.text // Only for type='signature'
  },
  { indexes: { schedules: ['scheduleId'] } }
);

const reports = new Table(
  {
    // id column (text) is automatically included
    scheduleId: column.text,
    invoiceId: column.text,
    technicianId: column.text,
    dateCompleted: column.text,
    reportStatus: column.text, // 'draft' | 'in_progress' | 'completed'
    jobTitle: column.text,
    location: column.text,
    cookingVolume: column.text, // 'High' | 'Medium' | 'Low'
    recommendedCleaningFrequency: column.integer,
    comments: column.text,
    // Nested objects stored as JSON text
    cleaningDetails: column.text, // JSON: { hoodCleaned, filtersCleaned, ductworkCleaned, fanCleaned }
    inspectionItems: column.text // JSON: { adequateAccessPanels }
  },
  { indexes: { schedules: ['scheduleId'] } }
);

const payrollperiods = new Table(
  {
    // id column (text) is automatically included
    createdAt: column.text,
    cutoffDate: column.text,
    endDate: column.text,
    payDay: column.text,
    startDate: column.text,
    status: column.text,
    updatedAt: column.text
  },
  { indexes: {} }
);

const availabilities = new Table(
  {
    // id column (text) is automatically included
    technicianId: column.text, // Clerk user ID
    dayOfWeek: column.integer, // 0-6 for recurring patterns (nullable)
    startTime: column.text, // HH:mm format
    endTime: column.text, // HH:mm format
    isFullDay: column.integer, // Boolean as 0/1
    isRecurring: column.integer, // Boolean as 0/1
    specificDate: column.text, // ISO date string (nullable)
    createdAt: column.text,
    updatedAt: column.text
  },
  { indexes: { technicians: ['technicianId'] } }
);

const timeoffrequests = new Table(
  {
    // id column (text) is automatically included
    technicianId: column.text, // Clerk user ID
    startDate: column.text, // ISO date string
    endDate: column.text, // ISO date string
    reason: column.text,
    status: column.text, // "pending" | "approved" | "rejected"
    requestedAt: column.text, // ISO datetime
    reviewedAt: column.text, // ISO datetime (nullable)
    reviewedBy: column.text, // Admin Clerk ID (nullable)
    notes: column.text // Admin notes (nullable)
  },
  { indexes: { technicians: ['technicianId'] } }
);

const expopushtokens = new Table(
  {
    // id column (text) is automatically included
    userId: column.text, // Clerk user ID
    token: column.text, // ExponentPushToken[xxx]
    platform: column.text, // 'ios' | 'android'
    deviceName: column.text, // Device identifier
    notifyNewJobs: column.integer, // 1 = enabled, 0 = disabled
    notifyScheduleChanges: column.integer, // 1 = enabled, 0 = disabled
    lastUsedAt: column.text, // ISO datetime
    createdAt: column.text,
    updatedAt: column.text
  },
  { indexes: { users: ['userId'] } }
);

// Add the attachments table from PowerSync
export const AppSchema = new Schema({
  invoices,
  schedules,
  payrollperiods,
  availabilities,
  timeoffrequests,
  expopushtokens,
  photos,
  reports,
  attachments: new AttachmentTable({
    name: 'attachments',
    additionalColumns: [
      new Column({
        name: 'scheduleId',
        type: ColumnType.TEXT
      }),
      new Column({
        name: 'photoType',
        type: ColumnType.TEXT
      }),
      new Column({
        name: 'jobTitle',
        type: ColumnType.TEXT
      }),
      new Column({
        name: 'startDate',
        type: ColumnType.TEXT
      })
    ]
  })
});

export type Database = (typeof AppSchema)['types'];
export type Schedule = Database['schedules'];
export type Availability = Database['availabilities'];
export type TimeOffRequest = Database['timeoffrequests'];
export type Report = Database['reports'];
export type ExpoPushToken = Database['expopushtokens'];
