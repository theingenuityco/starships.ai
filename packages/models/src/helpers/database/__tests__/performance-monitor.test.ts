/**
 * PerformanceMonitor Unit Tests
 */

import { performanceMonitor } from '../performance-monitor';
import type { QueryMetrics } from '../performance-monitor';

describe('PerformanceMonitor', () => {
  beforeEach(() => {
    // Clear metrics before each test
    performanceMonitor.clear();
    jest.clearAllMocks();
  });

  describe('recordQuery', () => {
    it('should record query metrics successfully', () => {
      const operation = 'CREATE_USER';
      const duration = 150;
      const parameters = { name: 'John', email: 'john@example.com' };
      const resultCount = 1;
      const tags = ['user', 'creation'];

      performanceMonitor.recordQuery(operation, duration, parameters, resultCount, tags);

      const stats = performanceMonitor.getStats();
      expect(stats.totalQueries).toBe(1);
      expect(stats.recentQueries).toHaveLength(1);
      
      const recorded = stats.recentQueries[0];
      expect(recorded).toMatchObject({
        operation,
        duration,
        parameters,
        resultCount,
        tags,
        timestamp: expect.any(Number)
      });
    });

    it('should record query with minimal parameters', () => {
      performanceMonitor.recordQuery('SIMPLE_QUERY', 50);

      const stats = performanceMonitor.getStats();
      const recorded = stats.recentQueries[0];
      
      expect(recorded).toMatchObject({
        operation: 'SIMPLE_QUERY',
        duration: 50,
        parameters: undefined,
        resultCount: 0, // Default value
        tags: undefined
      });
    });

    it('should record query with default result count', () => {
      performanceMonitor.recordQuery('TEST_QUERY', 100, { test: true });

      const stats = performanceMonitor.getStats();
      expect(stats.recentQueries[0].resultCount).toBe(0);
    });

    it('should limit metrics to maximum count', () => {
      const maxMetrics = (performanceMonitor as any).maxMetrics; // 1000

      // Record more than max metrics
      for (let i = 0; i < maxMetrics + 100; i++) {
        performanceMonitor.recordQuery(`QUERY_${i}`, 100);
      }

      const allMetrics = (performanceMonitor as any).metrics;
      expect(allMetrics.length).toBe(maxMetrics);
      
      // Should keep the most recent ones
      expect(allMetrics[0].operation).toBe('QUERY_100'); // First kept metric
      expect(allMetrics[maxMetrics - 1].operation).toBe(`QUERY_${maxMetrics + 99}`); // Last metric
    });

    it('should log warning for slow queries', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      performanceMonitor.recordQuery('SLOW_QUERY', 1500); // > 1000ms

      expect(consoleSpy).toHaveBeenCalledWith(
        '🐌 Slow query detected: SLOW_QUERY took 1500ms'
      );

      consoleSpy.mockRestore();
    });

    it('should not log warning for fast queries', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      performanceMonitor.recordQuery('FAST_QUERY', 500); // < 1000ms

      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should handle exact threshold for slow query detection', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      performanceMonitor.recordQuery('THRESHOLD_QUERY', 1000); // Exactly 1000ms

      expect(consoleSpy).not.toHaveBeenCalled(); // Should not warn at exact threshold

      performanceMonitor.recordQuery('OVER_THRESHOLD_QUERY', 1001); // Just over threshold

      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('getStats', () => {
    it('should return empty stats when no metrics recorded', () => {
      const stats = performanceMonitor.getStats();

      expect(stats).toEqual({
        totalQueries: 0,
        averageDuration: 0,
        slowQueries: 0,
        recentQueries: []
      });
    });

    it('should calculate statistics correctly', () => {
      const queries = [
        { operation: 'QUERY_1', duration: 100 },
        { operation: 'QUERY_2', duration: 200 },
        { operation: 'QUERY_3', duration: 1500 }, // Slow query
        { operation: 'QUERY_4', duration: 300 },
        { operation: 'QUERY_5', duration: 2000 }  // Slow query
      ];

      queries.forEach(q => performanceMonitor.recordQuery(q.operation, q.duration));

      const stats = performanceMonitor.getStats();

      expect(stats.totalQueries).toBe(5);
      expect(stats.averageDuration).toBe(Math.round((100 + 200 + 1500 + 300 + 2000) / 5)); // 820
      expect(stats.slowQueries).toBe(2); // Queries > 1000ms
      expect(stats.recentQueries).toHaveLength(5);
    });

    it('should return last 10 queries for recent queries', () => {
      // Record 15 queries
      for (let i = 0; i < 15; i++) {
        performanceMonitor.recordQuery(`QUERY_${i}`, 100 + i);
      }

      const stats = performanceMonitor.getStats();

      expect(stats.recentQueries).toHaveLength(10);
      // Should be the last 10 queries (5-14)
      expect(stats.recentQueries[0].operation).toBe('QUERY_5');
      expect(stats.recentQueries[9].operation).toBe('QUERY_14');
    });

    it('should round average duration to nearest integer', () => {
      performanceMonitor.recordQuery('QUERY_1', 100);
      performanceMonitor.recordQuery('QUERY_2', 150);
      performanceMonitor.recordQuery('QUERY_3', 200);

      const stats = performanceMonitor.getStats();

      // Average should be (100 + 150 + 200) / 3 = 150
      expect(stats.averageDuration).toBe(150);
    });

    it('should handle single query statistics', () => {
      performanceMonitor.recordQuery('SINGLE_QUERY', 750);

      const stats = performanceMonitor.getStats();

      expect(stats.totalQueries).toBe(1);
      expect(stats.averageDuration).toBe(750);
      expect(stats.slowQueries).toBe(0);
      expect(stats.recentQueries).toHaveLength(1);
    });
  });

  describe('clear', () => {
    it('should clear all metrics', () => {
      // Record some metrics
      performanceMonitor.recordQuery('QUERY_1', 100);
      performanceMonitor.recordQuery('QUERY_2', 200);

      expect(performanceMonitor.getStats().totalQueries).toBe(2);

      performanceMonitor.clear();

      const stats = performanceMonitor.getStats();
      expect(stats.totalQueries).toBe(0);
      expect(stats.recentQueries).toEqual([]);
    });

    it('should reset to initial state after clear', () => {
      performanceMonitor.recordQuery('BEFORE_CLEAR', 500);
      performanceMonitor.clear();
      
      performanceMonitor.recordQuery('AFTER_CLEAR', 300);

      const stats = performanceMonitor.getStats();
      expect(stats.totalQueries).toBe(1);
      expect(stats.recentQueries[0].operation).toBe('AFTER_CLEAR');
    });
  });

  describe('getMetricsForOperation', () => {
    it('should return metrics for specific operation', () => {
      const targetOperation = 'CREATE_USER';
      
      // Record various operations
      performanceMonitor.recordQuery('CREATE_USER', 100, { name: 'John' });
      performanceMonitor.recordQuery('UPDATE_USER', 150);
      performanceMonitor.recordQuery('CREATE_USER', 120, { name: 'Jane' });
      performanceMonitor.recordQuery('DELETE_USER', 80);
      performanceMonitor.recordQuery('CREATE_USER', 90, { name: 'Bob' });

      const createUserMetrics = performanceMonitor.getMetricsForOperation(targetOperation);

      expect(createUserMetrics).toHaveLength(3);
      createUserMetrics.forEach(metric => {
        expect(metric.operation).toBe(targetOperation);
      });

      // Verify durations
      const durations = createUserMetrics.map(m => m.duration);
      expect(durations).toEqual([100, 120, 90]);
    });

    it('should return empty array for non-existent operation', () => {
      performanceMonitor.recordQuery('EXISTING_QUERY', 100);

      const metrics = performanceMonitor.getMetricsForOperation('NON_EXISTENT');

      expect(metrics).toEqual([]);
    });

    it('should return empty array when no metrics recorded', () => {
      const metrics = performanceMonitor.getMetricsForOperation('ANY_OPERATION');

      expect(metrics).toEqual([]);
    });

    it('should handle operation filtering with special characters', () => {
      const specialOperation = 'QUERY_WITH_SPECIAL_CHARS_!@#$%';
      
      performanceMonitor.recordQuery(specialOperation, 100);
      performanceMonitor.recordQuery('NORMAL_QUERY', 150);

      const metrics = performanceMonitor.getMetricsForOperation(specialOperation);

      expect(metrics).toHaveLength(1);
      expect(metrics[0].operation).toBe(specialOperation);
    });
  });

  describe('metrics data integrity', () => {
    it('should maintain chronological order of metrics', () => {
      const baseTime = Date.now();
      
      // Mock Date.now to return incremental timestamps
      let timeCounter = 0;
      jest.spyOn(Date, 'now').mockImplementation(() => baseTime + (timeCounter++ * 1000));

      performanceMonitor.recordQuery('QUERY_1', 100);
      performanceMonitor.recordQuery('QUERY_2', 200);
      performanceMonitor.recordQuery('QUERY_3', 300);

      const allMetrics = (performanceMonitor as any).metrics as QueryMetrics[];
      
      for (let i = 1; i < allMetrics.length; i++) {
        expect(allMetrics[i].timestamp).toBeGreaterThan(allMetrics[i - 1].timestamp);
      }

      jest.restoreAllMocks();
    });

    it('should preserve all metric properties', () => {
      const complexParameters = {
        filters: { status: 'active', type: 'user' },
        pagination: { page: 1, limit: 50 },
        sort: { field: 'createdAt', order: 'DESC' }
      };

      const complexTags = ['user-management', 'pagination', 'filtering'];

      performanceMonitor.recordQuery(
        'COMPLEX_QUERY',
        250,
        complexParameters,
        42,
        complexTags
      );

      const metrics = performanceMonitor.getMetricsForOperation('COMPLEX_QUERY');
      const metric = metrics[0];

      expect(metric.operation).toBe('COMPLEX_QUERY');
      expect(metric.duration).toBe(250);
      expect(metric.parameters).toEqual(complexParameters);
      expect(metric.resultCount).toBe(42);
      expect(metric.tags).toEqual(complexTags);
      expect(typeof metric.timestamp).toBe('number');
    });

    it('should handle null and undefined parameters correctly', () => {
      performanceMonitor.recordQuery('NULL_PARAMS', 100, null, 5);
      performanceMonitor.recordQuery('UNDEFINED_PARAMS', 150, undefined, 10);

      const nullParamMetrics = performanceMonitor.getMetricsForOperation('NULL_PARAMS');
      const undefinedParamMetrics = performanceMonitor.getMetricsForOperation('UNDEFINED_PARAMS');

      expect(nullParamMetrics[0].parameters).toBeNull();
      expect(undefinedParamMetrics[0].parameters).toBeUndefined();
    });
  });

  describe('performance edge cases', () => {
    it('should handle zero duration queries', () => {
      performanceMonitor.recordQuery('INSTANT_QUERY', 0);

      const stats = performanceMonitor.getStats();
      expect(stats.averageDuration).toBe(0);
      expect(stats.slowQueries).toBe(0);
    });

    it('should handle negative duration (edge case)', () => {
      performanceMonitor.recordQuery('NEGATIVE_QUERY', -10);

      const stats = performanceMonitor.getStats();
      expect(stats.averageDuration).toBe(-10);
      expect(stats.slowQueries).toBe(0); // Negative is not > 1000
    });

    it('should handle very large durations', () => {
      const veryLargeDuration = Number.MAX_SAFE_INTEGER;
      
      performanceMonitor.recordQuery('HUGE_QUERY', veryLargeDuration);

      const stats = performanceMonitor.getStats();
      expect(stats.averageDuration).toBe(veryLargeDuration);
      expect(stats.slowQueries).toBe(1);
    });

    it('should handle floating point durations', () => {
      performanceMonitor.recordQuery('FLOAT_QUERY_1', 123.456);
      performanceMonitor.recordQuery('FLOAT_QUERY_2', 234.789);

      const stats = performanceMonitor.getStats();
      const expectedAverage = Math.round((123.456 + 234.789) / 2);
      expect(stats.averageDuration).toBe(expectedAverage);
    });

    it('should handle queries with very large parameter objects', () => {
      const largeParameters = {
        data: 'x'.repeat(100000), // Large string
        array: Array.from({ length: 1000 }, (_, i) => ({ id: i, value: `item-${i}` })),
        nested: {
          deep: {
            very: {
              deep: {
                object: 'value'
              }
            }
          }
        }
      };

      performanceMonitor.recordQuery('LARGE_PARAMS_QUERY', 500, largeParameters);

      const metrics = performanceMonitor.getMetricsForOperation('LARGE_PARAMS_QUERY');
      expect(metrics[0].parameters).toEqual(largeParameters);
    });

    it('should handle queries with circular references in parameters', () => {
      const circularParams: any = { name: 'test' };
      circularParams.self = circularParams;

      // Should not throw error when recording
      expect(() => {
        performanceMonitor.recordQuery('CIRCULAR_PARAMS', 100, circularParams);
      }).not.toThrow();

      const metrics = performanceMonitor.getMetricsForOperation('CIRCULAR_PARAMS');
      expect(metrics[0].parameters).toBe(circularParams);
    });
  });

  describe('statistical calculations', () => {
    it('should calculate average correctly with various durations', () => {
      const durations = [50, 100, 150, 200, 500]; // Average = 200
      
      durations.forEach((duration, i) => {
        performanceMonitor.recordQuery(`QUERY_${i}`, duration);
      });

      const stats = performanceMonitor.getStats();
      expect(stats.averageDuration).toBe(200);
    });

    it('should count slow queries correctly', () => {
      const durations = [100, 500, 1001, 1500, 999, 2000, 800]; // 3 slow queries

      durations.forEach((duration, i) => {
        performanceMonitor.recordQuery(`QUERY_${i}`, duration);
      });

      const stats = performanceMonitor.getStats();
      expect(stats.slowQueries).toBe(3); // 1001, 1500, 2000
    });

    it('should handle edge case where all queries are slow', () => {
      const durations = [1100, 1200, 1300, 1400, 1500];

      durations.forEach((duration, i) => {
        performanceMonitor.recordQuery(`SLOW_QUERY_${i}`, duration);
      });

      const stats = performanceMonitor.getStats();
      expect(stats.slowQueries).toBe(5);
      expect(stats.totalQueries).toBe(5);
    });

    it('should handle edge case where no queries are slow', () => {
      const durations = [100, 200, 300, 400, 500];

      durations.forEach((duration, i) => {
        performanceMonitor.recordQuery(`FAST_QUERY_${i}`, duration);
      });

      const stats = performanceMonitor.getStats();
      expect(stats.slowQueries).toBe(0);
      expect(stats.totalQueries).toBe(5);
    });

    it('should maintain precision in average calculation', () => {
      // Test with numbers that don't divide evenly
      performanceMonitor.recordQuery('QUERY_1', 100);
      performanceMonitor.recordQuery('QUERY_2', 150);
      performanceMonitor.recordQuery('QUERY_3', 200);

      const stats = performanceMonitor.getStats();
      // (100 + 150 + 200) / 3 = 150
      expect(stats.averageDuration).toBe(150);
    });

    it('should round average duration correctly', () => {
      // Test rounding
      performanceMonitor.recordQuery('QUERY_1', 100);
      performanceMonitor.recordQuery('QUERY_2', 101);

      const stats = performanceMonitor.getStats();
      // (100 + 101) / 2 = 100.5, should round to 101
      expect(stats.averageDuration).toBe(101);
    });
  });

  describe('operation-specific metrics', () => {
    it('should track metrics per operation type', () => {
      // Record metrics for different operations
      performanceMonitor.recordQuery('CREATE_USER', 100, { name: 'John' }, 1);
      performanceMonitor.recordQuery('CREATE_USER', 120, { name: 'Jane' }, 1);
      performanceMonitor.recordQuery('UPDATE_USER', 80, { id: 'user-1' }, 1);
      performanceMonitor.recordQuery('DELETE_USER', 60, { id: 'user-2' }, 1);

      const createMetrics = performanceMonitor.getMetricsForOperation('CREATE_USER');
      const updateMetrics = performanceMonitor.getMetricsForOperation('UPDATE_USER');
      const deleteMetrics = performanceMonitor.getMetricsForOperation('DELETE_USER');

      expect(createMetrics).toHaveLength(2);
      expect(updateMetrics).toHaveLength(1);
      expect(deleteMetrics).toHaveLength(1);

      // Verify operation-specific data
      expect(createMetrics[0].parameters).toEqual({ name: 'John' });
      expect(createMetrics[1].parameters).toEqual({ name: 'Jane' });
      expect(updateMetrics[0].parameters).toEqual({ id: 'user-1' });
    });

    it('should maintain separate metric tracking for similar operation names', () => {
      performanceMonitor.recordQuery('USER_CREATE', 100);
      performanceMonitor.recordQuery('USER_CREATE_BULK', 200);
      performanceMonitor.recordQuery('CREATE_USER', 150);

      expect(performanceMonitor.getMetricsForOperation('USER_CREATE')).toHaveLength(1);
      expect(performanceMonitor.getMetricsForOperation('USER_CREATE_BULK')).toHaveLength(1);
      expect(performanceMonitor.getMetricsForOperation('CREATE_USER')).toHaveLength(1);
    });

    it('should handle case-sensitive operation names', () => {
      performanceMonitor.recordQuery('create_user', 100);
      performanceMonitor.recordQuery('CREATE_USER', 150);
      performanceMonitor.recordQuery('Create_User', 200);

      expect(performanceMonitor.getMetricsForOperation('create_user')).toHaveLength(1);
      expect(performanceMonitor.getMetricsForOperation('CREATE_USER')).toHaveLength(1);
      expect(performanceMonitor.getMetricsForOperation('Create_User')).toHaveLength(1);
    });
  });

  describe('tags functionality', () => {
    it('should store and retrieve tags correctly', () => {
      const tags = ['database', 'user-management', 'critical'];
      
      performanceMonitor.recordQuery('TAGGED_QUERY', 200, { id: 123 }, 5, tags);

      const metrics = performanceMonitor.getMetricsForOperation('TAGGED_QUERY');
      expect(metrics[0].tags).toEqual(tags);
    });

    it('should handle empty tags array', () => {
      performanceMonitor.recordQuery('EMPTY_TAGS_QUERY', 100, {}, 0, []);

      const metrics = performanceMonitor.getMetricsForOperation('EMPTY_TAGS_QUERY');
      expect(metrics[0].tags).toEqual([]);
    });

    it('should handle undefined tags', () => {
      performanceMonitor.recordQuery('NO_TAGS_QUERY', 100);

      const metrics = performanceMonitor.getMetricsForOperation('NO_TAGS_QUERY');
      expect(metrics[0].tags).toBeUndefined();
    });

    it('should handle tags with special characters', () => {
      const specialTags = ['tag-with-hyphens', 'tag_with_underscores', 'tag.with.dots', 'tag with spaces'];
      
      performanceMonitor.recordQuery('SPECIAL_TAGS_QUERY', 100, {}, 0, specialTags);

      const metrics = performanceMonitor.getMetricsForOperation('SPECIAL_TAGS_QUERY');
      expect(metrics[0].tags).toEqual(specialTags);
    });
  });

  describe('result count tracking', () => {
    it('should track result counts accurately', () => {
      const resultCounts = [0, 1, 10, 100, 1000];
      
      resultCounts.forEach((count, i) => {
        performanceMonitor.recordQuery(`QUERY_${i}`, 100, {}, count);
      });

      const allMetrics = (performanceMonitor as any).metrics as QueryMetrics[];
      
      resultCounts.forEach((expectedCount, i) => {
        expect(allMetrics[i].resultCount).toBe(expectedCount);
      });
    });

    it('should handle negative result counts', () => {
      performanceMonitor.recordQuery('NEGATIVE_RESULTS', 100, {}, -5);

      const metrics = performanceMonitor.getMetricsForOperation('NEGATIVE_RESULTS');
      expect(metrics[0].resultCount).toBe(-5);
    });

    it('should handle very large result counts', () => {
      const largeCount = 1000000;
      
      performanceMonitor.recordQuery('LARGE_RESULTS', 100, {}, largeCount);

      const metrics = performanceMonitor.getMetricsForOperation('LARGE_RESULTS');
      expect(metrics[0].resultCount).toBe(largeCount);
    });
  });

  describe('timestamp tracking', () => {
    it('should record accurate timestamps', () => {
      const beforeTime = Date.now();
      
      performanceMonitor.recordQuery('TIMESTAMP_TEST', 100);
      
      const afterTime = Date.now();
      const metrics = performanceMonitor.getMetricsForOperation('TIMESTAMP_TEST');

      expect(metrics[0].timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(metrics[0].timestamp).toBeLessThanOrEqual(afterTime);
    });

    it('should handle concurrent query recordings', () => {
      const promises = Array.from({ length: 10 }, (_, i) => 
        Promise.resolve(performanceMonitor.recordQuery(`CONCURRENT_${i}`, 100))
      );

      return Promise.all(promises).then(() => {
        const stats = performanceMonitor.getStats();
        expect(stats.totalQueries).toBe(10);

        // All timestamps should be unique or very close
        const timestamps = stats.recentQueries.map(m => m.timestamp);
        const uniqueTimestamps = new Set(timestamps);
        expect(uniqueTimestamps.size).toBeGreaterThan(0); // At least some unique timestamps
      });
    });
  });

  describe('memory management', () => {
    it('should not exceed maximum metrics limit during normal operation', () => {
      const maxMetrics = (performanceMonitor as any).maxMetrics;
      
      // Record exactly max metrics
      for (let i = 0; i < maxMetrics; i++) {
        performanceMonitor.recordQuery(`QUERY_${i}`, 100);
      }

      const metricsArray = (performanceMonitor as any).metrics;
      expect(metricsArray.length).toBe(maxMetrics);

      // Record one more
      performanceMonitor.recordQuery('OVERFLOW_QUERY', 100);

      expect(metricsArray.length).toBe(maxMetrics); // Should still be at max
    });

    it('should maintain most recent metrics when limit exceeded', () => {
      const maxMetrics = (performanceMonitor as any).maxMetrics;
      
      // Record more than max
      for (let i = 0; i < maxMetrics + 5; i++) {
        performanceMonitor.recordQuery(`QUERY_${i}`, 100);
      }

      const metricsArray = (performanceMonitor as any).metrics;
      
      // Should have most recent metrics (5 through maxMetrics + 4)
      expect(metricsArray[0].operation).toBe('QUERY_5');
      expect(metricsArray[metricsArray.length - 1].operation).toBe(`QUERY_${maxMetrics + 4}`);
    });
  });

  describe('integration scenarios', () => {
    it('should handle realistic database operation tracking', () => {
      // Simulate typical database operations
      const operations = [
        { name: 'SELECT_USERS', duration: 45, resultCount: 150 },
        { name: 'INSERT_USER', duration: 25, resultCount: 1 },
        { name: 'UPDATE_USER', duration: 30, resultCount: 1 },
        { name: 'DELETE_USER', duration: 20, resultCount: 1 },
        { name: 'SELECT_COMPLEX_JOIN', duration: 1200, resultCount: 500 }, // Slow query
        { name: 'CREATE_INDEX', duration: 5000, resultCount: 0 }, // Very slow
      ];

      operations.forEach(op => {
        performanceMonitor.recordQuery(
          op.name,
          op.duration,
          { table: 'users', operation: op.name.toLowerCase() },
          op.resultCount,
          ['database', 'users']
        );
      });

      const stats = performanceMonitor.getStats();
      
      expect(stats.totalQueries).toBe(6);
      expect(stats.slowQueries).toBe(2); // COMPLEX_JOIN and CREATE_INDEX
      expect(stats.averageDuration).toBe(Math.round((45 + 25 + 30 + 20 + 1200 + 5000) / 6));
      
      // Verify specific operation metrics
      const selectMetrics = performanceMonitor.getMetricsForOperation('SELECT_USERS');
      expect(selectMetrics[0].resultCount).toBe(150);
      expect(selectMetrics[0].tags).toEqual(['database', 'users']);
    });

    it('should handle monitoring across different time periods', () => {
      let mockTime = Date.now();
      jest.spyOn(Date, 'now').mockImplementation(() => mockTime);

      // Record queries at different times
      performanceMonitor.recordQuery('MORNING_QUERY', 100);
      
      mockTime += 60 * 60 * 1000; // 1 hour later
      performanceMonitor.recordQuery('AFTERNOON_QUERY', 150);
      
      mockTime += 60 * 60 * 1000; // Another hour later
      performanceMonitor.recordQuery('EVENING_QUERY', 200);

      const stats = performanceMonitor.getStats();
      const timestamps = stats.recentQueries.map(m => m.timestamp);
      
      // Verify timestamps are properly spaced
      expect(timestamps[1] - timestamps[0]).toBe(60 * 60 * 1000);
      expect(timestamps[2] - timestamps[1]).toBe(60 * 60 * 1000);

      jest.restoreAllMocks();
    });

    it('should support monitoring workflow for performance optimization', () => {
      // Simulate before/after optimization scenario
      
      // Before optimization - slow queries
      for (let i = 0; i < 5; i++) {
        performanceMonitor.recordQuery('UNOPTIMIZED_QUERY', 1500 + i * 100);
      }

      const beforeStats = performanceMonitor.getStats();
      expect(beforeStats.slowQueries).toBe(5);
      expect(beforeStats.averageDuration).toBeGreaterThan(1000);

      // After optimization - fast queries
      for (let i = 0; i < 5; i++) {
        performanceMonitor.recordQuery('OPTIMIZED_QUERY', 50 + i * 10);
      }

      const afterStats = performanceMonitor.getStats();
      expect(afterStats.totalQueries).toBe(10);
      expect(afterStats.slowQueries).toBe(5); // Still has the slow ones

      // Check specific operation performance
      const optimizedMetrics = performanceMonitor.getMetricsForOperation('OPTIMIZED_QUERY');
      const avgOptimized = optimizedMetrics.reduce((sum, m) => sum + m.duration, 0) / optimizedMetrics.length;
      expect(avgOptimized).toBeLessThan(100);
    });
  });

  describe('singleton behavior', () => {
    it('should maintain state across module imports', () => {
      // The performanceMonitor export should be a singleton
      performanceMonitor.recordQuery('SINGLETON_TEST', 100);

      // Import the same instance (simulated)
      const { performanceMonitor: importedMonitor } = jest.requireActual('../performance-monitor');
      
      const stats = importedMonitor.getStats();
      expect(stats.totalQueries).toBeGreaterThan(0);
    });
  });
});
