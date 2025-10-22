import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function AuthRoutesLayout() {
  const { isSignedIn } = useAuth();

  // Redirect to main app if signed in
  if (isSignedIn) {
    return <Redirect href={'/'} />;
  }

  // Show auth stack if not signed in
  return (
    <SafeAreaProvider>
      <Stack
        screenOptions={{
          headerShown: false,
        }}
      />
    </SafeAreaProvider>
  );
}
