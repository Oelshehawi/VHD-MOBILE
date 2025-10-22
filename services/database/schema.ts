import {
  Column,
  column,
  ColumnType,
  Schema,
  Table,
} from '@powersync/react-native';
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
    // photos and signature are now in schedules table
  },
  { indexes: {} }
);

const schedules = new Table(
  {
    // id column (text) is automatically included
    assignedTechnicians: column.text,
    confirmed: column.integer,
    deadRun: column.integer,
    hours: column.integer,
    invoiceRef: column.text,
    jobTitle: column.text,
    location: column.text,
    payrollPeriod: column.text,
    shifts: column.text,
    startDateTime: column.text,
    photos: column.text, // JSON string containing photo data
    signature: column.text, // JSON string of SignatureType
    technicianNotes: column.text, // Notes from technicians
  },
  { indexes: { invoices: ['invoiceRef'] } }
);

const technicianlocations = new Table(
  {
    technicianId: column.text,
    latitude: column.real,
    longitude: column.real,
    timestamp: column.text,
    isActive: column.integer,
    currentJobId: column.text,
    accuracy: column.real,
  },
  {
    indexes: {
      technician: ['technicianId'],
      active: ['isActive'],
    },
  }
);

// Insert-only table for photo deletion operations
const delete_photo_operations = new Table(
  {
    // id column (text) is automatically included
    scheduleId: column.text, // Reference to schedule
    remote_uri: column.text, // The cloudinary URL to delete
    photoId: column.text, // ID of the photo to delete (optional)
  },
  {
    insertOnly: true,
    indexes: { schedules: ['scheduleId'] },
  }
);

// Insert-only table for photo addition operations
const add_photo_operations = new Table(
  {
    // id column (text) is automatically included
    scheduleId: column.text, // Reference to schedule
    timestamp: column.text, // When the photo was taken
    technicianId: column.text, // Who added the photo
    type: column.text, // Type of the photo ('before'/'after')
    cloudinaryUrl: column.text, // URL returned from Cloudinary after upload
    signerName: column.text, // Name of the signer
    attachmentId: column.text, // ID of the attachment record
  },
  {
    insertOnly: true,
    indexes: { schedules: ['scheduleId'] },
  }
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
    updatedAt: column.text,
  },
  { indexes: {} }
);

// Add the attachments table from PowerSync
export const AppSchema = new Schema({
  invoices,
  schedules,
  payrollperiods,
  delete_photo_operations,
  add_photo_operations,
  technicianlocations,
  attachments: new AttachmentTable({
    name: 'attachments',
    additionalColumns: [
      new Column({
        name: 'scheduleId',
        type: ColumnType.TEXT,
      }),
      new Column({
        name: 'jobTitle',
        type: ColumnType.TEXT,
      }),
      new Column({
        name: 'type',
        type: ColumnType.TEXT,
      }),
      new Column({
        name: 'startDate',
        type: ColumnType.TEXT,
      }),
      new Column({
        name: 'technicianId',
        type: ColumnType.TEXT,
      }),
      new Column({
        name: 'signerName',
        type: ColumnType.TEXT,
      }),
    ],
  }),
});

export type Database = (typeof AppSchema)['types'];
export type Schedule = Database['schedules'];
