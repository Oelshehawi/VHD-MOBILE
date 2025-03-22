import React, { useState } from 'react';
import ImageView from 'react-native-image-viewing';
import FastImage from 'react-native-fast-image';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

// Define the image viewer props type manually based on the library's usage
interface ImageViewerProps {
  images: { uri: string; title?: string }[];
  imageIndex: number;
  visible: boolean;
  onRequestClose: () => void;
  swipeToCloseEnabled?: boolean;
  doubleTapToZoomEnabled?: boolean;
  HeaderComponent?: React.ComponentType<any>;
  FooterComponent?: React.ComponentType<any>;
}

// Custom type for our modified image viewer
export interface FastImageViewerProps
  extends Omit<ImageViewerProps, 'ImageComponent'> {
  onImageLoad?: (index: number) => void;
  onImageLoadError?: (index: number) => void;
}

/**
 * A custom image viewer component that uses FastImage for better performance
 * and caching capabilities in full-screen image galleries
 */
export const FastImageViewer: React.FC<FastImageViewerProps> = ({
  onImageLoad,
  onImageLoadError,
  ...props
}) => {
  const [loadingIndices, setLoadingIndices] = useState<Record<number, boolean>>(
    {}
  );

  // Handler for image load success
  const handleImageLoad = (index: number) => {
    setLoadingIndices((prev) => ({ ...prev, [index]: false }));
    if (onImageLoad) onImageLoad(index);
  };

  // Handler for image load errors
  const handleImageError = (index: number) => {
    setLoadingIndices((prev) => ({ ...prev, [index]: false }));
    if (onImageLoadError) onImageLoadError(index);
  };

  // Custom FastImage component for the ImageView
  const FastImageComponent = (props: any) => {
    const { style, source = {}, index = 0 } = props;

    // Track loading state for this image
    const [isLoading, setIsLoading] = useState(true);

    // Update global loading state
    React.useEffect(() => {
      if (index !== undefined) {
        setLoadingIndices((prev) => ({ ...prev, [index]: true }));
      }
    }, [index]);

    return (
      <View style={[style, styles.imageContainer]}>
        <FastImage
          source={source}
          style={style}
          resizeMode={FastImage.resizeMode.contain}
          onLoad={() => {
            setIsLoading(false);
            handleImageLoad(index);
          }}
          onError={() => {
            setIsLoading(false);
            handleImageError(index);
          }}
        />

        {isLoading && (
          <View style={styles.loaderContainer}>
            <ActivityIndicator size='large' color='#ffffff' />
          </View>
        )}
      </View>
    );
  };

  // Cast to any to bypass type checking for ImageComponent prop
  const imageViewProps = {
    ...props,
    // @ts-ignore - ImageComponent exists on the native component but not in the types
    ImageComponent: FastImageComponent,
  };

  return <ImageView {...imageViewProps} />;
};

const styles = StyleSheet.create({
  imageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loaderContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
});
