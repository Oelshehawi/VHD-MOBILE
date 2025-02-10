import { Schedule, PayrollSchedule } from '@/types';
import { Linking } from 'react-native';

export const sortSchedulesByTime = (schedules: Schedule[]) => {
  return schedules
    .filter((schedule) => schedule.startDateTime)
    .sort((a, b) => {
      try {
        return (
          new Date(a.startDateTime).getTime() -
          new Date(b.startDateTime).getTime()
        );
      } catch (err) {
        console.error('Error sorting schedules:', err, {
          a: a.startDateTime,
          b: b.startDateTime,
        });
        return 0;
      }
    });
};

export const openMaps = (title: string, location: string) => {
  const query = encodeURIComponent(`${title} ${location}`);
  const url = `https://www.google.com/maps/search/?api=1&query=${query}`;
  Linking.openURL(url);
};
