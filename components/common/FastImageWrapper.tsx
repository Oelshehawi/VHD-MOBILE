import React, { useState, useMemo } from 'react';
import { Image, ImageContentFit } from 'expo-image';
import { View, ActivityIndicator } from 'react-native';
import { buildCloudinaryUrlMobile } from '@/utils/cloudinaryUrl.native';

interface FastImageWrapperProps {
  uri: string;
  style: any;
  contentFit?: ImageContentFit;
  showLoader?: boolean;
  loaderColor?: string;
  placeholderColor?: string;
  onError?: () => void;
  onLoad?: () => void;
  // Optional Cloudinary transformation
  cloudinaryTransform?: {
    cloudName: string;
    width: number;
  };
}

/**
 * A wrapper component for Expo Image that provides loading indicators
 * and error handling with optional Cloudinary transformation
 */
export const FastImageWrapper = ({
  uri,
  style,
  contentFit = 'cover',
  showLoader = true,
  loaderColor = '#999',
  placeholderColor = '#e1e2e3',
  onError,
  onLoad,
  cloudinaryTransform,
  ...props
}: FastImageWrapperProps) => {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  // Apply Cloudinary transformation if provided
  const transformedUri = useMemo(() => {
    if (!cloudinaryTransform) return uri;

    return buildCloudinaryUrlMobile({
      urlOrPublicId: uri,
      cloudName: cloudinaryTransform.cloudName,
      width: cloudinaryTransform.width,
    });
  }, [uri, cloudinaryTransform]);

  // Handle local images or data URIs directly
  if (
    !transformedUri ||
    transformedUri.startsWith('data:') ||
    transformedUri.startsWith('file:') ||
    transformedUri.startsWith('content:')
  ) {
    return (
      <Image
        source={{ uri: transformedUri }}
        style={style}
        contentFit={contentFit}
        cachePolicy='disk'
        onError={() => {
          if (onError) onError();
        }}
        onLoad={() => {
          if (onLoad) onLoad();
        }}
        {...props}
      />
    );
  }

  return (
    <View style={[style, { backgroundColor: placeholderColor }]}>
      <Image
        source={{ uri: transformedUri }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        contentFit={contentFit}
        cachePolicy='disk'
        onLoadStart={() => setIsLoading(true)}
        onLoadEnd={() => setIsLoading(false)}
        onError={() => {
          setHasError(true);
          setIsLoading(false);
          if (onError) onError();
        }}
        onLoad={() => {
          if (onLoad) onLoad();
        }}
        {...props}
      />

      {isLoading && showLoader && (
        <View className='absolute inset-0 justify-center items-center bg-black/5'>
          <ActivityIndicator color={loaderColor} />
        </View>
      )}
    </View>
  );
};

/**
 * Utilities to help manage Expo Image caching
 */

// Clear the Expo Image cache
export const clearImageCache = async (): Promise<void> => {
  await Image.clearMemoryCache();
  await Image.clearDiskCache();
};

// Preload important images
export const preloadImages = (uris: string[]): void => {
  uris.forEach((uri) => {
    Image.prefetch(uri);
  });
};
