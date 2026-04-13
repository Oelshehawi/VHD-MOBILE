import { Modal, TouchableOpacity, View, Text, Image, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

interface ReviewQRCodeModalProps {
  visible: boolean;
  onClose: () => void;
  reviewUrl: string;
}

export function ReviewQRCodeModal({ visible, onClose, reviewUrl }: ReviewQRCodeModalProps) {
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=420x420&margin=16&data=${encodeURIComponent(reviewUrl)}`;

  return (
    <Modal visible={visible} animationType='slide' onRequestClose={onClose}>
      <SafeAreaView className='flex-1 bg-gray-100 dark:bg-gray-900'>
        <View className='flex-row items-center justify-between p-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700'>
          <TouchableOpacity onPress={onClose} className='p-2 rounded-full bg-gray-100 dark:bg-gray-700'>
            <Ionicons name='arrow-back' size={22} color='#6B7280' />
          </TouchableOpacity>
          <Text className='text-lg font-bold text-gray-900 dark:text-gray-100'>Leave a Review</Text>
          <View className='w-10' />
        </View>

        <View className='flex-1 items-center justify-center p-6'>
          <Text className='text-xl font-bold text-gray-900 dark:text-white text-center mb-2'>
            Scan to Review Us on Google
          </Text>
          <Text className='text-gray-600 dark:text-gray-300 text-center mb-6'>
            Open your camera and scan the QR code to leave a quick review.
          </Text>

          <View className='bg-white rounded-2xl p-5 shadow-sm border border-gray-200 w-full max-w-[360px] items-center'>
            <Image
              source={{ uri: qrCodeUrl }}
              style={{ width: 280, height: 280 }}
              resizeMode='contain'
            />
          </View>

          <TouchableOpacity
            onPress={() => {
              Linking.openURL(reviewUrl).catch(() => {});
            }}
            className='mt-6 bg-darkGreen px-6 py-4 rounded-xl w-full max-w-[360px]'
          >
            <Text className='text-white text-center font-semibold text-base'>Open Review Link</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}
