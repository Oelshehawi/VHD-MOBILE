import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSignIn, isClerkRuntimeError } from '@clerk/clerk-expo';
import { useLocalCredentials } from '@clerk/clerk-expo/local-credentials';
import Ionicons from '@expo/vector-icons/Ionicons';

export default function Page() {
  const router = useRouter();
  const { signIn, setActive, isLoaded } = useSignIn();
  const { hasCredentials, setCredentials, authenticate, biometricType } =
    useLocalCredentials();

  const [emailAddress, setEmailAddress] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);


  const handleBiometricSignIn = async () => {
    if (!isLoaded) return;
    setIsLoading(true);
    setError(null);

    try {
      await onSignInPress(true);
    } catch (err) {
      console.error('Biometric authentication failed:', err);
      setError(
        'Biometric authentication failed. Please try again or use email/password.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const onSignInPress = async (useLocal: boolean) => {
    if (!isLoaded) return;
    setIsLoading(true);
    setError(null);

    // Check required fields for email/password sign-in
    if (!useLocal && (!emailAddress || !password)) {
      setError('Please enter both email and password');
      setIsLoading(false);
      return;
    }

    try {
      const signInAttempt =
        hasCredentials && useLocal
          ? await authenticate()
          : await signIn.create({
              identifier: emailAddress,
              password,
            });

      // If sign-in process is complete,
      // set the created session as active and redirect the user
      if (signInAttempt.status === 'complete') {

        if (!useLocal) {
          await setCredentials({
            identifier: emailAddress,
            password,
          });
        }

        await setActive({ session: signInAttempt.createdSessionId });
        router.replace('/');
      } else {
        // If the status is not complete, check why.
        console.error(JSON.stringify(signInAttempt, null, 2));
        setError('Sign-in incomplete. Please try again.');
      }
    } catch (err: any) {
      // Better error handling with specific messages for different error types
      if (isClerkRuntimeError(err)) {
        if (err.code === 'network_error') {
          console.error('Network error occurred!');
          setError(
            'Network error occurred. Please check your connection and try again.'
          );
        } else {
          setError(err.message || 'An error occurred during sign in');
        }
      } else {
        console.error('Sign-in error:', JSON.stringify(err, null, 2));
        setError(
          err.errors?.[0]?.message || 'Sign-in failed. Please try again.'
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className='flex-1'
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        className='bg-white dark:bg-gray-900'
      >
        <View className='flex-1 mt-36 p-8'>
          <View className='mb-8 items-center'>
            <Image
              source={require('@/assets/images/icon.png')}
              className='h-20 w-80 mb-2'
              resizeMode='contain'
            />
          </View>

          <Text className='text-2xl font-bold mb-6 text-center text-gray-800 dark:text-white'>
            Sign In
          </Text>

          {error && (
            <View className='mb-4 p-3 bg-red-50 border border-red-200 rounded-lg'>
              <Text className='text-red-700'>{error}</Text>
            </View>
          )}

          {/* Biometric Sign In Option */}
          {hasCredentials && biometricType && (
            <TouchableOpacity
              className='mb-6 flex-row items-center justify-center bg-green-600 py-3 px-4 rounded-lg'
              onPress={handleBiometricSignIn}
              disabled={isLoading}
            >
              <Ionicons name='finger-print' size={24} color='white' />
              <Text className='text-white font-bold ml-2'>
                Sign in with{' '}
                {biometricType === 'fingerprint' ? 'Fingerprint' : 'Face ID'}
              </Text>
            </TouchableOpacity>
          )}

          <Text className='text-gray-600 dark:text-gray-300 mb-2'>
            Email Address
          </Text>
          <TextInput
            autoCapitalize='none'
            value={emailAddress}
            onChangeText={setEmailAddress}
            className='bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white py-3 px-4 rounded-lg mb-4'
          />

          <Text className='text-gray-600 dark:text-gray-300 mb-2'>
            Password
          </Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            className='bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white py-3 px-4 rounded-lg mb-6'
          />

          <TouchableOpacity
            className='bg-green-600 py-3 px-4 rounded-lg'
            onPress={() => onSignInPress(false)}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color='white' />
            ) : (
              <Text className='text-white font-bold text-center'>Sign In</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
