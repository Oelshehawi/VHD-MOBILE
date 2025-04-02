import React, { useState } from 'react';
import FastImage from 'react-native-fast-image';
import { View, ActivityIndicator } from 'react-native';

interface FastImageWrapperProps {
  uri: string;
  style: any;
  resizeMode?: any;
  showLoader?: boolean;
  loaderColor?: string;
  placeholderColor?: string;
  onError?: () => void;
  onLoad?: () => void;
}

/**
 * A wrapper component for FastImage that provides loading indicators
 * and error handling
 */
export const FastImageWrapper = ({
  uri,
  style,
  resizeMode = FastImage.resizeMode.cover,
  showLoader = true,
  loaderColor = '#999',
  placeholderColor = '#e1e2e3',
  onError,
  onLoad,
  ...props
}: FastImageWrapperProps) => {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  // Handle local images or data URIs directly
  if (
    !uri ||
    uri.startsWith('data:') ||
    uri.startsWith('file:') ||
    uri.startsWith('content:')
  ) {
    return (
      <FastImage
        source={{ uri }}
        style={style}
        resizeMode={resizeMode}
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
      <FastImage
        source={{ uri }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        resizeMode={resizeMode}
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
 * Utilities to help manage FastImage caching
 */

// Clear the FastImage cache
export const clearImageCache = async (): Promise<void> => {
  FastImage.clearMemoryCache();
  FastImage.clearDiskCache();
};

// Preload important images
export const preloadImages = (uris: string[]): void => {
  const sources = uris.map((uri) => ({ uri }));
  FastImage.preload(sources);
};
