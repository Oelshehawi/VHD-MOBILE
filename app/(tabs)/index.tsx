import { View, Text, ScrollView } from 'react-native';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { mockJobs, mockProfile } from '@/services/mockData';

export default function DashboardScreen() {
  const upcomingJobs = mockJobs
    .filter((job) => job.status === 'pending')
    .slice(0, 3);

  return (
    <ScrollView className='flex-1 bg-gray-100 dark:bg-gray-900'>
      <View className='p-4'>
        {/* Welcome Section */}
        <Card>
          <Text className='text-xl font-bold text-gray-900 dark:text-white'>
            Welcome back, {mockProfile.name}
          </Text>
          <Text className='text-sm text-gray-500 dark:text-gray-400 mt-1'>
            {mockProfile.role}
          </Text>
        </Card>

        {/* Quick Stats */}
        <View className='flex-row gap-4 mb-4'>
          <Card className='flex-1'>
            <Text className='text-sm text-gray-500 dark:text-gray-400'>
              Hours This Week
            </Text>
            <Text className='text-xl font-bold text-gray-900 dark:text-white'>
              {mockProfile.totalHours}
            </Text>
          </Card>
          <Card className='flex-1'>
            <Text className='text-sm text-gray-500 dark:text-gray-400'>
              Next Payday
            </Text>
            <Text className='text-xl font-bold text-gray-900 dark:text-white'>
              {new Date(mockProfile.nextPayday).toLocaleDateString()}
            </Text>
          </Card>
        </View>

        {/* Upcoming Jobs */}
        <View className='mb-4'>
          <Text className='text-lg font-semibold text-gray-900 dark:text-white mb-2'>
            Upcoming Jobs
          </Text>
          {upcomingJobs.map((job) => (
            <Card key={job.id}>
              <Text className='font-medium text-gray-900 dark:text-white'>
                {job.clientName}
              </Text>
              <Text className='text-sm text-gray-500 dark:text-gray-400 mt-1'>
                {job.address}
              </Text>
              <View className='flex-row justify-between items-center mt-2'>
                <Text className='text-sm text-gray-500 dark:text-gray-400'>
                  {new Date(job.date).toLocaleDateString()} at {job.time}
                </Text>
                <Button
                  variant='outline'
                  onPress={() => {}}
                  className='px-3 py-1'
                >
                  View Details
                </Button>
              </View>
            </Card>
          ))}
        </View>

        {/* Quick Actions */}
        <View>
          <Text className='text-lg font-semibold text-gray-900 dark:text-white mb-2'>
            Quick Actions
          </Text>
          <View className='flex-row gap-4'>
            <Button onPress={() => {}} className='flex-1'>
              New Invoice
            </Button>
            <Button variant='secondary' onPress={() => {}} className='flex-1'>
              View Schedule
            </Button>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
