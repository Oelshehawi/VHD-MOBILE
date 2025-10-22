import { useCallback, useState } from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useUser } from '@clerk/clerk-expo';
import { Stack } from 'expo-router';
import { ScheduleView } from '../../components/schedule/ScheduleView';
import { startOfDay } from 'date-fns';
import Ionicons from '@expo/vector-icons/Ionicons';
import { TechnicianMapModal } from '@/components/location/TechnicianMapModal';

export default function Page() {
  const { user } = useUser();
  // Use Clerk's has() method to determine if user has management permissions
  const isManager = !!user?.publicMetadata.isManager;

  const [currentDate, setCurrentDate] = useState(() => {
    // Use date-fns to get start of today in local time
    return startOfDay(new Date()).toISOString();
  });

  const handleDateChange = useCallback((date: string) => {
    // Ensure we're always using start of day
    const newDate = startOfDay(new Date(date));
    setCurrentDate(newDate.toISOString());
  }, []);

  const [mapModalVisible, setMapModalVisible] = useState(false);

  if (!user?.id) return null;

  return (
    <>
  
      <View style={styles.container}>
        <ScheduleView
          userId={user.id}
          currentDate={currentDate}
          onDateChange={handleDateChange}
          isManager={isManager}
        />

        {isManager && (
          <>
            <TouchableOpacity
              style={styles.mapButton}
              activeOpacity={0.8}
              onPress={() => setMapModalVisible(true)}
            >
              <Ionicons name="map" size={26} color="#ffffff" />
              <Text style={styles.mapButtonLabel}>Live Map</Text>
            </TouchableOpacity>

            <TechnicianMapModal
              visible={mapModalVisible}
              onClose={() => setMapModalVisible(false)}
            />
          </>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  mapButton: {
    position: 'absolute',
    bottom: 32,
    right: 24,
    backgroundColor: '#1a73e8',
    borderRadius: 32,
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 6,
    elevation: 8,
  },
  mapButtonLabel: {
    marginTop: 2,
    fontSize: 10,
    color: '#ffffff',
    fontWeight: '600',
  },
});
