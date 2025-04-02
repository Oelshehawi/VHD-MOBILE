import React, { useState, useEffect } from 'react';
import ImageView from 'react-native-image-viewing';
import FastImage from 'react-native-fast-image';
import { ActivityIndicator, View } from 'react-native';
import { FastImageViewerHeader } from './FastImageViewerHeader';

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

/**
 * A simplified image viewer component that uses FastImage for better performance
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

  // Custom image component with loading indicator
  const CustomImageComponent = ({ source, style }: any) => {
    const [isLoading, setIsLoading] = useState(true);

    return (
      <View className='flex-1 justify-center items-center' style={style}>
        <FastImage
          source={source}
          style={style}
          resizeMode={FastImage.resizeMode.contain}
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
      images={images}
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
