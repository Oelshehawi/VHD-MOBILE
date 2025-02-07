import { column, Schema, Table } from '@powersync/react-native';

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
    photos: column.text, // JSON string containing { before: PhotoType[], after: PhotoType[] }
    signature: column.text, // JSON string of SignatureType
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
  },
  { indexes: {} }
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

export const AppSchema = new Schema({
  invoices,
  schedules,
  payrollperiods,
});

export type Database = (typeof AppSchema)['types'];
