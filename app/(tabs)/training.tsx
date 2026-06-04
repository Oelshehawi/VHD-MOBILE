import { ScrollView, View, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Text } from '../../components/ui/text';
import { useAssignedCourses } from '../../services/data/courses';

export default function TrainingScreen() {
  const { user } = useUser();
  const { assignedCourses, isLoading } = useAssignedCourses(user?.id);

  return (
    <SafeAreaView className='flex-1 bg-[#F7F5F1] dark:bg-gray-950'>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        className='flex-1'
        contentContainerStyle={{ flexGrow: 1, padding: 16, paddingBottom: 32 }}
      >
        <View className='mb-5'>
          <Text variant='h3' className='text-[#14110F] dark:text-white'>
            Training
          </Text>
          <Text variant='muted' className='mt-1'>
            Courses assigned to you. Complete each section to finish.
          </Text>
        </View>

        {isLoading ? (
          <View className='flex-1 items-center justify-center py-16'>
            <ActivityIndicator color='#D97706' />
          </View>
        ) : assignedCourses.length === 0 ? (
          <View className='items-center justify-center rounded-2xl border border-black/10 bg-white p-8 dark:border-white/10 dark:bg-[#1F1C16]'>
            <Ionicons name='school-outline' size={40} color='#8A857D' />
            <Text className='mt-3 text-center text-base font-semibold text-[#14110F] dark:text-white'>
              No courses assigned
            </Text>
            <Text variant='muted' className='mt-1 text-center'>
              A manager will assign training to you. Check back later.
            </Text>
          </View>
        ) : (
          <View className='gap-4'>
            {assignedCourses.map((entry) => {
              const isComplete = !!entry.progress.completedAt;
              return (
                <TouchableOpacity
                  key={entry.course.slug}
                  activeOpacity={0.8}
                  onPress={() => router.push(`/course/${entry.course.slug}`)}
                  className='rounded-2xl border border-black/10 bg-white p-5 active:bg-[#F0EDE6] dark:border-white/10 dark:bg-[#1F1C16] dark:active:bg-[#2A261D]'
                >
                  <View className='flex-row items-start justify-between'>
                    <View className='flex-1 pr-3'>
                      <Text className='text-lg font-bold text-[#14110F] dark:text-white'>
                        {entry.course.title}
                      </Text>
                      <Text variant='muted' className='mt-1'>
                        {entry.course.description}
                      </Text>
                    </View>
                    {isComplete ? (
                      <Ionicons name='checkmark-circle' size={26} color='#16A34A' />
                    ) : (
                      <Ionicons name='chevron-forward' size={22} color='#8A857D' />
                    )}
                  </View>

                  <View className='mt-4'>
                    <View className='h-2 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10'>
                      <View
                        className='h-2 rounded-full bg-amber-500'
                        style={{ width: `${entry.completionPercent}%` }}
                      />
                    </View>
                    <View className='mt-2 flex-row items-center justify-between'>
                      <Text variant='muted' className='text-xs'>
                        {entry.completedCount}/{entry.totalSections} sections ·{' '}
                        {entry.course.estimatedMinutes} min
                      </Text>
                      <Text className='text-xs font-semibold text-amber-600 dark:text-amber-400'>
                        {entry.completionPercent}%
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
