import { ActivityIndicator, Text, View, Modal } from "react-native";




/**
 * LoadingModal component to display processing state
 */
interface LoadingModalProps {
    visible: boolean;
    type: 'before' | 'after';
  }
  
  export function LoadingModal({ visible, type }: LoadingModalProps) {
    return (
      <Modal transparent={true} visible={visible} animationType='fade'>
        <View className='flex-1 justify-center items-center bg-black/30'>
          <View className='bg-white rounded-2xl p-6 w-4/5 items-center shadow-lg'>
            <ActivityIndicator
              size='large'
              color={type === 'before' ? '#3b82f6' : '#10b981'}
            />
            <Text className='text-base font-semibold mt-3 mb-1'>
              Processing...
            </Text>
            <Text className='text-sm text-gray-500 text-center'>
              Please wait while we process your photos.
            </Text>
          </View>
        </View>
      </Modal>
    );
  }