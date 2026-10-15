import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { usePowerSync } from '@powersync/react-native';
import { useSystem } from '@/services/database/System';
import { deletePhotoWithAttachment } from '@/services/photos/deletePhoto';
import type { DocumentationPhoto } from '@/services/data/photos';
import { FastImageViewer } from '@/components/common/FastImageViewer';
import type { CaptureType } from '@/utils/equipmentCategories';
import { captureTypeLabel } from '@/utils/photoImport';
import { resolvePhotoUri } from '@/utils/photoUri';
import { showToast } from '@/utils/photos';
import { PhotoGrid } from './PhotoGrid';
import { DeletePhotoModal } from './DeletePhotoModal';

interface EquipmentPhotoSectionProps {
  type: CaptureType;
  photos: ReadonlyArray<DocumentationPhoto>;
  jobTitle: string;
  categoryLabel: string;
  /** Optional buckets (Other, Uncategorized) never show "needs photo". */
  optional?: boolean;
  /** Hides Camera/Gallery when the account can't own new photos. */
  canAdd?: boolean;
  onCamera: () => void;
  onGallery: () => void;
}

export function EquipmentPhotoSection({
  type,
  photos,
  jobTitle,
  categoryLabel,
  optional = false,
  canAdd = true,
  onCamera,
  onGallery
}: EquipmentPhotoSectionProps) {
  const powerSync = usePowerSync();
  const system = useSystem();
  const [photoToDelete, setPhotoToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null);

  const label = captureTypeLabel(type);
  const isBefore = type === 'before';

  const galleryImages = useMemo(
    () =>
      galleryIndex === null
        ? []
        : photos.map((photo) => ({
            uri: resolvePhotoUri(photo, system?.attachmentQueue),
            title: `${categoryLabel} · ${label}`,
            type
          })),
    [galleryIndex, photos, system?.attachmentQueue, categoryLabel, label, type]
  );

  const getGallerySubtitle = useCallback(
    (index: number) => `${label} photo ${index + 1} of ${photos.length}`,
    [label, photos.length]
  );

  const handleDeleteRequest = useCallback((photoId: string) => {
    setGalleryIndex(null);
    setPhotoToDelete(photoId);
  }, []);

  const handleDeleteConfirm = async () => {
    if (!photoToDelete || !powerSync || isDeleting) return;

    try {
      setIsDeleting(true);
      await deletePhotoWithAttachment(powerSync, system?.attachmentQueue, photoToDelete);
      showToast('Photo deleted');
      setPhotoToDelete(null);
    } catch {
      Alert.alert('Error', 'Failed to delete photo. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  const accent = isBefore
    ? 'bg-blue-600 active:bg-blue-700 dark:bg-blue-500'
    : 'bg-emerald-600 active:bg-emerald-700 dark:bg-emerald-500';

  return (
    <View className='mb-6'>
      <View className='mb-3 flex-row items-center gap-2'>
        <View
          className={`rounded-xl px-2 py-1 ${isBefore ? 'bg-blue-100 dark:bg-blue-500/20' : 'bg-green-100 dark:bg-green-500/20'}`}
        >
          <Text
            className={`text-xs font-semibold ${isBefore ? 'text-blue-800 dark:text-blue-200' : 'text-green-800 dark:text-green-200'}`}
          >
            {label}
          </Text>
        </View>
        <Text className='text-base font-semibold text-[#14110F] dark:text-white'>
          {photos.length} photo{photos.length === 1 ? '' : 's'}
        </Text>
        {photos.length === 0 && !optional && (
          <View className='rounded-full bg-amber-100 px-2 py-0.5 dark:bg-amber-500/20'>
            <Text className='text-xs font-semibold text-amber-900 dark:text-amber-200'>
              needs photo
            </Text>
          </View>
        )}
      </View>

      {canAdd && (
        <View className='flex-row gap-3'>
          <Pressable
            onPress={onCamera}
            accessibilityLabel={`Take ${label.toLowerCase()} photos of ${categoryLabel}`}
            className={`min-h-14 flex-1 flex-row items-center justify-center gap-2 rounded-xl ${accent}`}
          >
            <Ionicons name='camera' size={20} color='#FFFFFF' />
            <Text className='text-base font-bold text-white'>Camera</Text>
          </Pressable>
          <Pressable
            onPress={onGallery}
            accessibilityLabel={`Add ${label.toLowerCase()} photos of ${categoryLabel} from gallery`}
            className='min-h-14 flex-1 flex-row items-center justify-center gap-2 rounded-xl border border-black/15 bg-white active:bg-gray-50 dark:border-white/20 dark:bg-[#16140F]'
          >
            <Ionicons name='images-outline' size={20} color={isBefore ? '#2563EB' : '#059669'} />
            <Text className='text-base font-bold text-[#14110F] dark:text-white'>Gallery</Text>
          </Pressable>
        </View>
      )}

      <PhotoGrid
        photos={photos}
        onDeletePhoto={handleDeleteRequest}
        onPhotoPress={setGalleryIndex}
      />

      {photoToDelete !== null && (
        <DeletePhotoModal
          visible
          onClose={() => setPhotoToDelete(null)}
          onConfirm={handleDeleteConfirm}
          isDeleting={isDeleting}
        />
      )}

      {galleryIndex !== null && (
        <FastImageViewer
          images={galleryImages}
          imageIndex={galleryIndex}
          visible
          onRequestClose={() => setGalleryIndex(null)}
          swipeToCloseEnabled
          doubleTapToZoomEnabled
          title={jobTitle}
          getSubtitle={getGallerySubtitle}
        />
      )}
    </View>
  );
}
