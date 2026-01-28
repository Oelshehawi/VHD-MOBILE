import { useState, useEffect, useCallback } from 'react';
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
import { usePowerSync } from '@powersync/react-native';
import { LogCategoryFilter } from '../components/debug/LogCategoryFilter';
import { UploadDiagnosticsPanel } from '../components/debug/UploadDiagnosticsPanel';

interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  category: string;
  message: string;
  data?: string;
}

interface AttachmentRow {
  id: string;
  filename: string;
  state: number;
  photoType: string | null;
  jobTitle: string | null;
  startDate: string | null;
  local_uri: string | null;
}

interface PhotoRow {
  id: string;
  type: string | null;
  scheduleId: string | null;
  cloudinaryUrl: string | null;
  timestamp: string | null;
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
  const powerSync = usePowerSync();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<LogEntry[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [expandedLogs, setExpandedLogs] = useState<Set<number>>(new Set());
  const [diagnosticLoading, setDiagnosticLoading] = useState(false);
  const [diagnosticError, setDiagnosticError] = useState<string | null>(null);
  const [attachmentCounts, setAttachmentCounts] = useState<
    { state: number; count: number }[]
  >([]);
  const [attachmentRows, setAttachmentRows] = useState<AttachmentRow[]>([]);
  const [photoPendingCount, setPhotoPendingCount] = useState(0);
  const [photoRows, setPhotoRows] = useState<PhotoRow[]>([]);

  const loadLogs = useCallback(async () => {
    const fetchedLogs = await debugLogger.getLogs();
    setLogs(fetchedLogs.reverse()); // Most recent first
  }, []);

  const loadDiagnostics = useCallback(async () => {
    if (!powerSync) return;
    setDiagnosticLoading(true);
    setDiagnosticError(null);
    try {
      const counts = await powerSync.getAll<{
        state: number;
        count: number;
      }>(`SELECT state, COUNT(*) as count FROM attachments GROUP BY state`);
      const recentAttachments = await powerSync.getAll<AttachmentRow>(
        `SELECT id, filename, state, photoType, jobTitle, startDate, local_uri
                 FROM attachments
                 ORDER BY timestamp DESC
                 LIMIT 10`,
      );
      const pendingPhotos = await powerSync.getAll<{ count: number }>(
        `SELECT COUNT(*) as count FROM photos WHERE cloudinaryUrl IS NULL`,
      );
      const recentPhotos = await powerSync.getAll<PhotoRow>(
        `SELECT id, type, scheduleId, cloudinaryUrl, timestamp
                 FROM photos
                 ORDER BY timestamp DESC
                 LIMIT 10`,
      );

      setAttachmentCounts(counts);
      setAttachmentRows(recentAttachments);
      setPhotoPendingCount(Number(pendingPhotos[0]?.count ?? 0));
      setPhotoRows(recentPhotos);
    } catch (error) {
      setDiagnosticError(
        error instanceof Error ? error.message : 'Unknown error',
      );
    } finally {
      setDiagnosticLoading(false);
    }
  }, [powerSync]);

  const handleClearAttachments = useCallback(async () => {
    if (!powerSync) return;
    setDiagnosticLoading(true);
    setDiagnosticError(null);
    try {
      await powerSync.execute('DELETE FROM attachments');
      await loadDiagnostics();
    } catch (error) {
      setDiagnosticError(
        error instanceof Error ? error.message : 'Unknown error',
      );
    } finally {
      setDiagnosticLoading(false);
    }
  }, [powerSync, loadDiagnostics]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  useEffect(() => {
    loadDiagnostics();
  }, [loadDiagnostics]);

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
    await loadLogs();
    await loadDiagnostics();
    setRefreshing(false);
  }, [loadLogs, loadDiagnostics]);

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
    <SafeAreaView
      className='flex-1 bg-white dark:bg-gray-950'
      edges={['bottom', 'left', 'right']}
    >
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Debug Logs',
        }}
      />

      <View className='flex-1 p-4'>
        {/* Diagnostics */}
        <UploadDiagnosticsPanel
          loading={diagnosticLoading}
          error={diagnosticError}
          attachmentCounts={attachmentCounts}
          attachmentRows={attachmentRows}
          photoPendingCount={photoPendingCount}
          photoRows={photoRows}
          onRefresh={loadDiagnostics}
          onClearAttachments={handleClearAttachments}
        />

        {/* Search Bar */}
        <View className='mb-2'>
          <TextInput
            className='bg-gray-100 dark:bg-gray-800 rounded-lg px-4 py-3 text-gray-900 dark:text-gray-100'
            placeholder='Search logs...'
            placeholderTextColor='#9ca3af'
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {/* Category Filter */}
        <LogCategoryFilter
          categories={CATEGORIES}
          selectedCategory={selectedCategory}
          onSelect={setSelectedCategory}
        />

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
