import React, { useState, useEffect } from 'react';
import { View, Switch, ActivityIndicator, Alert } from 'react-native';
import { useUser } from '@clerk/clerk-expo';
import { useQuery, usePowerSync } from '@powersync/react-native';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Text } from '@/components/ui/text';
import { debugLogger } from '@/utils/DebugLogger';
import type { ExpoPushToken } from '@/services/database/schema';

export function NotificationPreferences() {
  const { user } = useUser();
  const powerSync = usePowerSync();
  const [isSaving, setIsSaving] = useState(false);

  // Query the current user's push token preferences
  const { data: tokens, isLoading } = useQuery<ExpoPushToken>(
    `SELECT * FROM expopushtokens WHERE userId = ? LIMIT 1`,
    [user?.id || '']
  );

  const currentToken = tokens?.[0];

  // Local state for preferences (synced with database)
  const [notifyNewJobs, setNotifyNewJobs] = useState(currentToken?.notifyNewJobs === 1);
  const [notifyScheduleChanges, setNotifyScheduleChanges] = useState(
    currentToken?.notifyScheduleChanges === 1
  );

  // Update local state when token data changes
  useEffect(() => {
    if (currentToken) {
      setNotifyNewJobs(currentToken.notifyNewJobs === 1);
      setNotifyScheduleChanges(currentToken.notifyScheduleChanges === 1);
    }
  }, [currentToken]);

  const handleToggle = async (field: 'notifyNewJobs' | 'notifyScheduleChanges', value: boolean) => {
    if (!user?.id || !currentToken || !powerSync) {
      Alert.alert('Error', 'Unable to update preferences. Please try again.');
      return;
    }

    // Optimistically update UI
    if (field === 'notifyNewJobs') {
      setNotifyNewJobs(value);
    } else {
      setNotifyScheduleChanges(value);
    }

    setIsSaving(true);

    try {
      // Update PowerSync database (will auto-sync to backend)
      const numericValue = value ? 1 : 0;
      const now = new Date().toISOString();

      await powerSync.execute(
        `UPDATE expopushtokens SET ${field} = ?, updatedAt = ? WHERE id = ?`,
        [numericValue, now, currentToken.id]
      );

      debugLogger.info('PUSH', `Updated ${field} preference`, {
        value
      });
    } catch (error) {
      // Revert on failure
      if (field === 'notifyNewJobs') {
        setNotifyNewJobs(!value);
      } else {
        setNotifyScheduleChanges(!value);
      }
      Alert.alert('Error', 'Failed to update notification preferences');
      debugLogger.error('PUSH', 'Failed to save preference', { error });
    } finally {
      setIsSaving(false);
    }
  };

  // If no push token exists yet, show setup message
  if (!isLoading && !currentToken) {
    return (
      <Card className='mb-4'>
        <CardHeader>
          <CardTitle>Notification Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <Text className='text-sm text-gray-600 dark:text-gray-400'>
            Push notifications will be enabled automatically when you restart the app.
          </Text>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className='mb-4'>
        <CardContent className='items-center py-8'>
          <ActivityIndicator />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className='mb-4'>
      <CardHeader>
        <CardTitle>Notification Settings</CardTitle>
      </CardHeader>
      <CardContent>
        <View className='space-y-4'>
          <NotificationToggle
            label='New Job Assigned'
            description="Get notified when you're assigned to a new job"
            value={notifyNewJobs}
            onToggle={(value) => handleToggle('notifyNewJobs', value)}
            disabled={isSaving}
          />
          <NotificationToggle
            label='Schedule Updates'
            description='Get notified when job details change (time, location)'
            value={notifyScheduleChanges}
            onToggle={(value) => handleToggle('notifyScheduleChanges', value)}
            disabled={isSaving}
          />
        </View>
      </CardContent>
    </Card>
  );
}

interface NotificationToggleProps {
  label: string;
  description: string;
  value: boolean;
  onToggle: (value: boolean) => void;
  disabled?: boolean;
}

function NotificationToggle({
  label,
  description,
  value,
  onToggle,
  disabled
}: NotificationToggleProps) {
  return (
    <View className='flex-row items-center justify-between py-2'>
      <View className='flex-1 pr-4'>
        <Text className='font-semibold text-gray-900 dark:text-white'>{label}</Text>
        <Text className='text-sm text-gray-600 dark:text-gray-400'>{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        disabled={disabled}
        trackColor={{ false: '#767577', true: '#81c784' }}
      />
    </View>
  );
}
