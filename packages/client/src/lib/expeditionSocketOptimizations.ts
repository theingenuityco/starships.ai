/**
 * Performance Optimizations for Expedition Socket Integration
 * 
 * Provides utilities for optimizing real-time WebSocket performance including
 * event debouncing, memory management, and connection quality monitoring.
 */

import { useCallback, useRef, useEffect } from 'react';

// Event debouncing utility
export class EventDebouncer {
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private eventCounts: Map<string, number> = new Map();
  private lastEvents: Map<string, any> = new Map();

  constructor(private defaultDelay: number = 100) {}

  debounce<T>(key: string, callback: (data: T) => void, data: T, delay?: number): void {
    const actualDelay = delay || this.defaultDelay;
    
    // Clear existing timer
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key)!);
    }

    // Store the latest data
    this.lastEvents.set(key, data);
    this.eventCounts.set(key, (this.eventCounts.get(key) || 0) + 1);

    // Set new timer
    const timer = setTimeout(() => {
      const latestData = this.lastEvents.get(key);
      const count = this.eventCounts.get(key) || 0;
      
      if (latestData) {
        callback(latestData);
      }
      
      // Cleanup
      this.timers.delete(key);
      this.lastEvents.delete(key);
      this.eventCounts.delete(key);
      
      // Log performance metrics in debug mode
      if (process.env.NODE_ENV === 'development' && count > 1) {
        console.debug(`[EXPEDITION SOCKET] Debounced ${count} events for key: ${key}`);
      }
    }, actualDelay);

    this.timers.set(key, timer);
  }

  flush(key?: string): void {
    if (key) {
      const timer = this.timers.get(key);
      if (timer) {
        clearTimeout(timer);
        this.timers.delete(key);
        this.lastEvents.delete(key);
        this.eventCounts.delete(key);
      }
    } else {
      // Flush all
      this.timers.forEach(timer => clearTimeout(timer));
      this.timers.clear();
      this.lastEvents.clear();
      this.eventCounts.clear();
    }
  }

  getStats(): { activeTimers: number; totalEvents: number } {
    const totalEvents = Array.from(this.eventCounts.values()).reduce((sum, count) => sum + count, 0);
    return {
      activeTimers: this.timers.size,
      totalEvents
    };
  }

  cleanup(): void {
    this.flush();
  }
}

// Memory management for event history
export class EventHistoryManager {
  private history: Array<{ event: string; data: any; timestamp: number }> = [];
  private maxSize: number;
  private compressionThreshold: number;

  constructor(maxSize: number = 1000, compressionThreshold: number = 0.8) {
    this.maxSize = maxSize;
    this.compressionThreshold = compressionThreshold;
  }

  addEvent(event: string, data: any): void {
    this.history.push({
      event,
      data: this.sanitizeData(data),
      timestamp: Date.now()
    });

    // Compress history when threshold is reached
    if (this.history.length > this.maxSize * this.compressionThreshold) {
      this.compressHistory();
    }
  }

  private sanitizeData(data: any): any {
    // Remove large objects and circular references
    try {
      return JSON.parse(JSON.stringify(data, (key, value) => {
        if (typeof value === 'object' && value !== null) {
          // Limit object depth and size
          if (JSON.stringify(value).length > 1000) {
            return '[Large Object]';
          }
        }
        return value;
      }));
    } catch (error) {
      return '[Unserializable Data]';
    }
  }

  private compressHistory(): void {
    // Keep only the most recent events and important events
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);
    
    // Keep all events from the last hour
    const recentEvents = this.history.filter(event => event.timestamp > oneHourAgo);
    
    // Keep important events from older history
    const olderImportantEvents = this.history
      .filter(event => event.timestamp <= oneHourAgo)
      .filter(event => this.isImportantEvent(event.event))
      .slice(-100); // Keep last 100 important events

    this.history = [...olderImportantEvents, ...recentEvents];
    
    console.debug(`[EXPEDITION SOCKET] Compressed event history to ${this.history.length} events`);
  }

  private isImportantEvent(eventName: string): boolean {
    const importantEvents = [
      'expedition:started',
      'expedition:completed',
      'expedition:failed',
      'expedition:cancelled',
      'expedition:error'
    ];
    return importantEvents.includes(eventName);
  }

  getHistory(): Array<{ event: string; data: any; timestamp: number }> {
    return [...this.history];
  }

  getRecentEvents(minutes: number = 10): Array<{ event: string; data: any; timestamp: number }> {
    const cutoff = Date.now() - (minutes * 60 * 1000);
    return this.history.filter(event => event.timestamp > cutoff);
  }

  getEventStats(): { totalEvents: number; eventTypes: Record<string, number>; memoryUsage: number } {
    const eventTypes: Record<string, number> = {};
    
    this.history.forEach(event => {
      eventTypes[event.event] = (eventTypes[event.event] || 0) + 1;
    });

    const memoryUsage = JSON.stringify(this.history).length;

    return {
      totalEvents: this.history.length,
      eventTypes,
      memoryUsage
    };
  }

  cleanup(): void {
    this.history = [];
  }
}

// Connection quality monitor
export class ConnectionQualityMonitor {
  private pingTimes: number[] = [];
  private eventLatencies: number[] = [];
  private connectionDrops: number = 0;
  private lastPingTime: number = 0;
  private qualityCheckInterval: NodeJS.Timeout | null = null;

  constructor(private onQualityChange?: (quality: 'excellent' | 'good' | 'poor' | 'disconnected') => void) {
    this.startQualityMonitoring();
  }

  recordPing(pingTime: number): void {
    this.pingTimes.push(pingTime);
    this.lastPingTime = Date.now();
    
    // Keep only last 10 ping times
    if (this.pingTimes.length > 10) {
      this.pingTimes = this.pingTimes.slice(-10);
    }
  }

  recordEventLatency(latency: number): void {
    this.eventLatencies.push(latency);
    
    // Keep only last 20 latencies
    if (this.eventLatencies.length > 20) {
      this.eventLatencies = this.eventLatencies.slice(-20);
    }
  }

  recordConnectionDrop(): void {
    this.connectionDrops++;
  }

  private startQualityMonitoring(): void {
    this.qualityCheckInterval = setInterval(() => {
      const quality = this.calculateQuality();
      this.onQualityChange?.(quality);
    }, 5000); // Check every 5 seconds
  }

  private calculateQuality(): 'excellent' | 'good' | 'poor' | 'disconnected' {
    const now = Date.now();
    const timeSinceLastPing = now - this.lastPingTime;

    // Check if disconnected (no ping in last 30 seconds)
    if (timeSinceLastPing > 30000) {
      return 'disconnected';
    }

    // Calculate average ping
    const avgPing = this.pingTimes.length > 0 
      ? this.pingTimes.reduce((sum, ping) => sum + ping, 0) / this.pingTimes.length 
      : 0;

    // Calculate average event latency
    const avgLatency = this.eventLatencies.length > 0
      ? this.eventLatencies.reduce((sum, latency) => sum + latency, 0) / this.eventLatencies.length
      : 0;

    // Determine quality based on metrics
    if (avgPing < 100 && avgLatency < 200 && this.connectionDrops < 2) {
      return 'excellent';
    } else if (avgPing < 300 && avgLatency < 500 && this.connectionDrops < 5) {
      return 'good';
    } else {
      return 'poor';
    }
  }

  getMetrics(): {
    averagePing: number;
    averageLatency: number;
    connectionDrops: number;
    quality: 'excellent' | 'good' | 'poor' | 'disconnected';
  } {
    const avgPing = this.pingTimes.length > 0 
      ? this.pingTimes.reduce((sum, ping) => sum + ping, 0) / this.pingTimes.length 
      : 0;

    const avgLatency = this.eventLatencies.length > 0
      ? this.eventLatencies.reduce((sum, latency) => sum + latency, 0) / this.eventLatencies.length
      : 0;

    return {
      averagePing: Math.round(avgPing),
      averageLatency: Math.round(avgLatency),
      connectionDrops: this.connectionDrops,
      quality: this.calculateQuality()
    };
  }

  cleanup(): void {
    if (this.qualityCheckInterval) {
      clearInterval(this.qualityCheckInterval);
      this.qualityCheckInterval = null;
    }
    this.pingTimes = [];
    this.eventLatencies = [];
    this.connectionDrops = 0;
  }
}

// React hook for performance monitoring
export function useExpeditionSocketPerformance() {
  const debouncerRef = useRef<EventDebouncer | null>(null);
  const historyManagerRef = useRef<EventHistoryManager | null>(null);
  const qualityMonitorRef = useRef<ConnectionQualityMonitor | null>(null);

  // Initialize performance utilities
  useEffect(() => {
    debouncerRef.current = new EventDebouncer(100);
    historyManagerRef.current = new EventHistoryManager(1000);
    qualityMonitorRef.current = new ConnectionQualityMonitor();

    return () => {
      debouncerRef.current?.cleanup();
      historyManagerRef.current?.cleanup();
      qualityMonitorRef.current?.cleanup();
    };
  }, []);

  const debounceEvent = useCallback(<T>(key: string, callback: (data: T) => void, data: T, delay?: number) => {
    debouncerRef.current?.debounce(key, callback, data, delay);
  }, []);

  const recordEvent = useCallback((event: string, data: any) => {
    historyManagerRef.current?.addEvent(event, data);
  }, []);

  const recordPing = useCallback((pingTime: number) => {
    qualityMonitorRef.current?.recordPing(pingTime);
  }, []);

  const recordLatency = useCallback((latency: number) => {
    qualityMonitorRef.current?.recordEventLatency(latency);
  }, []);

  const getPerformanceStats = useCallback(() => {
    return {
      debouncer: debouncerRef.current?.getStats() || { activeTimers: 0, totalEvents: 0 },
      history: historyManagerRef.current?.getEventStats() || { totalEvents: 0, eventTypes: {}, memoryUsage: 0 },
      connection: qualityMonitorRef.current?.getMetrics() || { averagePing: 0, averageLatency: 0, connectionDrops: 0, quality: 'disconnected' as const }
    };
  }, []);

  return {
    debounceEvent,
    recordEvent,
    recordPing,
    recordLatency,
    getPerformanceStats
  };
}

// Utility for optimizing React re-renders
export function useOptimizedCallback<T extends (...args: any[]) => any>(
  callback: T,
  deps: React.DependencyList,
  delay: number = 100
): T {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const latestCallbackRef = useRef(callback);
  const latestArgsRef = useRef<Parameters<T> | undefined>(undefined);

  // Update the latest callback
  useEffect(() => {
    latestCallbackRef.current = callback;
  });

  return useCallback((...args: Parameters<T>) => {
    latestArgsRef.current = args;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      if (latestArgsRef.current) {
        latestCallbackRef.current(...latestArgsRef.current);
      }
    }, delay);
  }, deps) as T;
}

// Memory usage monitoring
export function getMemoryUsage(): { used: number; total: number; percentage: number } | null {
  if (typeof performance !== 'undefined' && 'memory' in performance) {
    const memory = (performance as any).memory;
    return {
      used: Math.round(memory.usedJSHeapSize / 1024 / 1024), // MB
      total: Math.round(memory.totalJSHeapSize / 1024 / 1024), // MB
      percentage: Math.round((memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100)
    };
  }
  return null;
}

// Cleanup utility for component unmount
export function createCleanupManager() {
  const cleanupFunctions: Array<() => void> = [];

  return {
    add: (cleanup: () => void) => {
      cleanupFunctions.push(cleanup);
    },
    cleanup: () => {
      cleanupFunctions.forEach(fn => {
        try {
          fn();
        } catch (error) {
          console.error('[EXPEDITION SOCKET] Cleanup error:', error);
        }
      });
      cleanupFunctions.length = 0;
    }
  };
}