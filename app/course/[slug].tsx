import { ScrollView, View, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Text } from '../../components/ui/text';
import {
  useAssignedCourse,
  isSectionAccessible
} from '../../services/data/courses';
import { getMobileStaffIdentity } from '@/utils/staffIdentity';

export default function CourseSectionListScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { user } = useUser();
  const identity = getMobileStaffIdentity(user?.publicMetadata);
  const { assigned, isLoading } = useAssignedCourse(identity?.appUserId, slug ?? '');

  const completedSectionIds = assigned?.progress.completedSectionIds ?? [];

  return (
    <SafeAreaView edges={['bottom']} className='flex-1 bg-[#F7F5F1] dark:bg-gray-950'>
      <Stack.Screen
        options={{
          headerShown: true,
          title: assigned?.course.shortTitle ?? 'Course',
          headerBackTitle: 'Training'
        }}
      />

      {isLoading ? (
        <View className='flex-1 items-center justify-center'>
          <ActivityIndicator color='#D97706' />
        </View>
      ) : !assigned ? (
        <View className='flex-1 items-center justify-center p-8'>
          <Ionicons name='alert-circle-outline' size={40} color='#8A857D' />
          <Text className='mt-3 text-center text-base font-semibold text-[#14110F] dark:text-white'>
            Course not available
          </Text>
          <Text variant='muted' className='mt-1 text-center'>
            This course isn&apos;t assigned to you, or hasn&apos;t synced yet.
          </Text>
        </View>
      ) : (
        <ScrollView
          className='flex-1'
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        >
          <View className='mb-4'>
            <Text className='text-xl font-bold text-[#14110F] dark:text-white'>
              {assigned.course.title}
            </Text>
            <Text variant='muted' className='mt-1'>
              {assigned.completedCount}/{assigned.totalSections} sections complete
            </Text>
          </View>

          <View className='gap-3'>
            {assigned.course.sections.map((section) => {
              const isDone = completedSectionIds.includes(section.sectionId);
              const accessible = isSectionAccessible(section, completedSectionIds);
              return (
                <TouchableOpacity
                  key={section.sectionId}
                  activeOpacity={accessible ? 0.8 : 1}
                  disabled={!accessible}
                  onPress={() =>
                    accessible &&
                    router.push(`/course/${slug}/${section.sectionId}`)
                  }
                  className={`flex-row items-center gap-3 rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-[#1F1C16] ${
                    accessible ? 'active:bg-[#F0EDE6] dark:active:bg-[#2A261D]' : 'opacity-50'
                  }`}
                >
                  <View
                    className={`h-9 w-9 items-center justify-center rounded-full ${
                      isDone
                        ? 'bg-green-100 dark:bg-green-950/70'
                        : 'bg-amber-100 dark:bg-amber-950/70'
                    }`}
                  >
                    {isDone ? (
                      <Ionicons name='checkmark' size={20} color='#16A34A' />
                    ) : !accessible ? (
                      <Ionicons name='lock-closed' size={16} color='#8A857D' />
                    ) : (
                      <Text className='text-xs font-bold text-amber-700 dark:text-amber-300'>
                        {section.sectionId}
                      </Text>
                    )}
                  </View>
                  <View className='flex-1'>
                    <Text className='text-base font-semibold text-[#14110F] dark:text-white'>
                      {section.title}
                    </Text>
                    <Text variant='muted' className='mt-0.5 text-xs'>
                      Module {section.moduleNumber} · {section.estimatedMinutes} min
                    </Text>
                  </View>
                  {accessible && (
                    <Ionicons name='chevron-forward' size={18} color='#8A857D' />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
