import { useSignIn } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import React from 'react';

export default function Page() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const router = useRouter();

  const [emailAddress, setEmailAddress] = React.useState('');
  const [password, setPassword] = React.useState('');

  const onSignInPress = React.useCallback(async () => {
    if (!isLoaded) return;

    try {
      const signInAttempt = await signIn.create({
        identifier: emailAddress,
        password,
      });

      if (signInAttempt.status === 'complete') {
        await setActive({ session: signInAttempt.createdSessionId });
        router.replace('/');
      } else {
        console.error(JSON.stringify(signInAttempt, null, 2));
      }
    } catch (err) {
      console.error(JSON.stringify(err, null, 2));
    }
  }, [isLoaded, emailAddress, password]);

  return (
    <View className='flex-1 bg-darkGray justify-center px-6'>
      <View className='flex gap-8'>
        <Text className='text-3xl font-bold text-darkWhite text-center'>
          Welcome Back
        </Text>

        <View className='flex gap-4'>
          <TextInput
            className='w-full bg-lightGray px-4 py-3 rounded-lg text-darkGray'
            autoCapitalize='none'
            value={emailAddress}
            placeholder='Enter email'
            placeholderTextColor='#667085'
            onChangeText={(emailAddress) => setEmailAddress(emailAddress)}
          />
          <TextInput
            className='w-full bg-lightGray px-4 py-3 rounded-lg text-darkGray'
            value={password}
            placeholder='Enter password'
            placeholderTextColor='#667085'
            secureTextEntry={true}
            onChangeText={(password) => setPassword(password)}
          />
        </View>

        <TouchableOpacity
          className='bg-darkGreen py-4 rounded-lg'
          onPress={onSignInPress}
        >
          <Text className='text-center text-darkWhite font-semibold'>
            Sign in
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
