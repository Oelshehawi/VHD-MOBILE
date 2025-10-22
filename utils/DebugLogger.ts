import { File, Paths } from 'expo-file-system';

interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  category: string;
  message: string;
  data?: any;
}

class DebugLogger {
  private logFilePath: string;
  private maxLogSize = 5 * 1024 * 1024; // 5MB max log file
  private maxLogEntries = 1000; // Keep last 1000 entries

  constructor() {
    this.logFilePath = new File(Paths.document, 'debug_logs.json').uri;
  }

  async log(level: 'info' | 'warn' | 'error' | 'debug', category: string, message: string, data?: any) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      data: data ? (typeof data === 'string' ? data : JSON.stringify(data)) : undefined
    };

    try {
      // Also log to console for development
      if (__DEV__) {
        const consoleMessage = `[${category}] ${message}`;
        switch (level) {
          case 'error':
            console.error(consoleMessage, data || '');
            break;
          case 'warn':
            console.warn(consoleMessage, data || '');
            break;
          case 'debug':
            console.debug(consoleMessage, data || '');
            break;
          default:
            console.log(consoleMessage, data || '');
        }
      }

      await this.writeLogEntry(entry);
    } catch (error) {
      // Silent failure to prevent log errors from breaking the app
      if (__DEV__) {
        console.error('Failed to write log:', error);
      }
    }
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
        } catch (parseError) {
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
    } catch (error) {
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
    } catch (error) {
      return [];
    }
  }

  async getRecentLogs(count: number = 50): Promise<LogEntry[]> {
    const logs = await this.getLogs();
    return logs.slice(-count);
  }

  async getLogsByCategory(category: string): Promise<LogEntry[]> {
    const logs = await this.getLogs();
    return logs.filter(log => log.category === category);
  }

  async clearLogs(): Promise<void> {
    try {
      const logFile = new File(this.logFilePath);
      if (logFile.exists) {
        logFile.delete();
      }
    } catch (error) {
      // Silent failure
    }
  }

  async exportLogs(): Promise<string> {
    try {
      const logs = await this.getLogs();
      return JSON.stringify(logs, null, 2);
    } catch (error) {
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
export const logPhotoError = (message: string, data?: any) => debugLogger.error('PHOTO', message, data);
export const logUpload = (message: string, data?: any) => debugLogger.info('UPLOAD', message, data);
export const logUploadError = (message: string, data?: any) => debugLogger.error('UPLOAD', message, data);
export const logDatabase = (message: string, data?: any) => debugLogger.info('DATABASE', message, data);
export const logDatabaseError = (message: string, data?: any) => debugLogger.error('DATABASE', message, data);