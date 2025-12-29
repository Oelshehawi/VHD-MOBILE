import { Image } from 'react-native';
import { Card, CardContent } from '@/components/ui/Card';
import { Text } from '@/components/ui/text';

interface ProfileHeaderProps {
  imageUrl?: string | null;
  fullName?: string | null;
  username?: string | null;
  email?: string | null;
}

export function ProfileHeader({
  imageUrl,
  fullName,
  username,
  email,
}: ProfileHeaderProps) {
  return (
    <Card className='mb-4'>
      <CardContent className='items-center'>
        {imageUrl && (
          <Image
            source={{ uri: imageUrl }}
            className='w-24 h-24 rounded-full mb-4 border-2 border-gray-200 dark:border-gray-800'
          />
        )}
        <Text variant='h4' className='mb-2'>
          {fullName || username}
        </Text>
        <Text variant='muted' className='mb-1'>
          {email}
        </Text>
      </CardContent>
    </Card>
  );
}
