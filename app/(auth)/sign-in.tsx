import { useSignIn, useAuth, isClerkRuntimeError } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import {
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import React, { useState, useEffect } from 'react';
import { setManagerStatus } from '@/cache';
import { useLocalCredentials } from '@clerk/clerk-expo/local-credentials';
import NetInfo from '@react-native-community/netinfo';

export default function Page() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const { getToken } = useAuth();
  const router = useRouter();
  const { hasCredentials, setCredentials, authenticate, biometricType } =
    useLocalCredentials();

  const [emailAddress, setEmailAddress] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usingSavedCredentials, setUsingSavedCredentials] = useState(false);

  // Monitor network status
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOffline(!state.isConnected);
    });

    return () => unsubscribe();
  }, []);

  // Try biometric login on initial load if available
  useEffect(() => {
    // Only auto-prompt for biometric login if credentials exist
    if (isLoaded && hasCredentials && biometricType) {
      handleBiometricSignIn();
    }
  }, [isLoaded, hasCredentials, biometricType]);

  const handleBiometricSignIn = async () => {
    if (!isLoaded || biometricLoading) return;

    try {
      setBiometricLoading(true);
      setError(null);

      const signInAttempt = await authenticate();

      if (signInAttempt.status === 'complete') {
        await setActive({ session: signInAttempt.createdSessionId });

        // Get manager status token after session is active
        const token = await getToken({ template: 'manager-status' });
        if (token) {
          await setManagerStatus(token);
        }

        router.replace('/');
      } else {
        console.error(
          '❌ Biometric sign in incomplete:',
          JSON.stringify(signInAttempt, null, 2)
        );
        setError(
          'Unable to sign in with biometrics. Please use email and password.'
        );
      }
    } catch (err: any) {
      console.error('❌ Biometric sign in error:', err);

      // Don't show an error message if user cancelled biometric auth
      if (
        err.message &&
        !err.message.includes('canceled') &&
        !err.message.includes('cancelled')
      ) {
        setError(
          'Biometric authentication failed. Please use email and password.'
        );
      }
    } finally {
      setBiometricLoading(false);
    }
  };

  const onSignInPress = React.useCallback(async () => {
    if (!isLoaded) {
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      if (!emailAddress || !password) {
        setError('Please enter both email and password');
        return;
      }

      // Check if offline before attempting sign in
      if (isOffline) {
        setError(
          'You appear to be offline. Please check your connection and try again.'
        );
        return;
      }

      const signInAttempt = await signIn.create({
        identifier: emailAddress,
        password,
      });

      if (signInAttempt.status === 'complete') {
        // Save credentials for biometric login
        await setCredentials({
          identifier: emailAddress,
          password,
        });

        await setActive({ session: signInAttempt.createdSessionId });

        // Get manager status token after session is active
        const token = await getToken({ template: 'manager-status' });
        if (token) {
          await setManagerStatus(token);
        }

        router.replace('/');
      } else {
        console.error(
          '❌ Sign in incomplete:',
          JSON.stringify(signInAttempt, null, 2)
        );
        setError('Unable to sign in. Please check your credentials.');
      }
    } catch (err: any) {
      console.error('❌ Sign in error:', err);

      if (isClerkRuntimeError(err)) {
        if (err.code === 'network_error') {
          setError('Network error occurred. Please check your connection.');
        } else {
          setError(err.message || 'An error occurred during sign in');
        }
      } else {
        setError(
          err?.errors?.[0]?.message || 'An error occurred during sign in'
        );
      }
    } finally {
      setIsLoading(false);
    }
  }, [isLoaded, emailAddress, password, getToken, isOffline]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className='flex-1 bg-darkGray'
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps='handled'
      >
        <View className='flex-1 justify-between px-6 py-12'>
          {/* Network Status Banner */}
          {isOffline && (
            <View className='bg-yellow-600/20 p-3 rounded-lg mb-4'>
              <Text className='text-yellow-200 text-center'>
                You are currently offline. Some features may be limited.
              </Text>
            </View>
          )}

          {/* Logo and Welcome Section */}
          <View className='flex items-center gap-4 mb-12'>
            <View className='w-24 h-24 bg-darkGreen rounded-2xl items-center justify-center mb-4'>
              <Text className='text-4xl'>🏠</Text>
            </View>
            <Text className='text-3xl font-bold text-darkWhite text-center'>
              Welcome Back
            </Text>
            <Text className='text-gray-400 text-center'>
              Sign in to continue to VHD App
            </Text>
          </View>

          {/* Biometric Sign In Button */}
          {hasCredentials && biometricType && (
            <View className='mb-8'>
              <TouchableOpacity
                className={`bg-darkGreen py-4 rounded-lg flex-row justify-center items-center ${
                  biometricLoading ? 'opacity-70' : ''
                }`}
                onPress={handleBiometricSignIn}
                disabled={biometricLoading}
              >
                {biometricLoading ? (
                  <ActivityIndicator color='#fff' />
                ) : (
                  <>
                    <Text className='text-center text-darkWhite font-semibold mr-2'>
                      {biometricType === 'face-recognition'
                        ? 'Sign in with Face ID'
                        : 'Sign in with Touch ID'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
              <Text className='text-center text-gray-400 mt-2 text-sm'>
                or use your email and password
              </Text>
            </View>
          )}

          {/* Form Section */}
          <View className='flex gap-6'>
            <View className='flex gap-4'>
              <View>
                <Text className='text-darkWhite mb-2 font-medium'>
                  Email Address
                </Text>
                <TextInput
                  className='w-full bg-lightGray px-4 py-3 rounded-lg text-darkGray'
                  autoCapitalize='none'
                  value={emailAddress}
                  placeholder='Enter your email'
                  placeholderTextColor='#667085'
                  onChangeText={(text) => {
                    setEmailAddress(text);
                    setError(null);
                  }}
                  keyboardType='email-address'
                  autoComplete='email'
                />
              </View>

              <View>
                <Text className='text-darkWhite mb-2 font-medium'>
                  Password
                </Text>
                <TextInput
                  className='w-full bg-lightGray px-4 py-3 rounded-lg text-darkGray'
                  value={password}
                  placeholder='Enter your password'
                  placeholderTextColor='#667085'
                  secureTextEntry={true}
                  onChangeText={(text) => {
                    setPassword(text);
                    setError(null);
                  }}
                  autoComplete='password'
                />
              </View>
            </View>

            {error && (
              <Text className='text-red-500 text-sm text-center'>{error}</Text>
            )}

            <TouchableOpacity
              className={`bg-darkGreen py-4 rounded-lg ${
                isLoading ? 'opacity-70' : ''
              }`}
              onPress={onSignInPress}
              disabled={isLoading || !emailAddress || !password}
            >
              {isLoading ? (
                <ActivityIndicator color='#fff' />
              ) : (
                <Text className='text-center text-darkWhite font-semibold'>
                  Sign in
                </Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Footer */}
          <View className='mt-8'>
            <Text className='text-gray-400 text-center text-sm'>
              © 2024 VHD. All rights reserved.
            </Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
