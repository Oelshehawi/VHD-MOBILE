import React, { useMemo, useRef, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, LatLng } from 'react-native-maps';
import { useQuery } from '@powersync/react-native';
import { TechnicianLocation } from '@/types';
import { SafeAreaView } from 'react-native-safe-area-context';

interface TechnicianMapModalProps {
  visible: boolean;
  onClose: () => void;
}

type LocationMarker = {
  coordinate: LatLng;
  technicianId: string;
  id: string;
  timestamp: string;
  currentJobId: string | null;
};

const DEFAULT_REGION = {
  latitude: 49.2827,
  longitude: -123.1207,
  latitudeDelta: 0.5,
  longitudeDelta: 0.5,
};

export function TechnicianMapModal({
  visible,
  onClose,
}: TechnicianMapModalProps) {
  const mapRef = useRef<MapView>(null);
  const { data: locations = [] } = useQuery<TechnicianLocation>(
    `SELECT * FROM technician_locations WHERE isActive = 1 ORDER BY timestamp DESC`
  );

  const markers = useMemo<LocationMarker[]>(() => {
    const latestByTechnician = new Map<string, TechnicianLocation>();

    locations.forEach((location) => {
      const existing = latestByTechnician.get(location.technicianId);
      if (!existing) {
        latestByTechnician.set(location.technicianId, location);
        return;
      }

      if (
        existing.timestamp &&
        location.timestamp &&
        new Date(location.timestamp).getTime() >
          new Date(existing.timestamp).getTime()
      ) {
        latestByTechnician.set(location.technicianId, location);
      }
    });

    return Array.from(latestByTechnician.values()).map((location) => ({
      id: location.id,
      technicianId: location.technicianId,
      timestamp: location.timestamp,
      currentJobId: location.currentJobId ?? null,
      coordinate: {
        latitude: location.latitude,
        longitude: location.longitude,
      },
    }));
  }, [locations]);

  useEffect(() => {
    if (!visible || markers.length === 0 || !mapRef.current) {
      return;
    }

    mapRef.current.fitToCoordinates(
      markers.map((marker) => marker.coordinate),
      {
        edgePadding: { top: 80, right: 40, bottom: 80, left: 40 },
        animated: true,
      }
    );
  }, [visible, markers]);

  const initialRegion =
    markers.length > 0
      ? {
          ...DEFAULT_REGION,
          latitude: markers[0].coordinate.latitude,
          longitude: markers[0].coordinate.longitude,
        }
      : DEFAULT_REGION;

  return (
    <Modal
      visible={visible}
      animationType='slide'
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
      onRequestClose={onClose}
    >
          <SafeAreaView edges={['top']} className="flex-1">
        <View className="flex-1">
          <View className="flex-row justify-between items-center px-4 py-3 border-b border-gray-200 bg-white">
            <Text className="text-lg font-semibold text-gray-900">Live Technician Locations</Text>
            <Pressable onPress={onClose} className="px-3 py-2">
              <Text className="text-blue-600 text-base font-semibold">Close</Text>
            </Pressable>
          </View>

          <MapView
            ref={mapRef}
            provider={PROVIDER_GOOGLE}
            className="flex-1"
            initialRegion={initialRegion}
            showsMyLocationButton
            showsUserLocation
          >
            {markers.map((marker) => (
              <Marker
                key={marker.id}
                coordinate={marker.coordinate}
                title={`Technician ${marker.technicianId}`}
                description={
                  marker.currentJobId
                    ? `Job: ${marker.currentJobId}`
                    : undefined
                }
                pinColor='#1a73e8'
              />
            ))}
          </MapView>

          <View className="p-4 border-t border-gray-200 bg-gray-50">
            <Text className="text-center text-sm text-gray-500">
              {markers.length} technician
              {markers.length === 1 ? '' : 's'} on active jobs
            </Text>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}
