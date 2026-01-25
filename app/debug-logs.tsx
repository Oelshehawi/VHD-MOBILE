import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Share,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router } from 'expo-router';
import { Text } from '../components/ui/text';
import { debugLogger } from '../utils/DebugLogger';
import { Ionicons } from '@expo/vector-icons';
import {
  cancelPendingUploads,
  getPendingUploadsCount,
  getFailedUploadsCount,
  getUploadStats,
} from '../services/background/BackgroundUploadService';

interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  category: string;
  message: string;
  data?: string;
}

const CATEGORIES = [
  'ALL',
  'PHOTO',
  'UPLOAD',
  'DATABASE',
  'SYNC',
  'AUTH',
  'NETWORK',
];

const levelColors: Record<string, { bg: string; text: string }> = {
  error: {
    bg: 'bg-red-100 dark:bg-red-900',
    text: 'text-red-700 dark:text-red-300',
  },
  warn: {
    bg: 'bg-yellow-100 dark:bg-yellow-900',
    text: 'text-yellow-700 dark:text-yellow-300',
  },
  info: {
    bg: 'bg-blue-100 dark:bg-blue-900',
    text: 'text-blue-700 dark:text-blue-300',
  },
  debug: {
    bg: 'bg-gray-100 dark:bg-gray-800',
    text: 'text-gray-700 dark:text-gray-300',
  },
};

export default function DebugLogsScreen() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<LogEntry[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [expandedLogs, setExpandedLogs] = useState<Set<number>>(new Set());
  const [uploadStatus, setUploadStatus] = useState<{
    pending: number;
    failed: number;
    isRunning: boolean;
  }>({ pending: 0, failed: 0, isRunning: false });

  const loadLogs = useCallback(async () => {
    const fetchedLogs = await debugLogger.getLogs();
    setLogs(fetchedLogs.reverse()); // Most recent first
  }, []);

  const loadUploadStatus = useCallback(async () => {
    const [pending, failed] = await Promise.all([
      getPendingUploadsCount(),
      getFailedUploadsCount(),
    ]);
    const stats = getUploadStats();
    setUploadStatus({ pending, failed, isRunning: stats.isRunning });
  }, []);

  useEffect(() => {
    loadLogs();
    loadUploadStatus();
  }, [loadLogs, loadUploadStatus]);

  useEffect(() => {
    let filtered = logs;

    // Filter by category
    if (selectedCategory !== 'ALL') {
      filtered = filtered.filter((log) => log.category === selectedCategory);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (log) =>
          log.message.toLowerCase().includes(query) ||
          log.category.toLowerCase().includes(query) ||
          (log.data && log.data.toLowerCase().includes(query)),
      );
    }

    setFilteredLogs(filtered);
  }, [logs, selectedCategory, searchQuery]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadLogs(), loadUploadStatus()]);
    setRefreshing(false);
  }, [loadLogs, loadUploadStatus]);

  const handleCancelUploads = async () => {
    const result = await cancelPendingUploads();
    await loadUploadStatus();
    await loadLogs();
  };

  const handleExport = async () => {
    try {
      const exportedLogs = await debugLogger.exportLogs();
      await Share.share({
        message: exportedLogs,
        title: 'Debug Logs Export',
      });
    } catch (error) {
      console.error('Failed to export logs:', error);
    }
  };

  const handleClear = async () => {
    await debugLogger.clearLogs();
    setLogs([]);
  };

  const toggleLogExpanded = (index: number) => {
    setExpandedLogs((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <SafeAreaView className='flex-1 bg-white dark:bg-gray-950'>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Debug Logs',
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()} className='p-2'>
              <Ionicons name='arrow-back' size={24} color='#6b7280' />
            </TouchableOpacity>
          ),
        }}
      />

      <View className='flex-1 p-4'>
        {/* Search Bar */}
        <View className='mb-4'>
          <TextInput
            className='bg-gray-100 dark:bg-gray-800 rounded-lg px-4 py-3 text-gray-900 dark:text-gray-100'
            placeholder='Search logs...'
            placeholderTextColor='#9ca3af'
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {/* Category Filter */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className='mb-4'
          contentContainerStyle={{ gap: 8 }}
        >
          {CATEGORIES.map((category) => (
            <TouchableOpacity
              key={category}
              onPress={() => setSelectedCategory(category)}
              className={`px-4 py-2 rounded-full ${
                selectedCategory === category
                  ? 'bg-blue-600'
                  : 'bg-gray-200 dark:bg-gray-700'
              }`}
            >
              <Text
                className={
                  selectedCategory === category
                    ? 'text-white font-medium'
                    : 'text-gray-700 dark:text-gray-300'
                }
              >
                {category}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Action Buttons */}
        <View className='flex-row gap-3 mb-4'>
          <TouchableOpacity
            onPress={handleExport}
            className='flex-1 flex-row items-center justify-center bg-blue-600 py-3 rounded-lg'
          >
            <Ionicons name='share-outline' size={18} color='white' />
            <Text className='text-white font-medium ml-2'>Export</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleClear}
            className='flex-1 flex-row items-center justify-center bg-red-600 py-3 rounded-lg'
          >
            <Ionicons name='trash-outline' size={18} color='white' />
            <Text className='text-white font-medium ml-2'>Clear</Text>
          </TouchableOpacity>
        </View>

        {/* Upload Status Section */}
        {(uploadStatus.pending > 0 || uploadStatus.failed > 0) && (
          <View className='mb-4 p-4 bg-orange-100 dark:bg-orange-900 rounded-lg'>
            <View className='flex-row items-center justify-between mb-2'>
              <View className='flex-row items-center'>
                <Ionicons
                  name={
                    uploadStatus.isRunning ? 'cloud-upload' : 'cloud-offline'
                  }
                  size={20}
                  color={uploadStatus.isRunning ? '#f97316' : '#9ca3af'}
                />
                <Text className='text-orange-800 dark:text-orange-200 font-medium ml-2'>
                  Upload Status
                </Text>
              </View>
              <TouchableOpacity
                onPress={handleCancelUploads}
                className='bg-orange-600 px-4 py-2 rounded-lg'
              >
                <Text className='text-white font-medium'>Cancel All</Text>
              </TouchableOpacity>
            </View>
            <View className='flex-row gap-4'>
              <Text className='text-orange-700 dark:text-orange-300'>
                Pending: {uploadStatus.pending}
              </Text>
              <Text className='text-orange-700 dark:text-orange-300'>
                Failed: {uploadStatus.failed}
              </Text>
            </View>
          </View>
        )}

        {/* Log Count */}
        <Text className='text-gray-500 dark:text-gray-400 mb-2'>
          Showing {filteredLogs.length} of {logs.length} logs
        </Text>

        {/* Logs List */}
        <ScrollView
          className='flex-1'
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {filteredLogs.length === 0 ? (
            <View className='flex-1 items-center justify-center py-8'>
              <Ionicons
                name='document-text-outline'
                size={48}
                color='#9ca3af'
              />
              <Text className='text-gray-500 dark:text-gray-400 mt-2'>
                No logs found
              </Text>
            </View>
          ) : (
            filteredLogs.map((log, index) => {
              const colors = levelColors[log.level] || levelColors.info;
              const isExpanded = expandedLogs.has(index);

              return (
                <TouchableOpacity
                  key={index}
                  onPress={() => toggleLogExpanded(index)}
                  activeOpacity={0.7}
                  className={`mb-2 p-3 rounded-lg ${colors.bg}`}
                >
                  <View className='flex-row items-start justify-between'>
                    <View className='flex-1'>
                      <View className='flex-row items-center gap-2 mb-1'>
                        <Text
                          className={`text-xs font-bold uppercase ${colors.text}`}
                        >
                          {log.level}
                        </Text>
                        <Text className='text-xs text-gray-500 dark:text-gray-400'>
                          [{log.category}]
                        </Text>
                        <Text className='text-xs text-gray-400 dark:text-gray-500'>
                          {formatTimestamp(log.timestamp)}
                        </Text>
                      </View>
                      <Text
                        className={`${colors.text} ${isExpanded ? '' : 'line-clamp-2'}`}
                        numberOfLines={isExpanded ? undefined : 2}
                      >
                        {log.message}
                      </Text>
                      {log.data && isExpanded && (
                        <Text className='text-xs text-gray-500 dark:text-gray-400 mt-2 font-mono'>
                          {log.data}
                        </Text>
                      )}
                    </View>
                    {log.data && (
                      <Ionicons
                        name={isExpanded ? 'chevron-up' : 'chevron-down'}
                        size={16}
                        color='#9ca3af'
                      />
                    )}
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
