import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  TextInput,
  ScrollView,
} from 'react-native';
import {
  setEnvironment,
  getPowerSyncUrl,
  updateDevelopmentIPs,
} from '../services/api';

// This component allows switching between development and production environments
// and shows the current environment status
export const EnvironmentSwitcher = () => {
  const [currentEnv, setCurrentEnv] = useState<'DEVELOPMENT' | 'PRODUCTION'>(
    'DEVELOPMENT'
  );
  const [powerSyncUrl, setPowerSyncUrl] = useState<string>('');
  const [apiIp, setApiIp] = useState<string>('192.168.1.128');
  const [powerSyncIp, setPowerSyncIp] = useState<string>('192.168.1.128');
  const [isEditingIps, setIsEditingIps] = useState<boolean>(false);

  useEffect(() => {
    // Display the current PowerSync URL on mount
    setPowerSyncUrl(getPowerSyncUrl());
  }, []);

  const toggleEnvironment = () => {
    const newEnv = currentEnv === 'DEVELOPMENT' ? 'PRODUCTION' : 'DEVELOPMENT';

    Alert.alert(
      'Switch Environment',
      `Are you sure you want to switch to ${newEnv}? This will require you to log out and log back in.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Switch',
          onPress: () => {
            setEnvironment(newEnv);
            setCurrentEnv(newEnv);
            setPowerSyncUrl(getPowerSyncUrl());
            Alert.alert(
              'Environment Switched',
              `Environment set to ${newEnv}. Please log out and log back in for changes to take effect.`
            );
          },
        },
      ]
    );
  };

  const updateIpSettings = () => {
    updateDevelopmentIPs(apiIp, powerSyncIp);
    setIsEditingIps(false);

    // If currently in development mode, update the displayed PowerSync URL
    if (currentEnv === 'DEVELOPMENT') {
      setPowerSyncUrl(getPowerSyncUrl());
    }

    Alert.alert(
      'IP Settings Updated',
      'Development IP addresses have been updated. These will be used when in DEVELOPMENT mode.',
      [{ text: 'OK' }]
    );
  };

  return (
    <ScrollView>
      <View style={styles.container}>
        <Text style={styles.title}>Environment Settings</Text>
        <View style={styles.infoContainer}>
          <Text style={styles.label}>Current Environment:</Text>
          <Text
            style={[
              styles.value,
              currentEnv === 'DEVELOPMENT'
                ? styles.development
                : styles.production,
            ]}
          >
            {currentEnv}
          </Text>
        </View>

        <View style={styles.infoContainer}>
          <Text style={styles.label}>PowerSync URL:</Text>
          <Text style={styles.value} numberOfLines={1} ellipsizeMode='middle'>
            {powerSyncUrl}
          </Text>
        </View>

        <TouchableOpacity
          style={[
            styles.button,
            currentEnv === 'DEVELOPMENT'
              ? styles.productionButton
              : styles.developmentButton,
          ]}
          onPress={toggleEnvironment}
        >
          <Text style={styles.buttonText}>
            Switch to{' '}
            {currentEnv === 'DEVELOPMENT' ? 'PRODUCTION' : 'DEVELOPMENT'}
          </Text>
        </TouchableOpacity>

        {/* Development IP Address Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Development IP Settings</Text>

          {isEditingIps ? (
            <>
              <View style={styles.inputContainer}>
                <Text style={styles.label}>API Server IP:</Text>
                <TextInput
                  style={styles.input}
                  value={apiIp}
                  onChangeText={setApiIp}
                  placeholder='192.168.x.x'
                  keyboardType='numeric'
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>PowerSync IP:</Text>
                <TextInput
                  style={styles.input}
                  value={powerSyncIp}
                  onChangeText={setPowerSyncIp}
                  placeholder='192.168.x.x'
                  keyboardType='numeric'
                />
              </View>

              <View style={styles.buttonRow}>
                <TouchableOpacity
                  style={[styles.button, styles.cancelButton]}
                  onPress={() => setIsEditingIps(false)}
                >
                  <Text style={styles.buttonText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.button, styles.saveButton]}
                  onPress={updateIpSettings}
                >
                  <Text style={styles.buttonText}>Save</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <TouchableOpacity
              style={[styles.button, styles.editButton]}
              onPress={() => setIsEditingIps(true)}
            >
              <Text style={styles.buttonText}>Edit IP Addresses</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 8,
    margin: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 10,
    textAlign: 'center',
  },
  infoContainer: {
    flexDirection: 'row',
    marginVertical: 5,
    alignItems: 'center',
  },
  label: {
    fontWeight: '500',
    fontSize: 14,
    width: '40%',
  },
  value: {
    fontSize: 14,
    flex: 1,
  },
  development: {
    color: '#2563eb', // Blue for development
  },
  production: {
    color: '#dc2626', // Red for production
  },
  button: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
    marginTop: 10,
    alignItems: 'center',
  },
  developmentButton: {
    backgroundColor: '#2563eb', // Blue for switching to development
  },
  productionButton: {
    backgroundColor: '#dc2626', // Red for switching to production
  },
  editButton: {
    backgroundColor: '#047857', // Green for edit button
  },
  saveButton: {
    backgroundColor: '#047857', // Green for save button
    flex: 1,
    marginLeft: 8,
  },
  cancelButton: {
    backgroundColor: '#6B7280', // Gray for cancel button
    flex: 1,
    marginRight: 8,
  },
  buttonText: {
    color: 'white',
    fontWeight: '600',
  },
  section: {
    marginTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingTop: 15,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 10,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 8,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 4,
    padding: 8,
    fontSize: 14,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
});
