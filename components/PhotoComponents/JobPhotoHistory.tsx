import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { format } from 'date-fns';
import { useQuery } from '@powersync/react-native';
import { PhotoType } from '@/utils/photos';
import { Ionicons } from '@expo/vector-icons';
import { FastImageWrapper } from '@/components/common/FastImageWrapper';
import { FastImageViewer } from '@/components/common/FastImageViewer';
import { FastImageViewerHeader } from '@/components/common/FastImageViewerHeader';
import { preloadImages } from '@/utils/imageCache';

// Interface for enhanced photo type with backward compatibility
interface EnhancedPhotoType extends PhotoType {
  signerName?: string;
}

// Interface for the gallery image object
interface GalleryImage {
  uri: string;
  title?: string;
  type?: 'before' | 'after' | 'signature';
}

// Props for the JobPhotoHistory component
interface JobPhotoHistoryProps {
  scheduleId: string;
  jobTitle: string;
}

/**
 * Component to display photos from previous jobs with the same title
 */
export function JobPhotoHistory({
  scheduleId,
  jobTitle,
}: JobPhotoHistoryProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [previousJobs, setPreviousJobs] = useState<
    {
      id: string;
      jobTitle: string;
      date: string;
      photos: {
        before: EnhancedPhotoType[];
        after: EnhancedPhotoType[];
        signature: EnhancedPhotoType[];
      };
    }[]
  >([]);

  // State for image gallery
  const [galleryVisible, setGalleryVisible] = useState(false);
  const [galleryImages, setGalleryImages] = useState<GalleryImage[]>([]);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [galleryJobDate, setGalleryJobDate] = useState('');

  // Fetch previous jobs with the same title
  const { data: previousJobsData = [] } = useQuery<any>(
    jobTitle && scheduleId
      ? `SELECT id, jobTitle, startDateTime, photos FROM schedules 
         WHERE jobTitle = ? AND id != ? AND photos IS NOT NULL
         ORDER BY startDateTime DESC LIMIT 20`
      : `SELECT id FROM schedules WHERE 0`,
    [jobTitle?.trim(), scheduleId]
  );

  // Process previous jobs data
  useEffect(() => {
    if (!previousJobsData.length) return;

    const processJobs = async () => {
      try {
        setIsLoading(true);

        // Process job data
        const processedJobs = previousJobsData
          .map((job) => {
            try {
              if (!job.photos || typeof job.photos !== 'string') return null;

              // Parse photos JSON
              const photosObj = JSON.parse(job.photos);

              // Format the date
              const dateString = job.startDateTime
                ? format(new Date(job.startDateTime), 'MMM d, yyyy')
                : 'Unknown Date';

              // Process photos array - always use the new schema
              const photosArray = Array.isArray(photosObj.photos)
                ? photosObj.photos
                : Array.isArray(photosObj)
                ? photosObj
                : [];

              return {
                id: job.id as string,
                jobTitle: (job.jobTitle as string) || 'Untitled Job',
                date: dateString,
                photos: {
                  before: photosArray.filter(
                    (p: EnhancedPhotoType) => p.type === 'before'
                  ) as EnhancedPhotoType[],
                  after: photosArray.filter(
                    (p: EnhancedPhotoType) => p.type === 'after'
                  ) as EnhancedPhotoType[],
                  signature: photosArray.filter(
                    (p: EnhancedPhotoType) => p.type === 'signature'
                  ) as EnhancedPhotoType[],
                },
              };
            } catch (error) {
              console.error('Error processing job:', error);
              return null;
            }
          })
          .filter(Boolean)
          .filter(
            (job) =>
              (job?.photos?.before?.length ?? 0) > 0 ||
              (job?.photos?.after?.length ?? 0) > 0 ||
              (job?.photos?.signature?.length ?? 0) > 0
          );

        // Use type assertion to fix the type error
        setPreviousJobs(
          processedJobs as {
            id: string;
            jobTitle: string;
            date: string;
            photos: {
              before: EnhancedPhotoType[];
              after: EnhancedPhotoType[];
              signature: EnhancedPhotoType[];
            };
          }[]
        );

        // Preload thumbnails for better performance
        const allPhotoUrls = processedJobs.flatMap((job) => {
          if (!job) return [];
          const beforeUrls = job.photos.before.map((p) => p.url);
          const afterUrls = job.photos.after.map((p) => p.url);
          const signatureUrls = job.photos.signature.map((p) => p.url);
          return [...beforeUrls, ...afterUrls, ...signatureUrls].filter(
            Boolean
          );
        });

        if (allPhotoUrls.length > 0) {
          preloadImages(allPhotoUrls);
        }
      } catch (error) {
        console.error('Error processing previous jobs:', error);
      } finally {
        setIsLoading(false);
      }
    };

    processJobs();
  }, [previousJobsData]);

  // Open gallery to view photos
  const openGallery = (
    jobIndex: number,
    photoType: 'before' | 'after' | 'signature',
    photoIndex: number = 0
  ) => {
    const job = previousJobs[jobIndex];
    if (!job) return;

    // Prepare gallery images
    const beforeImages = job.photos.before.map((photo) => ({
      uri: photo.url,
      title: 'Before Photo',
      type: 'before' as const,
    }));

    const afterImages = job.photos.after.map((photo) => ({
      uri: photo.url,
      title: 'After Photo',
      type: 'after' as const,
    }));

    const signatureImages = job.photos.signature.map((photo) => ({
      uri: photo.url,
      title: `Signature: ${photo.signerName || 'Unknown'}`,
      type: 'signature' as const,
    }));

    const allImages = [...beforeImages, ...afterImages, ...signatureImages];

    if (allImages.length === 0) return;

    // Calculate the correct index based on the type
    let startIndex = 0;
    if (photoType === 'after') {
      startIndex = beforeImages.length;
    } else if (photoType === 'signature') {
      startIndex = beforeImages.length + afterImages.length;
    }

    const finalIndex = startIndex + photoIndex;

    setGalleryImages(allImages);
    setGalleryIndex(finalIndex);
    setGalleryJobDate(job.date);
    setGalleryVisible(true);
  };

  // Render photo thumbnail item
  const renderPhotoItem = ({
    item,
    jobIndex,
    photoType,
    photoIndex,
  }: {
    item: EnhancedPhotoType;
    jobIndex: number;
    photoType: 'before' | 'after' | 'signature';
    photoIndex: number;
  }) => (
    <Pressable
      onPress={() => openGallery(jobIndex, photoType, photoIndex)}
      style={styles.photoItem}
    >
      <View style={styles.photoContainer}>
        <FastImageWrapper
          uri={item.url}
          style={styles.photoImage}
          showLoader={true}
        />

        <View
          style={[
            styles.photoTypeLabel,
            {
              backgroundColor:
                photoType === 'before'
                  ? 'rgba(59, 130, 246, 0.8)'
                  : photoType === 'after'
                  ? 'rgba(16, 185, 129, 0.8)'
                  : 'rgba(139, 92, 246, 0.8)', // Purple for signatures
            },
          ]}
        >
          <Text style={styles.photoTypeLabelText}>
            {photoType === 'before'
              ? 'Before'
              : photoType === 'after'
              ? 'After'
              : 'Signature'}
          </Text>
        </View>
      </View>
    </Pressable>
  );

  // Custom header component for the gallery with close button
  const renderGalleryHeader = () => (
    <FastImageViewerHeader
      title={jobTitle}
      subtitle={`${galleryJobDate} - ${
        galleryImages[galleryIndex]?.type === 'before'
          ? 'Before Photo'
          : galleryImages[galleryIndex]?.type === 'after'
          ? 'After Photo'
          : 'Signature'
      }`}
      onClose={() => setGalleryVisible(false)}
    />
  );

  // Loading state
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size='large' color='#0891b2' />
        <Text style={styles.loadingText}>Loading previous jobs...</Text>
      </View>
    );
  }

  // Empty state
  if (previousJobs.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name='time-outline' size={48} color='#9ca3af' />
        <Text style={styles.emptyTitle}>No job history found</Text>
        <Text style={styles.emptyText}>
          No previous jobs with title "{jobTitle}" were found
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.infoText}>
        Showing photos from previous instances of "{jobTitle}"
      </Text>

      <FlatList
        data={previousJobs}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index: jobIndex }) => (
          <View style={styles.jobCard}>
            <View style={styles.jobHeader}>
              <View style={styles.timelineDot} />
              <Text style={styles.jobDate}>{item.date}</Text>
            </View>

            {/* Before Photos Section */}
            {item.photos.before.length > 0 && (
              <View style={styles.photoSection}>
                <Text style={styles.sectionLabel}>
                  <Ionicons name='camera-outline' size={16} color='#3b82f6' />{' '}
                  Before Photos
                </Text>
                <FlatList
                  horizontal
                  data={item.photos.before}
                  keyExtractor={(photo, idx) =>
                    `${item.id}-before-${photo.id || idx}`
                  }
                  renderItem={({ item: photo, index: photoIndex }) =>
                    renderPhotoItem({
                      item: photo,
                      jobIndex,
                      photoType: 'before',
                      photoIndex,
                    })
                  }
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.photoList}
                />
              </View>
            )}

            {/* After Photos Section */}
            {item.photos.after.length > 0 && (
              <View style={styles.photoSection}>
                <Text style={styles.sectionLabel}>
                  <Ionicons
                    name='checkmark-circle-outline'
                    size={16}
                    color='#10b981'
                  />{' '}
                  After Photos
                </Text>
                <FlatList
                  horizontal
                  data={item.photos.after}
                  keyExtractor={(photo, idx) =>
                    `${item.id}-after-${photo.id || idx}`
                  }
                  renderItem={({ item: photo, index: photoIndex }) =>
                    renderPhotoItem({
                      item: photo,
                      jobIndex,
                      photoType: 'after',
                      photoIndex,
                    })
                  }
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.photoList}
                />
              </View>
            )}

            {/* Signature Section */}
            {item.photos.signature.length > 0 && (
              <View style={styles.photoSection}>
                <Text style={styles.sectionLabel}>
                  <Ionicons name='pencil-outline' size={16} color='#8b5cf6' />{' '}
                  Signatures
                </Text>
                <FlatList
                  horizontal
                  data={item.photos.signature}
                  keyExtractor={(photo, idx) =>
                    `${item.id}-signature-${photo.id || idx}`
                  }
                  renderItem={({ item: photo, index: photoIndex }) =>
                    renderPhotoItem({
                      item: photo,
                      jobIndex,
                      photoType: 'signature',
                      photoIndex,
                    })
                  }
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.photoList}
                />
              </View>
            )}
          </View>
        )}
      />

      {/* Image Gallery Viewer with the new header component */}
      <FastImageViewer
        images={galleryImages}
        imageIndex={galleryIndex}
        visible={galleryVisible}
        onRequestClose={() => setGalleryVisible(false)}
        swipeToCloseEnabled={true}
        doubleTapToZoomEnabled={true}
        HeaderComponent={renderGalleryHeader}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 8,
  },
  infoText: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 12,
    fontStyle: 'italic',
    paddingHorizontal: 4,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: '#6b7280',
    fontSize: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
    color: '#4b5563',
  },
  emptyText: {
    textAlign: 'center',
    color: '#6b7280',
    maxWidth: 240,
  },
  jobCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2.5,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#f3f4f6',
  },
  jobHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#3b82f6',
    marginRight: 10,
  },
  jobDate: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
  },
  photoSection: {
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
    color: '#4b5563',
    flexDirection: 'row',
    alignItems: 'center',
  },
  photoList: {
    paddingBottom: 4,
  },
  photoItem: {
    width: 100,
    height: 100,
    marginRight: 8,
    borderRadius: 8,
    overflow: 'hidden',
  },
  photoContainer: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  photoImage: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
  },
  photoTypeLabel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingVertical: 4,
    alignItems: 'center',
  },
  photoTypeLabelText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '500',
  },
});
