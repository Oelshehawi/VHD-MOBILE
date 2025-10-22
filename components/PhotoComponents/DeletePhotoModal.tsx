import { Modal, Text, View, TouchableOpacity, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
/**
 * DeletePhotoModal component to confirm photo deletion
 */
interface DeletePhotoModalProps {
    visible: boolean;
    onClose: () => void;
    onConfirm: () => void;
    isDeleting: boolean;
  }
  
  export function DeletePhotoModal({
    visible,
    onClose,
    onConfirm,
    isDeleting,
  }: DeletePhotoModalProps) {
    return (
      <Modal
        transparent={true}
        visible={visible}
        onRequestClose={() => !isDeleting && onClose()}
        animationType='fade'
      >
        <SafeAreaView className='flex-1 justify-center items-center bg-black/50'>
          <View className='bg-white rounded-2xl w-[85%] p-6 shadow-md'>
            <Text className='text-lg font-bold mb-3 text-center'>
              Delete Photo
            </Text>
            <Text className='text-sm text-gray-600 mb-5 text-center leading-5'>
              Are you sure you want to delete this photo? This cannot be undone.
            </Text>
            <View className='flex-row justify-end gap-3'>
              <TouchableOpacity
                onPress={onClose}
                className='py-2 px-3'
                disabled={isDeleting}
              >
                <Text
                  className={`font-semibold ${
                    isDeleting ? 'text-gray-400' : 'text-blue-500'
                  }`}
                >
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onConfirm}
                className={`py-2 px-4 rounded-lg ${
                  isDeleting ? 'bg-red-300' : 'bg-red-500'
                }`}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <View className='flex-row items-center'>
                    <ActivityIndicator size='small' color='#ffffff' />
                    <Text className='text-white font-semibold ml-2'>
                      Deleting...
                    </Text>
                  </View>
                ) : (
                  <Text className='text-white font-semibold'>Delete</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    );
  }
  
