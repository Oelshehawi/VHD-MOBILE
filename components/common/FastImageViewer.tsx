import React, { useState, useEffect, useMemo } from 'react';
import ImageView from 'react-native-image-viewing';
import { Image } from 'expo-image';
import { ActivityIndicator, View, Dimensions } from 'react-native';
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

// Extended ImageView props to make TypeScript happy
interface ExtendedImageViewProps {
  images: { uri: string; title?: string; type?: string }[];
  imageIndex: number;
  visible: boolean;
  onRequestClose: () => void;
  swipeToCloseEnabled?: boolean;
  doubleTapToZoomEnabled?: boolean;
  HeaderComponent?: React.ComponentType<any>;
  FooterComponent?: React.ComponentType<any>;
  onImageIndexChange?: (index: number) => void;
  ImageComponent?: React.ComponentType<any>;
  [key: string]: any; // Allow other props
}

// Cloudinary configuration
const CLOUD_NAME = 'dhu4yrn5k';

/**
 * A simplified image viewer component that uses Expo Image for better performance
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
  // Track the current index separately from props
  const [currentIndex, setCurrentIndex] = useState(imageIndex);

  // Calculate optimal width for viewer images
  const targetWidth = useMemo(() => {
    const screenWidth = Math.min(Dimensions.get('window').width, 1080);
    return pickCloudinaryWidth(screenWidth);
  }, []);

  // Transform images with Cloudinary optimization and stable cache keys
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

  // Update internal index when props change or visibility changes
  useEffect(() => {
    if (visible) {
      setCurrentIndex(imageIndex);
    }
  }, [imageIndex, visible]);

  // Create subtitle for the header based on current index
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

  // Custom image component with loading indicator and cache key support
  const CustomImageComponent = ({ source, style }: any) => {
    const [isLoading, setIsLoading] = useState(true);

    // Extract cacheKey from source if available
    const imageSource = source.cacheKey
      ? { uri: source.uri, cacheKey: source.cacheKey }
      : source;

    return (
      <View className='flex-1 justify-center items-center' style={style}>
        <Image
          source={imageSource}
          style={style}
          contentFit='contain'
          cachePolicy='disk'
          onLoad={() => setIsLoading(false)}
          onError={() => setIsLoading(false)}
        />

        {isLoading && (
          <View className='absolute inset-0 justify-center items-center bg-black/30'>
            <ActivityIndicator size='large' color='#ffffff' />
          </View>
        )}
      </View>
    );
  };

  // Create fresh header props for each render
  const headerProps = {
    title,
    subtitle: getHeaderSubtitle(),
    onClose: onRequestClose,
  };

  // Handle index changes
  const handleIndexChange = (index: number) => {
    setCurrentIndex(index);
  };

  // Type assertion to make TypeScript happy
  const ExtendedImageView =
    ImageView as React.ComponentType<ExtendedImageViewProps>;

  return (
    <ExtendedImageView
      images={optimizedImages}
      imageIndex={imageIndex}
      visible={visible}
      onRequestClose={onRequestClose}
      swipeToCloseEnabled={swipeToCloseEnabled}
      doubleTapToZoomEnabled={doubleTapToZoomEnabled}
      HeaderComponent={() => <FastImageViewerHeader {...headerProps} />}
      onImageIndexChange={handleIndexChange}
      ImageComponent={CustomImageComponent}
      {...otherProps}
    />
  );
};
