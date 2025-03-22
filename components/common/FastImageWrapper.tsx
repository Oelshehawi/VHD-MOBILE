import React, { useState } from 'react';
import FastImage from 'react-native-fast-image';
import { View, ActivityIndicator, StyleSheet } from 'react-native';

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
export const FastImageWrapper: React.FC<FastImageWrapperProps> = ({
  uri,
  style,
  resizeMode = FastImage.resizeMode.cover,
  showLoader = true,
  loaderColor = '#999',
  placeholderColor = '#e1e2e3',
  onError,
  onLoad,
  ...props
}) => {
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
        style={StyleSheet.absoluteFill}
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
        <View style={[StyleSheet.absoluteFill, styles.loaderContainer]}>
          <ActivityIndicator color={loaderColor} />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  loaderContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
});

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
