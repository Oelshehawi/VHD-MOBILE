import React, { useState, useEffect, useMemo } from 'react';
import {
  Modal,
  View,
  TouchableOpacity,
  Text,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
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

  // Zoom and pan animation values
  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedScale = useSharedValue(1);

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

  // Reset zoom when image changes
  useEffect(() => {
    if (visible) {
      setCurrentIndex(imageIndex);
      scale.value = 1;
      translateX.value = 0;
      translateY.value = 0;
      savedScale.value = 1;
      setIsLoading(true);
    }
  }, [imageIndex, visible]);

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

  // Animated style for zoom and pan
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
  }));

  // Pan gesture for dragging when zoomed
  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      if (scale.value > 1) {
        translateX.value = event.translationX;
        translateY.value = event.translationY;
      }
    })
    .onEnd(() => {
      // Reset position if not zoomed
      if (scale.value <= 1) {
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
      }
    });

  // Pinch gesture for zooming
  const pinchGesture = Gesture.Pinch()
    .onUpdate((event) => {
      scale.value = savedScale.value * event.scale;
    })
    .onEnd(() => {
      savedScale.value = scale.value;
    });

  // Double tap to zoom
  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onStart(() => {
      if (doubleTapToZoomEnabled) {
        if (scale.value > 1) {
          // Zoom out
          scale.value = withSpring(1);
          translateX.value = withSpring(0);
          translateY.value = withSpring(0);
          savedScale.value = 1;
        } else {
          // Zoom in
          scale.value = withSpring(2);
          savedScale.value = 2;
        }
      }
    });

  // Swipe to close
  const swipeGesture = Gesture.Pan()
    .onUpdate((event) => {
      if (swipeToCloseEnabled && scale.value <= 1) {
        translateY.value = event.translationY;
      }
    })
    .onEnd((event) => {
      if (swipeToCloseEnabled && scale.value <= 1) {
        const threshold = 100;
        if (Math.abs(event.translationY) > threshold && event.velocityY > 500) {
          runOnJS(onRequestClose)();
        } else {
          translateY.value = withSpring(0);
        }
      }
    });

  // Combine gestures
  const composedGesture = Gesture.Simultaneous(
    swipeGesture,
    Gesture.Simultaneous(pinchGesture, panGesture),
    doubleTapGesture
  );

  // Navigation functions
  const goToPrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      scale.value = 1;
      translateX.value = 0;
      translateY.value = 0;
      savedScale.value = 1;
      setIsLoading(true);
    }
  };

  const goToNext = () => {
    if (currentIndex < images.length - 1) {
      setCurrentIndex(currentIndex + 1);
      scale.value = 1;
      translateX.value = 0;
      translateY.value = 0;
      savedScale.value = 1;
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

        {/* Image Container */}
        <View className='flex-1 relative'>
          <GestureDetector gesture={composedGesture}>
            <Animated.View
              style={animatedStyle}
              className='flex-1 justify-center items-center'
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
            </Animated.View>
          </GestureDetector>

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
