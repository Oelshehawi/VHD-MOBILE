import { Modal, TouchableOpacity, View, Text, Image, Linking, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

interface ReviewQRCodeModalProps {
  visible: boolean;
  onClose: () => void;
  reviewUrl: string;
}

export function ReviewQRCodeModal({ visible, onClose, reviewUrl }: ReviewQRCodeModalProps) {
  const colorScheme = useColorScheme();
  const iconColor = colorScheme === 'dark' ? '#F2EFEA' : '#6B7280';
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=420x420&margin=16&data=${encodeURIComponent(reviewUrl)}`;

  return (
    <Modal visible={visible} animationType='slide' onRequestClose={onClose}>
      <SafeAreaView className='flex-1 bg-[#F7F5F1] dark:bg-gray-950'>
        <View className='flex-row items-center justify-between p-4 bg-[#F7F5F1] dark:bg-gray-950 border-b border-black/10 dark:border-white/10'>
          <TouchableOpacity onPress={onClose} className='p-2 rounded-full bg-white dark:bg-[#16140F] border border-black/10 dark:border-white/10'>
            <Ionicons name='arrow-back' size={22} color={iconColor} />
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

          <View className='bg-white dark:bg-[#16140F] rounded-2xl p-5 shadow-sm border border-black/10 dark:border-white/10 w-full max-w-[360px] items-center'>
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
            className='mt-6 bg-[#14110F] dark:bg-amber-400 px-6 py-4 rounded-xl w-full max-w-[360px]'
          >
            <Text className='text-white dark:text-[#14110F] text-center font-semibold text-base'>Open Review Link</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}
