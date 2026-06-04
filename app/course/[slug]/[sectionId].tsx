import { useEffect, useMemo, useState } from 'react';
import { ScrollView, View, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import { WebView } from 'react-native-webview';
import NetInfo from '@react-native-community/netinfo';
import Markdown from 'react-native-markdown-display';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Text } from '../../../components/ui/text';
import { Button } from '../../../components/ui/button';
import { useTheme } from '../../../providers/ThemeProvider';
import { getSection } from '../../../services/courses/catalog';
import {
  useAssignedCourse,
  useCourseProgressMutations,
  isSectionAccessible
} from '../../../services/data/courses';
import type { LessonBlock } from '../../../services/courses/catalog';

// Sentinel embed used in the catalog until a real video url is swapped in.
// Render it as "coming soon" instead of loading a broken WebView.
function isPlaceholderVideo(url: string): boolean {
  return url.endsWith('/embed/0');
}

function VideoBlock({ block }: { block: Extract<LessonBlock, { type: 'video' }> }) {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOffline(!state.isConnected);
    });
    return () => unsubscribe();
  }, []);

  if (isPlaceholderVideo(block.url)) {
    return (
      <View className='my-4 aspect-video items-center justify-center rounded-xl border border-black/10 bg-black/5 dark:border-white/10 dark:bg-white/5'>
        <Ionicons name='videocam-outline' size={32} color='#8A857D' />
        <Text variant='muted' className='mt-2 text-center'>
          Video coming soon
        </Text>
        <Text variant='muted' className='text-center text-xs'>
          {block.title ?? 'This video'} will be added shortly.
        </Text>
      </View>
    );
  }

  if (isOffline) {
    return (
      <View className='my-4 aspect-video items-center justify-center rounded-xl border border-black/10 bg-black/5 dark:border-white/10 dark:bg-white/5'>
        <Ionicons name='cloud-offline-outline' size={32} color='#8A857D' />
        <Text variant='muted' className='mt-2 text-center'>
          Video unavailable offline
        </Text>
        <Text variant='muted' className='text-center text-xs'>
          Reconnect to watch {block.title ?? 'this video'}.
        </Text>
      </View>
    );
  }

  return (
    <View className='my-4 aspect-video overflow-hidden rounded-xl bg-black'>
      <WebView
        source={{ uri: block.url }}
        allowsFullscreenVideo
        javaScriptEnabled
        domStorageEnabled
        style={{ flex: 1, backgroundColor: 'black' }}
      />
    </View>
  );
}

export default function LessonScreen() {
  const { slug, sectionId } = useLocalSearchParams<{
    slug: string;
    sectionId: string;
  }>();
  const { user } = useUser();
  const { colorScheme } = useTheme();
  const isDark = colorScheme === 'dark';

  const section = useMemo(
    () => (slug && sectionId ? getSection(slug, sectionId) : undefined),
    [slug, sectionId]
  );

  const { assigned, isLoading } = useAssignedCourse(user?.id, slug ?? '');
  const { markSectionVisited, markSectionComplete } = useCourseProgressMutations(
    user?.id
  );

  const completedSectionIds = assigned?.progress.completedSectionIds ?? [];
  const isDone = sectionId ? completedSectionIds.includes(sectionId) : false;
  // Not-assigned is not-accessible: an unassigned deep-link must never record
  // progress. Accessibility requires an assignment AND prerequisite completion.
  const accessible =
    !!assigned &&
    (section ? isSectionAccessible(section, completedSectionIds) : false);

  // Record the visit once the section is loaded and accessible.
  useEffect(() => {
    if (slug && sectionId && section && accessible) {
      void markSectionVisited(slug, sectionId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, sectionId, section, accessible]);

  const markdownStyles = useMemo(
    () => ({
      body: { color: isDark ? '#E5E7EB' : '#14110F', fontSize: 15, lineHeight: 23 },
      heading1: { color: isDark ? '#FFFFFF' : '#14110F', fontSize: 22, fontWeight: '700' as const, marginTop: 8, marginBottom: 8 },
      heading2: { color: isDark ? '#FFFFFF' : '#14110F', fontSize: 18, fontWeight: '700' as const, marginTop: 16, marginBottom: 6 },
      heading3: { color: isDark ? '#FBBF24' : '#B45309', fontSize: 16, fontWeight: '700' as const, marginTop: 12, marginBottom: 4 },
      strong: { fontWeight: '700' as const },
      link: { color: '#D97706' },
      bullet_list: { marginVertical: 4 },
      table: { borderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)' },
      th: { padding: 6 },
      td: { padding: 6 }
    }),
    [isDark]
  );

  return (
    <SafeAreaView edges={['bottom']} className='flex-1 bg-[#F7F5F1] dark:bg-gray-950'>
      <Stack.Screen
        options={{
          headerShown: true,
          title: section?.title ?? 'Lesson'
        }}
      />

      {isLoading ? (
        <View className='flex-1 items-center justify-center'>
          <ActivityIndicator color='#D97706' />
        </View>
      ) : !section ? (
        <View className='flex-1 items-center justify-center p-8'>
          <Text variant='muted'>Lesson not found.</Text>
        </View>
      ) : !assigned ? (
        <View className='flex-1 items-center justify-center p-8'>
          <Ionicons name='person-remove-outline' size={36} color='#8A857D' />
          <Text className='mt-3 text-center text-base font-semibold text-[#14110F] dark:text-white'>
            Not assigned
          </Text>
          <Text variant='muted' className='mt-1 text-center'>
            This course hasn&apos;t been assigned to you yet.
          </Text>
        </View>
      ) : !accessible ? (
        <View className='flex-1 items-center justify-center p-8'>
          <Ionicons name='lock-closed' size={36} color='#8A857D' />
          <Text className='mt-3 text-center text-base font-semibold text-[#14110F] dark:text-white'>
            Locked
          </Text>
          <Text variant='muted' className='mt-1 text-center'>
            Complete the previous section to unlock this lesson.
          </Text>
        </View>
      ) : (
        <>
          <ScrollView
            className='flex-1'
            contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
          >
            {section.blocks.map((block, index) =>
              block.type === 'video' ? (
                <VideoBlock key={index} block={block} />
              ) : (
                <Markdown key={index} style={markdownStyles}>
                  {block.body}
                </Markdown>
              )
            )}
          </ScrollView>

          <View className='border-t border-black/10 bg-white p-4 dark:border-white/10 dark:bg-[#16140F]'>
            {isDone ? (
              <View className='flex-row items-center justify-center gap-2 py-2'>
                <Ionicons name='checkmark-circle' size={22} color='#16A34A' />
                <Text className='font-semibold text-green-700 dark:text-green-400'>
                  Section complete
                </Text>
              </View>
            ) : (
              <Button
                onPress={async () => {
                  if (slug && sectionId) {
                    await markSectionComplete(slug, sectionId);
                    router.back();
                  }
                }}
                className='rounded-xl bg-[#14110F] dark:bg-amber-400'
              >
                <Text className='text-center font-semibold text-white dark:text-[#14110F]'>
                  Mark section complete
                </Text>
              </Button>
            )}
          </View>
        </>
      )}
    </SafeAreaView>
  );
}
