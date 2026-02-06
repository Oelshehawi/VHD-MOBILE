import { startOfMonth, endOfMonth, eachDayOfInterval, subMonths, addMonths } from 'date-fns';
import { AppointmentType } from '@/types';

// Helper function to get current date in PT
export const getCurrentDateInPT = () => {
  const now = new Date();
  // Subtract 8 hours to convert from UTC to PST
  return new Date(now.getTime() - 8 * 60 * 60 * 1000);
};

// Helper to convert UTC ISO string to local date
export const convertUTCToLocal = (dateStr: string) => {
  const date = new Date(dateStr);
  return new Date(date.getTime() + date.getTimezoneOffset() * 60 * 1000);
};

export const getMonthDays = (currentDate: Date) => {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Add padding days to start of month
  const startPadding = Array.from({ length: monthStart.getDay() }, (_, i) => {
    const date = new Date(monthStart);
    date.setMonth(date.getMonth() - 1);
    date.setDate(endOfMonth(subMonths(monthStart, 1)).getDate() - i);
    return date;
  }).reverse();

  // Add padding days to end of month
  const endPadding = Array.from({ length: 6 - monthEnd.getDay() }, (_, i) => {
    const date = new Date(monthStart);
    date.setMonth(date.getMonth() + 1);
    date.setDate(i + 1);
    return date;
  });

  return [...startPadding, ...days, ...endPadding];
};

export const getAppointmentsForDay = (date: Date, appointments: AppointmentType[]) => {
  if (!date || !appointments?.length) return [];

  // Format the date to YYYY-MM-DD in UTC
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const dateString = `${year}-${month}-${day}`;

  const dayAppointments = appointments.filter((apt) => {
    if (!apt.startTime) return false;

    // Parse appointment date in UTC
    const aptDate = new Date(apt.startTime);
    const aptYear = aptDate.getUTCFullYear();
    const aptMonth = String(aptDate.getUTCMonth() + 1).padStart(2, '0');
    const aptDay = String(aptDate.getUTCDate()).padStart(2, '0');
    const aptDateString = `${aptYear}-${aptMonth}-${aptDay}`;

    return aptDateString === dateString;
  });

  return dayAppointments.sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );
};
