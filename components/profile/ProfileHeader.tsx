import { Image } from 'react-native';
import { Card, CardContent } from '@/components/ui/Card';
import { Text } from '@/components/ui/text';

interface ProfileHeaderProps {
  imageUrl?: string | null;
  fullName?: string | null;
  username?: string | null;
  email?: string | null;
}

export function ProfileHeader({ imageUrl, fullName, username, email }: ProfileHeaderProps) {
  return (
    <Card className='mb-4'>
      <CardContent className='items-center'>
        {imageUrl && (
          <Image
            source={{ uri: imageUrl }}
            className='w-24 h-24 rounded-full mb-4 border-2 border-amber-300 dark:border-amber-500'
          />
        )}
        <Text variant='h4' className='mb-2 text-[#14110F] dark:text-white'>
          {fullName || username}
        </Text>
        <Text variant='muted' className='mb-1'>
          {email}
        </Text>
      </CardContent>
    </Card>
  );
}
