/* logger.ts — кастомный логгер с буфером, дедупликацией и модулями */

// ============================================================
// Типы
// ============================================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  time: number;          // timestamp (ms)
  elapsed: number;       // ms from session start
  level: LogLevel;
  module: string;
  message: string;
}

export interface LoggerFilters {
  level?: LogLevel;
  module?: string;
  search?: string;
  before?: number;       // timestamp, exclusive
  limit?: number;        // max entries to return
}

// ============================================================
// Отправка логов на сервер через game-client.js
// ============================================================

function sendLogToServer(entry: LogEntry): void {
  const globals = (window as any).__debugServerGlobals;
  if (globals && globals.pushLog) {
    try {
      globals.pushLog(entry.level, entry.module, entry.message);
    } catch {
      // Ignore send errors
    }
  }
}

// ============================================================
// Константы
// ============================================================

const MAX_BUFFER_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_ENTRIES_SOFT = 50_000;            // soft limit, trigger cleanup

// ============================================================
// Кольцевой буфер
// ============================================================

class LogBuffer {
  entries: LogEntry[] = [];
  totalBytes = 0;
  sessionStart = performance.now();

  estimateBytes(entry: LogEntry): number {
    // approximate UTF-8 size
    return new TextEncoder().encode(JSON.stringify(entry)).length;
  }

  addEntry(level: LogLevel, module: string, message: string): LogEntry {
    const entry: LogEntry = {
      time: Date.now(),
      elapsed: performance.now() - this.sessionStart,
      level,
      module,
      message,
    };
    this.entries.push(entry);
    this.totalBytes += this.estimateBytes(entry);

    // Hard cleanup if over limits
    if (this.entries.length > MAX_ENTRIES_SOFT || this.totalBytes > MAX_BUFFER_BYTES) {
      this.trim();
    }

    return entry;
  }

  trim(): void {
    // Remove entries from front until under limits
    while (this.entries.length > 0 && (this.entries.length > MAX_ENTRIES_SOFT / 2 || this.totalBytes > MAX_BUFFER_BYTES / 2)) {
      const removed = this.entries.shift()!;
      this.totalBytes -= this.estimateBytes(removed);
    }
  }

  getLogs(filters?: LoggerFilters): LogEntry[] {
    let result = this.entries;

    if (filters) {
      if (filters.level) {
        const levelOrder: LogLevel[] = ['debug', 'info', 'warn', 'error'];
        const minLevel = levelOrder.indexOf(filters.level);
        result = result.filter((e) => levelOrder.indexOf(e.level) >= minLevel);
      }
      if (filters.module) {
        result = result.filter((e) => e.module === filters.module);
      }
      if (filters.search) {
        const search = filters.search.toLowerCase();
        result = result.filter((e) => e.message.toLowerCase().includes(search));
      }
      if (filters.before) {
        result = result.filter((e) => e.time < filters.before);
      }
    }

    if (filters?.limit && result.length > filters.limit) {
      result = result.slice(-filters.limit);
    }

    return result;
  }

  getStats(): { count: number; bytes: number } {
    return { count: this.entries.length, bytes: this.totalBytes };
  }

  clear(): void {
    this.entries = [];
    this.totalBytes = 0;
  }
}

// ============================================================
// DebugLogger singleton
// ============================================================

const SERVER_DEDUP_MS = 1000; // Don't send same message to server within 1 second

export class DebugLogger {
  private buffer = new LogBuffer();
  private enabled = true;
  private minLevel: LogLevel = 'debug';

  // Dedup: last message sent to server + timestamp
  private lastServerMsg = '';
  private lastServerTime = 0;

  setEnabled(on: boolean): void {
    this.enabled = on;
  }

  setMinLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  private shouldLog(level: LogLevel): boolean {
    if (!this.enabled) return false;
    const order: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    return order.indexOf(level) >= order.indexOf(this.minLevel);
  }

  private writeConsole(level: LogLevel, module: string, message: string): void {
    const tag = `[${module}]`;
    switch (level) {
      case 'debug':
        if (this.shouldLog('debug')) console.log(`%c${tag}`, 'color: #888;', message);
        break;
      case 'info':
        if (this.shouldLog('info')) console.log(`%c${tag}`, 'color: #4fc3f7;', message);
        break;
      case 'warn':
        if (this.shouldLog('warn')) console.warn(`%c${tag}`, 'color: #ffb74d;', message);
        break;
      case 'error':
        if (this.shouldLog('error')) console.error(`%c${tag}`, 'color: #ef5350;', message);
        break;
    }
  }

  log(level: LogLevel, module: string, message: string): void {
    if (!this.shouldLog(level)) return;

    this.writeConsole(level, module, message);
    const entry = this.buffer.addEntry(level, module, message);

    // Dedup: don't send same message to server within 1 second
    const now = Date.now();
    if (message === this.lastServerMsg && (now - this.lastServerTime) < SERVER_DEDUP_MS) {
      return; // suppressed
    }
    this.lastServerMsg = message;
    this.lastServerTime = now;
    sendLogToServer(entry);
  }

  debug(module: string, message: string): void {
    this.log('debug', module, message);
  }

  info(module: string, message: string): void {
    this.log('info', module, message);
  }

  warn(module: string, message: string): void {
    this.log('warn', module, message);
  }

  error(module: string, message: string): void {
    this.log('error', module, message);
  }

  /** Get logs with optional filters */
  getLogs(filters?: LoggerFilters): LogEntry[] {
    return this.buffer.getLogs(filters);
  }

  /** Get buffer stats */
  getStats(): { count: number; bytes: number } {
    return this.buffer.getStats();
  }

  /** Clear all logs */
  clear(): void {
    this.buffer.clear();
  }
}

// ============================================================
// Singleton export
// ============================================================

export const logger = new DebugLogger();
