/**
 * Jest global teardown for models package tests
 */

import { resetConnection } from '../helpers/database/connection';
import { Logger, PerformanceMonitor, HealthMonitor } from '../helpers/logging';

export default async (): Promise<void> => {
  try {
    // Clear PerformanceMonitor timers
    if ((PerformanceMonitor as any).timers) {
      (PerformanceMonitor as any).timers.clear();
    }

    // Clear HealthMonitor health checks
    if ((HealthMonitor as any).healthChecks) {
      (HealthMonitor as any).healthChecks.clear();
    }

    // Reset singleton connection instance
    resetConnection();

    // Reset Logger singleton
    Logger.resetInstance();

    console.log('Jest teardown completed successfully');
  } catch (error) {
    console.error('Error during Jest teardown:', error);
  }
};