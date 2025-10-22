import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  Modal,
  TextInput,
  Share,
  Dimensions
} from 'react-native';
import { StyledSafeAreaView } from '../tempNativeWindStyledComponents';
import { debugLogger } from '@/utils/DebugLogger';

interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  category: string;
  message: string;
  data?: any;
}

interface DebugPanelProps {
  visible: boolean;
  onClose: () => void;
}

export function DebugPanel({ visible, onClose }: DebugPanelProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedLevel, setSelectedLevel] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  // Get screen dimensions
  const { width, height } = Dimensions.get('window');

  // Load logs when panel opens
  useEffect(() => {
    if (visible) {
      loadLogs();
    }
  }, [visible, refreshKey]);

  const loadLogs = async () => {
    try {
      const allLogs = await debugLogger.getLogs();
      setLogs(allLogs.reverse()); // Show newest first
    } catch (error) {
      console.error('Failed to load logs:', error);
    }
  };

  const refreshLogs = () => {
    setRefreshKey(prev => prev + 1);
  };

  const clearLogs = async () => {
    Alert.alert(
      'Clear Logs',
      'Are you sure you want to clear all debug logs?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await debugLogger.clearLogs();
            setLogs([]);
          }
        }
      ]
    );
  };

  const exportLogs = async () => {
    try {
      const logsString = await debugLogger.exportLogs();
      await Share.share({
        message: logsString,
        title: 'Debug Logs Export'
      });
    } catch (error) {
      Alert.alert('Error', 'Failed to export logs');
    }
  };

  // Get unique categories
  const categories = ['ALL', ...new Set(logs.map(log => log.category))];
  const levels = ['ALL', 'info', 'warn', 'error', 'debug'];

  // Filter logs
  const filteredLogs = logs.filter(log => {
    const categoryMatch = selectedCategory === 'ALL' || log.category === selectedCategory;
    const levelMatch = selectedLevel === 'ALL' || log.level === selectedLevel;
    const searchMatch = searchTerm === '' ||
      log.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.data && JSON.stringify(log.data).toLowerCase().includes(searchTerm.toLowerCase()));

    return categoryMatch && levelMatch && searchMatch;
  });

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'error': return 'text-red-600';
      case 'warn': return 'text-yellow-600';
      case 'debug': return 'text-purple-600';
      default: return 'text-blue-600';
    }
  };

  const getLevelBg = (level: string) => {
    switch (level) {
      case 'error': return 'bg-red-100';
      case 'warn': return 'bg-yellow-100';
      case 'debug': return 'bg-purple-100';
      default: return 'bg-blue-100';
    }
  };

  const formatTimestamp = (timestamp: string) => {
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString() + '.' + date.getMilliseconds().toString().padStart(3, '0');
    } catch {
      return timestamp;
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
    >
      <StyledSafeAreaView className="flex-1 bg-white">
        {/* Header */}
        <View className="flex-row justify-between items-center p-4 border-b border-gray-200 bg-gray-50">
          <Text className="text-lg font-bold">Debug Logs ({logs.length})</Text>
          <TouchableOpacity
            onPress={onClose}
            className="px-4 py-2 bg-gray-500 rounded-lg"
          >
            <Text className="text-white font-semibold">Close</Text>
          </TouchableOpacity>
        </View>

        {/* Controls */}
        <View className="p-4 border-b border-gray-200 bg-gray-50">
          {/* Search */}
          <TextInput
            value={searchTerm}
            onChangeText={setSearchTerm}
            placeholder="Search logs..."
            className="border border-gray-300 rounded-lg px-3 py-2 mb-3 bg-white"
          />

          {/* Filter buttons */}
          <View className="flex-row flex-wrap gap-2 mb-3">
            <Text className="text-sm font-semibold text-gray-700 self-center mr-2">Category:</Text>
            {categories.map(category => (
              <TouchableOpacity
                key={category}
                onPress={() => setSelectedCategory(category)}
                className={`px-3 py-1 rounded-full ${
                  selectedCategory === category ? 'bg-blue-500' : 'bg-gray-200'
                }`}
              >
                <Text className={`text-xs ${
                  selectedCategory === category ? 'text-white' : 'text-gray-700'
                }`}>
                  {category}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View className="flex-row flex-wrap gap-2 mb-3">
            <Text className="text-sm font-semibold text-gray-700 self-center mr-2">Level:</Text>
            {levels.map(level => (
              <TouchableOpacity
                key={level}
                onPress={() => setSelectedLevel(level)}
                className={`px-3 py-1 rounded-full ${
                  selectedLevel === level ? 'bg-blue-500' : 'bg-gray-200'
                }`}
              >
                <Text className={`text-xs ${
                  selectedLevel === level ? 'text-white' : 'text-gray-700'
                }`}>
                  {level.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Action buttons */}
          <View className="flex-row gap-2">
            <TouchableOpacity
              onPress={refreshLogs}
              className="px-3 py-2 bg-green-500 rounded-lg flex-1"
            >
              <Text className="text-white font-semibold text-center text-sm">Refresh</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={exportLogs}
              className="px-3 py-2 bg-blue-500 rounded-lg flex-1"
            >
              <Text className="text-white font-semibold text-center text-sm">Export</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={clearLogs}
              className="px-3 py-2 bg-red-500 rounded-lg flex-1"
            >
              <Text className="text-white font-semibold text-center text-sm">Clear</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Logs list */}
        <ScrollView className="flex-1">
          {filteredLogs.length === 0 ? (
            <View className="p-4 items-center">
              <Text className="text-gray-500">No logs found</Text>
            </View>
          ) : (
            filteredLogs.map((log, index) => (
              <View
                key={index}
                className={`p-3 border-b border-gray-100 ${getLevelBg(log.level)}`}
              >
                <View className="flex-row justify-between items-start mb-1">
                  <View className="flex-row items-center flex-1">
                    <Text className={`text-xs font-bold ${getLevelColor(log.level)} mr-2`}>
                      {log.level.toUpperCase()}
                    </Text>
                    <Text className="text-xs font-semibold text-gray-700 mr-2">
                      [{log.category}]
                    </Text>
                    <Text className="text-xs text-gray-500">
                      {formatTimestamp(log.timestamp)}
                    </Text>
                  </View>
                </View>

                <Text className="text-sm text-gray-800 mb-1">
                  {log.message}
                </Text>

                {log.data && (
                  <Text className="text-xs text-gray-600 font-mono bg-gray-50 p-2 rounded">
                    {typeof log.data === 'string' ? log.data : JSON.stringify(log.data, null, 2)}
                  </Text>
                )}
              </View>
            ))
          )}
        </ScrollView>

        {/* Footer info */}
        <View className="p-2 border-t border-gray-200 bg-gray-50">
          <Text className="text-xs text-gray-500 text-center">
            Showing {filteredLogs.length} of {logs.length} logs
          </Text>
        </View>
      </StyledSafeAreaView>
    </Modal>
  );
}
