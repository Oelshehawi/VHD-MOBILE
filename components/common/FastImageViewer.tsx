import React, {
  useState,
  useMemo,
  useEffect,
  useRef,
  useCallback,
} from 'react';
import {
  Modal,
  View,
  TouchableOpacity,
  Text,
  Dimensions,
  ActivityIndicator,
  Platform,
  StyleSheet,
} from 'react-native';
import { Image } from 'expo-image';
import {
  Zoomable,
  ZoomableRef,
  ZOOM_TYPE,
} from '@likashefqet/react-native-image-zoom';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';
import { FastImageViewerHeader } from './FastImageViewerHeader';
import {
  SafeAreaProvider,
  initialWindowMetrics,
} from 'react-native-safe-area-context';
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
  minScale?: number;
  maxScale?: number;
  doubleTapScale?: number;
  onZoomInteractionStart?: () => void;
  onZoomInteractionEnd?: () => void;
  onDoubleTap?: (zoomType: ZOOM_TYPE) => void;
}

// Cloudinary configuration
const CLOUD_NAME = 'dhu4yrn5k';

const styles = StyleSheet.create({
  viewerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  zoomable: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
});

/**
 * A custom image viewer component using expo-image with zoom capabilities
 */
const FastImageViewerComponent: React.FC<FastImageViewerProps> = ({
  images,
  imageIndex = 0,
  visible,
  onRequestClose,
  swipeToCloseEnabled = true,
  doubleTapToZoomEnabled = true,
  title,
  getSubtitle,
  minScale = 1,
  maxScale = 5,
  doubleTapScale = 3,
  onZoomInteractionStart,
  onZoomInteractionEnd,
  onDoubleTap,
}) => {
  const zoomableRef = useRef<ZoomableRef | null>(null);
  const [currentIndex, setCurrentIndex] = useState(imageIndex);
  const [isLoading, setIsLoading] = useState(true);
  const [isZoomed, setIsZoomed] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setCurrentIndex(imageIndex);
    setIsLoading(true);
  }, [imageIndex, visible]);

  useEffect(() => {
    if (!visible) return;
    setIsLoading(true);
    requestAnimationFrame(() => {
      zoomableRef.current?.reset?.();
    });
  }, [currentIndex, visible]);

  const windowDimensions = Dimensions.get('window');
  const viewerWidth = windowDimensions.width;
  const viewerHeight = windowDimensions.height * 0.8;

  // Calculate optimal width for viewer images
  const targetWidth = useMemo(() => {
    const screenWidth = Math.min(viewerWidth, 1080);
    return pickCloudinaryWidth(screenWidth);
  }, [viewerWidth]);

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
  const goToPrevious = useCallback(() => {
    setCurrentIndex((prev) => {
      if (prev <= 0) {
        return prev;
      }
      setIsLoading(true);
      return prev - 1;
    });
  }, []);

  const goToNext = useCallback(() => {
    setCurrentIndex((prev) => {
      if (prev >= images.length - 1) {
        return prev;
      }
      setIsLoading(true);
      return prev + 1;
    });
  }, [images.length]);

  // Zoom interaction handlers
  const handleZoomStart = useCallback(() => {
    setIsZoomed(true);
    onZoomInteractionStart?.();
  }, [onZoomInteractionStart]);

  const handleZoomEnd = useCallback(() => {
    // Check if we're back to minimum zoom after interaction ends
    setTimeout(() => {
      const info = zoomableRef.current?.getInfo?.();
      if (info && info.transformations.scale <= minScale + 0.1) {
        setIsZoomed(false);
      }
    }, 100);
    onZoomInteractionEnd?.();
  }, [onZoomInteractionEnd, minScale]);

  const handleDoubleTap = useCallback(
    (zoomType: ZOOM_TYPE) => {
      onDoubleTap?.(zoomType);
    },
    [onDoubleTap]
  );

  const handleImageLoad = useCallback(() => {
    setIsLoading(false);
  }, []);

  const handleImageError = useCallback(() => {
    setIsLoading(false);
  }, []);

  // Swipe gesture using modern Gesture API
  const swipeGesture = Gesture.Pan()
    .enabled(images.length > 1 && !isZoomed)
    .minPointers(1)
    .maxPointers(1)
    .onEnd((event) => {
      const { translationX, velocityX } = event;
      const swipeThreshold = 50;
      const velocityThreshold = 500;

      // Swipe left to go to next image
      if (
        translationX < -swipeThreshold ||
        velocityX < -velocityThreshold
      ) {
        if (currentIndex < images.length - 1) {
          scheduleOnRN(goToNext);
        }
      }
      // Swipe right to go to previous image
      else if (
        translationX > swipeThreshold ||
        velocityX > velocityThreshold
      ) {
        if (currentIndex > 0) {
          scheduleOnRN(goToPrevious);
        }
      }
    });

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
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <View className='flex-1 bg-black'>
          {/* Header */}
          <FastImageViewerHeader
            title={title}
            subtitle={getHeaderSubtitle()}
            onClose={onRequestClose}
          />

          {/* Image Container with Zoomable */}
          <View
            style={[
              styles.viewerContainer,
              { width: viewerWidth, height: viewerHeight },
            ]}
          >
            <GestureDetector gesture={swipeGesture}>
              <View style={{ flex: 1 }}>
                <Zoomable
                  ref={zoomableRef}
                  minScale={minScale}
                  maxScale={maxScale}
                  doubleTapScale={doubleTapScale}
                  isDoubleTapEnabled={doubleTapToZoomEnabled}
                  isSingleTapEnabled={false}
                  isPanEnabled={true}
                  isPinchEnabled={true}
                  maxPanPointers={2}
                  onInteractionStart={handleZoomStart}
                  onInteractionEnd={handleZoomEnd}
                  onDoubleTap={handleDoubleTap}
                  style={styles.zoomable}
                  key={`${
                    currentImage.cacheKey ?? currentImage.uri
                  }-${currentIndex}`}
                >
                  <Image
                    source={{
                      uri: currentImage.uri,
                      cacheKey: currentImage.cacheKey,
                    }}
                    style={{ width: viewerWidth, height: viewerHeight }}
                    contentFit='contain'
                    cachePolicy='disk'
                    onLoad={handleImageLoad}
                    onError={handleImageError}
                  />
                </Zoomable>
              </View>
            </GestureDetector>

            {/* Loading indicator */}
            {isLoading && (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size='large' color='#ffffff' />
              </View>
            )}
          </View>

          {/* Navigation arrows */}
          {images.length > 1 && (
            <>
              {currentIndex > 0 && (
                <TouchableOpacity
                  className='absolute left-4 bottom-20 -translate-y-4 bg-black/50 rounded-full w-10 h-10 justify-center items-center'
                  onPress={goToPrevious}
                >
                  <Text className='text-white text-xl font-bold'>‹</Text>
                </TouchableOpacity>
              )}
              {currentIndex < images.length - 1 && (
                <TouchableOpacity
                  className='absolute right-4 bottom-20 -translate-y-4 bg-black/50 rounded-full w-10 h-10 justify-center items-center'
                  onPress={goToNext}
                >
                  <Text className='text-white text-xl font-bold'>›</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </Modal>
  );
};

// Export wrapped component for Android modal compatibility
export const FastImageViewer = FastImageViewerComponent;
