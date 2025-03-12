import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';

export default function AuthRoutesLayout() {
  const { isSignedIn } = useAuth();


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
