import { useEffect, useRef, useCallback } from 'react'

interface PerformanceMetrics {
  frameRate: number
  memoryUsage?: number
  lastFrameTime: number
  averageFrameTime: number
}

interface PerformanceOptimizationOptions {
  targetFPS?: number
  maxMemoryUsage?: number
  enableProfiling?: boolean
  onPerformanceIssue?: (metrics: PerformanceMetrics) => void
}

export function usePerformanceOptimization(options: PerformanceOptimizationOptions = {}) {
  const {
    targetFPS = 60,
    maxMemoryUsage = 100 * 1024 * 1024, // 100MB
    enableProfiling = false,
    onPerformanceIssue,
  } = options

  const metricsRef = useRef<PerformanceMetrics>({
    frameRate: 60,
    lastFrameTime: 0,
    averageFrameTime: 16.67, // ~60 FPS
  })

  const frameTimesRef = useRef<number[]>([])
  const animationFrameRef = useRef<number | undefined>(undefined)
  const isMonitoringRef = useRef(false)

  // Frame rate monitoring
  const measureFrameRate = useCallback(() => {
    const now = performance.now()
    const delta = now - metricsRef.current.lastFrameTime

    if (metricsRef.current.lastFrameTime > 0) {
      frameTimesRef.current.push(delta)

      // Keep only last 60 frames for rolling average
      if (frameTimesRef.current.length > 60) {
        frameTimesRef.current.shift()
      }

      // Calculate average frame time and FPS
      const avgFrameTime =
        frameTimesRef.current.reduce((a, b) => a + b, 0) / frameTimesRef.current.length
      const fps = 1000 / avgFrameTime

      metricsRef.current = {
        ...metricsRef.current,
        frameRate: fps,
        averageFrameTime: avgFrameTime,
      }

      // Check for performance issues
      if (fps < targetFPS * 0.8 && onPerformanceIssue) {
        onPerformanceIssue(metricsRef.current)
      }
    }

    metricsRef.current.lastFrameTime = now

    if (isMonitoringRef.current) {
      animationFrameRef.current = requestAnimationFrame(measureFrameRate)
    }
  }, [targetFPS, onPerformanceIssue])

  // Memory usage monitoring (if supported)
  const measureMemoryUsage = useCallback(() => {
    if ('memory' in performance) {
      const memory = (performance as any).memory
      metricsRef.current.memoryUsage = memory.usedJSHeapSize

      if (memory.usedJSHeapSize > maxMemoryUsage && onPerformanceIssue) {
        onPerformanceIssue(metricsRef.current)
      }
    }
  }, [maxMemoryUsage, onPerformanceIssue])

  // Start monitoring
  const startMonitoring = useCallback(() => {
    if (!isMonitoringRef.current) {
      isMonitoringRef.current = true
      measureFrameRate()

      if ('memory' in performance) {
        const memoryInterval = setInterval(measureMemoryUsage, 1000)
        return () => clearInterval(memoryInterval)
      }
    }
  }, [measureFrameRate, measureMemoryUsage])

  // Stop monitoring
  const stopMonitoring = useCallback(() => {
    isMonitoringRef.current = false
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }
  }, [])

  // Get current metrics
  const getCurrentMetrics = useCallback((): PerformanceMetrics => {
    return { ...metricsRef.current }
  }, [])

  // Performance optimization utilities
  const optimizations = {
    // Debounce function with performance awareness
    createPerformantDebounce: <T extends (...args: any[]) => any>(func: T, wait: number): T => {
      let timeout: NodeJS.Timeout
      let lastFrame = 0

      return ((...args: Parameters<T>) => {
        const now = performance.now()
        clearTimeout(timeout)

        // If frame rate is low, increase debounce time
        const frameRate = metricsRef.current.frameRate
        const adjustedWait = frameRate < 30 ? wait * 2 : wait

        timeout = setTimeout(() => {
          // Only execute if enough time has passed since last frame
          if (now - lastFrame > 16) {
            func(...args)
            lastFrame = performance.now()
          }
        }, adjustedWait)
      }) as T
    },

    // Throttle with frame-aware timing
    createFrameAwareThrottle: <T extends (...args: any[]) => any>(func: T, limit: number): T => {
      let inThrottle = false

      return ((...args: Parameters<T>) => {
        if (!inThrottle) {
          const frameRate = metricsRef.current.frameRate
          const adjustedLimit = frameRate < 30 ? limit * 2 : limit

          func(...args)
          inThrottle = true

          setTimeout(() => {
            inThrottle = false
          }, adjustedLimit)
        }
      }) as T
    },

    // Check if we should reduce animations
    shouldReduceAnimations: () => {
      const frameRate = metricsRef.current.frameRate
      return frameRate < targetFPS * 0.7
    },

    // Get performance-adjusted animation duration
    getOptimalAnimationDuration: (baseDuration: number) => {
      const frameRate = metricsRef.current.frameRate
      if (frameRate < 30) return baseDuration * 0.5 // Shorter animations
      if (frameRate < 45) return baseDuration * 0.75
      return baseDuration
    },
  }

  // Auto-start monitoring if profiling is enabled
  useEffect(() => {
    if (enableProfiling) {
      const cleanup = startMonitoring()
      return () => {
        stopMonitoring()
        if (cleanup) cleanup()
      }
    }
  }, [enableProfiling, startMonitoring, stopMonitoring])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopMonitoring()
    }
  }, [stopMonitoring])

  return {
    startMonitoring,
    stopMonitoring,
    getCurrentMetrics,
    ...optimizations,
  }
}
