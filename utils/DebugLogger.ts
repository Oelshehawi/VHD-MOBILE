import { File, Paths } from 'expo-file-system';

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  category: string;
  message: string;
  data?: any;
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

const DEFAULT_LOG_LEVEL: LogLevel = 'warn';
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]+?\.[A-Za-z0-9_-]+?\.[A-Za-z0-9_-]+/g;
const EXPO_PUSH_TOKEN_PATTERN = /ExponentPushToken\[[^\]]+\]/g;

function parseLogLevel(value: string | undefined): LogLevel {
  if (value === 'debug' || value === 'info' || value === 'warn' || value === 'error') {
    return value;
  }
  return DEFAULT_LOG_LEVEL;
}

function parseCategorySet(value: string | undefined): Set<string> {
  return new Set(
    (value ?? '')
      .split(',')
      .map((category) => category.trim().toUpperCase())
      .filter(Boolean)
  );
}

function isEnabled(value: string | undefined): boolean {
  return value === 'true' || value === '1';
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return (
    normalized === 'token' ||
    normalized.endsWith('token') ||
    normalized === 'authorization' ||
    normalized === 'authheader' ||
    normalized === 'jwt' ||
    normalized === 'secret' ||
    normalized.endsWith('secret') ||
    normalized === 'password' ||
    normalized === 'credential' ||
    normalized.endsWith('credential') ||
    normalized === 'credentials'
  );
}

function redactString(value: string): string {
  return value
    .replace(JWT_PATTERN, '[REDACTED_JWT]')
    .replace(EXPO_PUSH_TOKEN_PATTERN, '[REDACTED_EXPO_PUSH_TOKEN]');
}

function redactData(value: any): any {
  if (typeof value === 'string') {
    return redactString(value);
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message)
    };
  }

  if (Array.isArray(value)) {
    return value.map(redactData);
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      isSensitiveKey(key) ? '[REDACTED]' : redactData(item)
    ])
  );
}

class DebugLogger {
  private logFilePath: string;
  private maxLogSize = 5 * 1024 * 1024; // 5MB max log file
  private maxLogEntries = 1000; // Keep last 1000 entries
  private verboseLoggingEnabled = isEnabled(process.env.EXPO_PUBLIC_ENABLE_DEBUG_LOGS);
  private consoleLevel = parseLogLevel(process.env.EXPO_PUBLIC_LOG_LEVEL);
  private verboseCategories = parseCategorySet(process.env.EXPO_PUBLIC_LOG_CATEGORIES);
  private logToFile = process.env.EXPO_PUBLIC_LOG_TO_FILE === 'true';

  constructor() {
    this.logFilePath = new File(Paths.document, 'debug_logs.json').uri;
  }

  async log(level: LogLevel, category: string, message: string, data?: any) {
    const normalizedCategory = category.toUpperCase();
    const shouldEmit = this.shouldEmit(level, normalizedCategory);
    const shouldWrite = shouldEmit && (this.logToFile || LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY.warn);

    if (!shouldEmit && !shouldWrite) {
      return;
    }

    const redactedData = redactData(data);
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      category: normalizedCategory,
      message,
      data: redactedData
        ? typeof redactedData === 'string'
          ? redactedData
          : JSON.stringify(redactedData)
        : undefined
    };

    try {
      // Also log to console for development
      if (__DEV__ && shouldEmit) {
        const consoleMessage = `[${normalizedCategory}] ${message}`;
        switch (level) {
          case 'error':
            console.error(consoleMessage, redactedData || '');
            break;
          case 'warn':
            console.warn(consoleMessage, redactedData || '');
            break;
          case 'debug':
            console.debug(consoleMessage, redactedData || '');
            break;
          default:
            console.log(consoleMessage, redactedData || '');
        }
      }

      if (shouldWrite) {
        await this.writeLogEntry(entry);
      }
    } catch (error) {
      // Silent failure to prevent log errors from breaking the app
      if (__DEV__) {
        console.error('Failed to write log:', error);
      }
    }
  }

  private shouldEmit(level: LogLevel, category: string): boolean {
    if (LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY.warn) {
      return true;
    }

    if (!this.verboseLoggingEnabled) {
      return false;
    }

    if (
      this.verboseCategories.has('ALL') ||
      this.verboseCategories.has('*') ||
      this.verboseCategories.has(category)
    ) {
      return true;
    }

    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.consoleLevel];
  }

  private async writeLogEntry(entry: LogEntry) {
    try {
      let logs: LogEntry[] = [];

      // Try to read existing logs using new File API
      const logFile = new File(this.logFilePath);
      if (logFile.exists) {
        const fileContent = await logFile.text();
        try {
          logs = JSON.parse(fileContent) || [];
        } catch {
          // If parsing fails, start with empty array
          logs = [];
        }
      }

      // Add new entry
      logs.push(entry);

      // Trim logs if too many entries
      if (logs.length > this.maxLogEntries) {
        logs = logs.slice(-this.maxLogEntries);
      }

      // Write back to file
      await logFile.write(JSON.stringify(logs, null, 2));

      // Check file size and trim if necessary using new File API
      const updatedFile = new File(this.logFilePath);
      const size = updatedFile.size ?? 0;
      if (updatedFile.exists && size > this.maxLogSize) {
        // Keep only the last half of entries
        const trimmedLogs = logs.slice(-Math.floor(this.maxLogEntries / 2));
        await updatedFile.write(JSON.stringify(trimmedLogs, null, 2));
      }
    } catch {
      // Silent failure
    }
  }

  async getLogs(): Promise<LogEntry[]> {
    try {
      const logFile = new File(this.logFilePath);
      if (!logFile.exists) {
        return [];
      }

      const fileContent = await logFile.text();
      return JSON.parse(fileContent) || [];
    } catch {
      return [];
    }
  }

  async getRecentLogs(count: number = 50): Promise<LogEntry[]> {
    const logs = await this.getLogs();
    return logs.slice(-count);
  }

  async getLogsByCategory(category: string): Promise<LogEntry[]> {
    const logs = await this.getLogs();
    return logs.filter((log) => log.category === category);
  }

  async clearLogs(): Promise<void> {
    try {
      const logFile = new File(this.logFilePath);
      if (logFile.exists) {
        logFile.delete();
      }
    } catch {
      // Silent failure
    }
  }

  async exportLogs(): Promise<string> {
    try {
      const logs = await this.getLogs();
      return JSON.stringify(logs, null, 2);
    } catch {
      return '[]';
    }
  }

  // Convenience methods for different log levels
  info(category: string, message: string, data?: any) {
    return this.log('info', category, message, data);
  }

  warn(category: string, message: string, data?: any) {
    return this.log('warn', category, message, data);
  }

  error(category: string, message: string, data?: any) {
    return this.log('error', category, message, data);
  }

  debug(category: string, message: string, data?: any) {
    return this.log('debug', category, message, data);
  }
}

// Export singleton instance
export const debugLogger = new DebugLogger();

// Convenience functions
export const logPhoto = (message: string, data?: any) => debugLogger.info('PHOTO', message, data);
export const logPhotoError = (message: string, data?: any) =>
  debugLogger.error('PHOTO', message, data);
export const logUpload = (message: string, data?: any) => debugLogger.info('UPLOAD', message, data);
export const logUploadError = (message: string, data?: any) =>
  debugLogger.error('UPLOAD', message, data);
export const logDatabase = (message: string, data?: any) =>
  debugLogger.info('DATABASE', message, data);
export const logDatabaseError = (message: string, data?: any) =>
  debugLogger.error('DATABASE', message, data);
