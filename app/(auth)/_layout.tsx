import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';

export default function AuthRoutesLayout() {
  const { isSignedIn, isLoaded } = useAuth();


  // Wait for Clerk to load (handles both online/offline states internally)
  if (!isLoaded) {
    return null;
  }

  // Redirect to main app if signed in
  if (isSignedIn) {
    return <Redirect href={'/'} />;
  }

  // Show auth stack if not signed in
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    />
  );
}
