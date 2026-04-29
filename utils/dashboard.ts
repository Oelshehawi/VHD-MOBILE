import { Schedule } from '@/types';
import { Linking } from 'react-native';
import { getLocalDateKey, getScheduleSortTime, scheduleMatchesDateKey } from './scheduleTime';

export const sortSchedulesByTime = (schedules: Schedule[]) => {
  return schedules
    .filter((schedule) => scheduleMatchesDateKey(schedule, getLocalDateKey(new Date())))
    .sort((a, b) => {
      return getScheduleSortTime(a) - getScheduleSortTime(b);
    });
};

export const openMaps = (title: string, location: string) => {
  const query = encodeURIComponent(`${title} ${location}`);
  const url = `https://www.google.com/maps/search/?api=1&query=${query}`;
  Linking.openURL(url);
};
