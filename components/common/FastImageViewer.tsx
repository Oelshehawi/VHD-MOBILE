import React, { useState, useMemo } from 'react';
import {
  Modal,
  View,
  TouchableOpacity,
  Text,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { Zoomable } from '@likashefqet/react-native-image-zoom';
import { FastImageViewerHeader } from './FastImageViewerHeader';
import {
  buildCloudinaryUrlMobile,
  pickCloudinaryWidth,
  getCloudinaryCacheKey,
} from '@/utils/cloudinaryUrl.native';

// Simplified props interface
export interface FastImageViewerProps {
  images: { uri: string; title?: string; type?: string }[];
  imageIndex: number;
  visible: boolean;
  onRequestClose: () => void;
  swipeToCloseEnabled?: boolean;
  doubleTapToZoomEnabled?: boolean;
  title?: string;
  getSubtitle?: (index: number, currentImage: any) => string;
}

// Cloudinary configuration
const CLOUD_NAME = 'dhu4yrn5k';

/**
 * A custom image viewer component using expo-image with zoom capabilities
 */
export const FastImageViewer: React.FC<FastImageViewerProps> = ({
  images,
  imageIndex = 0,
  visible,
  onRequestClose,
  swipeToCloseEnabled = true,
  doubleTapToZoomEnabled = true,
  title,
  getSubtitle,
  ...otherProps
}) => {
  const [currentIndex, setCurrentIndex] = useState(imageIndex);
  const [isLoading, setIsLoading] = useState(true);

  // Calculate optimal width for viewer images
  const targetWidth = useMemo(() => {
    const screenWidth = Math.min(Dimensions.get('window').width, 1080);
    return pickCloudinaryWidth(screenWidth);
  }, []);

  // Transform images with Cloudinary optimization
  const optimizedImages = useMemo(() => {
    return images.map((img) => {
      const transformedUri = buildCloudinaryUrlMobile({
        urlOrPublicId: img.uri,
        cloudName: CLOUD_NAME,
        width: targetWidth,
      });

      return {
        ...img,
        uri: transformedUri,
        cacheKey: getCloudinaryCacheKey(img.uri, targetWidth),
      };
    });
  }, [images, targetWidth]);

  // Create subtitle for the header
  const getHeaderSubtitle = () => {
    if (!images || !images[currentIndex]) {
      return 'Loading...';
    }

    if (getSubtitle) {
      return getSubtitle(currentIndex, images[currentIndex]);
    } else if (images[currentIndex]?.type) {
      return `${images[currentIndex].type} Photo ${currentIndex + 1} of ${
        images.length
      }`;
    } else {
      return `Photo ${currentIndex + 1} of ${images.length}`;
    }
  };

  // Navigation functions
  const goToPrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setIsLoading(true);
    }
  };

  const goToNext = () => {
    if (currentIndex < images.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setIsLoading(true);
    }
  };

  if (!visible || !optimizedImages[currentIndex]) return null;

  const currentImage = optimizedImages[currentIndex];

  return (
    <Modal
      visible={visible}
      onRequestClose={onRequestClose}
      animationType='fade'
      presentationStyle='overFullScreen'
      transparent={true}
    >
      <View className='flex-1 bg-black'>
        {/* Header */}
        <FastImageViewerHeader
          title={title}
          subtitle={getHeaderSubtitle()}
          onClose={onRequestClose}
        />

        {/* Image Container with Zoomable */}
        <View className='flex-1 relative'>
          <Zoomable
            minZoom={1}
            maxZoom={4}
            doubleTapZoom={doubleTapToZoomEnabled ? 2 : 1}
          >
            <Image
              source={{
                uri: currentImage.uri,
                cacheKey: currentImage.cacheKey,
              }}
              style={{
                width: Dimensions.get('window').width,
                height: Dimensions.get('window').height * 0.8,
              }}
              contentFit='contain'
              cachePolicy='disk'
              onLoad={() => setIsLoading(false)}
              onError={() => setIsLoading(false)}
            />
          </Zoomable>

          {/* Loading indicator */}
          {isLoading && (
            <View className='absolute inset-0 justify-center items-center bg-black/50'>
              <ActivityIndicator size='large' color='#ffffff' />
            </View>
          )}
        </View>

        {/* Navigation arrows */}
        {images.length > 1 && (
          <>
            {currentIndex > 0 && (
              <TouchableOpacity
                className='absolute left-4 top-1/2 -translate-y-4 bg-black/50 rounded-full w-10 h-10 justify-center items-center'
                onPress={goToPrevious}
              >
                <Text className='text-white text-xl font-bold'>‹</Text>
              </TouchableOpacity>
            )}
            {currentIndex < images.length - 1 && (
              <TouchableOpacity
                className='absolute right-4 top-1/2 -translate-y-4 bg-black/50 rounded-full w-10 h-10 justify-center items-center'
                onPress={goToNext}
              >
                <Text className='text-white text-xl font-bold'>›</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </View>
    </Modal>
  );
};
