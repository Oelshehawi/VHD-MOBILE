import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { useEffect, useState } from 'react';
import { getOfflineSession } from '../../cache';

export default function AuthRoutesLayout() {
  const { isSignedIn } = useAuth();
  const [hasOfflineSession, setHasOfflineSession] = useState<boolean | null>(
    null
  );

  useEffect(() => {
    const checkOfflineSession = async () => {
      const offlineSession = await getOfflineSession();
      setHasOfflineSession(!!offlineSession);
    };
    checkOfflineSession();
  }, []);

  // Wait until we've checked both online and offline auth status
  if (hasOfflineSession === null) {
    return null;
  }

  if (isSignedIn || hasOfflineSession) {
    return <Redirect href={'/'} />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    />
  );
}
