import { View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Text } from '@/components/ui/text';

/** Photos are owned by a technician record; accounts without one can't add them. */
export function NoTechnicianNotice() {
  return (
    <View className='mt-3 flex-row items-start gap-2 rounded-xl bg-amber-100 px-3 py-2.5 dark:bg-amber-500/20'>
      <Ionicons name='alert-circle' size={18} color='#B45309' />
      <Text className='flex-1 text-xs font-medium text-amber-900 dark:text-amber-200'>
        Your account isn't linked to a technician profile, so photos can't be added. Ask an admin to
        link it.
      </Text>
    </View>
  );
}
