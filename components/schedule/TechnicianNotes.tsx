import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, TextInput } from 'react-native';
import { usePowerSync } from '@powersync/react-native';
import { ConfirmationModal } from '@/components/common/ConfirmationModal';

interface TechnicianNotesProps {
  schedule: any;
  scheduleId: string;
  isManager: boolean;
}

/**
 * A component to display and edit technician notes
 */
export function TechnicianNotes({
  schedule,
  scheduleId,
  isManager,
}: TechnicianNotesProps) {
  const [editingNotes, setEditingNotes] = useState(false);
  const [technicianNotes, setTechnicianNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const powerSync = usePowerSync();

  // Reset notes when schedule changes to ensure state is reset
  useEffect(() => {
    if (schedule?.technicianNotes !== undefined) {
      setTechnicianNotes(schedule.technicianNotes || '');
    }
  }, [schedule?.id, schedule?.technicianNotes]);

  // Function to save updated technicianNotes
  const saveTechnicianNotes = async () => {
    if (!scheduleId) return;

    try {
      setIsSaving(true);

      // Update local PowerSync database
      await powerSync.execute(
        `UPDATE schedules SET technicianNotes = ? WHERE id = ?`,
        [technicianNotes, scheduleId]
      );

      // Show success confirmation
      setShowConfirmation(true);
    } catch (error) {
      console.error('Error saving technician notes:', error);
      setEditingNotes(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View className='flex flex-col gap-4'>
      <View className='flex-row justify-between items-center'>
        <Text className='text-lg font-semibold text-gray-900 dark:text-white'>
          Technician Notes
        </Text>
        {!isManager && !editingNotes && (
          <TouchableOpacity
            onPress={() => setEditingNotes(true)}
            className='px-3 py-1 bg-darkGreen rounded-lg'
          >
            <Text className='text-white font-medium'>Edit</Text>
          </TouchableOpacity>
        )}
      </View>

      {editingNotes ? (
        <View className='flex flex-col gap-3'>
          <TextInput
            className='bg-white dark:bg-gray-700 p-4 rounded-lg text-gray-700 dark:text-gray-300 min-h-[100px]'
            multiline
            value={technicianNotes}
            onChangeText={setTechnicianNotes}
            placeholder='Enter notes about the work completed...'
            placeholderTextColor='#9CA3AF'
          />
          <View className='flex-row justify-end gap-3'>
            <TouchableOpacity
              onPress={() => {
                setTechnicianNotes(schedule?.technicianNotes || '');
                setEditingNotes(false);
              }}
              className='px-4 py-2 bg-gray-200 dark:bg-gray-600 rounded-lg'
              disabled={isSaving}
            >
              <Text className='text-gray-700 dark:text-gray-300 font-medium'>
                Cancel
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={saveTechnicianNotes}
              className='px-4 py-2 bg-darkGreen rounded-lg'
              disabled={isSaving}
            >
              <Text className='text-white font-medium'>
                {isSaving ? 'Saving...' : 'Save'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View className='bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg'>
          {schedule?.technicianNotes ? (
            <Text className='text-gray-700 dark:text-gray-300'>
              {schedule.technicianNotes}
            </Text>
          ) : (
            <Text className='text-gray-500 dark:text-gray-400 italic'>
              No technician notes yet
            </Text>
          )}
        </View>
      )}

      {/* Confirmation Modal */}
      <ConfirmationModal
        visible={showConfirmation}
        onClose={() => {
          setShowConfirmation(false);
          setEditingNotes(false);
        }}
        onConfirm={() => {
          setShowConfirmation(false);
          setEditingNotes(false);
        }}
        title='Notes Saved'
        message='Your technician notes have been saved successfully.'
        confirmText='OK'
        showCancelButton={false}
      />
    </View>
  );
}
