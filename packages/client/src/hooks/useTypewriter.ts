import { useState, useEffect, useCallback, useRef } from 'react'
import type { TypewriterChunk } from '@/types'

interface UseTypewriterOptions {
  speed?: number
  enabled?: boolean
  onComplete?: () => void
  onCharacter?: (char: string, position: number) => void
}

interface UseTypewriterReturn {
  displayText: string
  isTyping: boolean
  progress: number
  addChunk: (chunk: TypewriterChunk) => void
  reset: () => void
  pause: () => void
  resume: () => void
  setSpeed: (speed: number) => void
}

export function useTypewriter(options: UseTypewriterOptions = {}): UseTypewriterReturn {
  const { speed = 75, enabled = true, onComplete, onCharacter } = options

  const [displayText, setDisplayText] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [progress, setProgress] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const [currentSpeed, setCurrentSpeed] = useState(speed)

  const queueRef = useRef<TypewriterChunk[]>([])
  const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined)
  const totalLengthRef = useRef(0)

  const processQueue = useCallback(() => {
    if (isPaused || queueRef.current.length === 0) {
      setIsTyping(false)
      return
    }

    const chunk = queueRef.current.shift()
    if (!chunk) {
      setIsTyping(false)
      return
    }

    setIsTyping(true)

    if (chunk.type === 'character') {
      setDisplayText(prev => prev + chunk.content)
      setProgress(chunk.position / (chunk.totalLength || 1))

      onCharacter?.(chunk.content, chunk.position)

      let delay = 1000 / currentSpeed

      if (chunk.isCode) {
        delay *= 0.8
      } else if (chunk.content === ' ') {
        delay *= 0.5
      } else if (chunk.content.match(/[.!?]/)) {
        delay *= 2
      }

      if (chunk.delay) {
        delay = chunk.delay
      }

      timeoutRef.current = setTimeout(processQueue, delay)
    } else if (chunk.type === 'complete') {
      setIsTyping(false)
      setProgress(1)
      onComplete?.()
    }
  }, [isPaused, currentSpeed, onCharacter, onComplete])

  const addChunk = useCallback(
    (chunk: TypewriterChunk) => {
      if (!enabled) {
        if (chunk.type === 'character') {
          setDisplayText(prev => prev + chunk.content)
        }
        return
      }

      queueRef.current.push(chunk)

      if (chunk.totalLength) {
        totalLengthRef.current = chunk.totalLength
      }

      if (!isTyping && !isPaused) {
        processQueue()
      }
    },
    [enabled, isTyping, isPaused, processQueue]
  )

  const reset = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    queueRef.current = []
    setDisplayText('')
    setIsTyping(false)
    setProgress(0)
    totalLengthRef.current = 0
  }, [])

  const pause = useCallback(() => {
    setIsPaused(true)
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
  }, [])

  const resume = useCallback(() => {
    setIsPaused(false)
    if (queueRef.current.length > 0) {
      processQueue()
    }
  }, [processQueue])

  const setSpeed = useCallback((newSpeed: number) => {
    setCurrentSpeed(newSpeed)
  }, [])

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  return {
    displayText,
    isTyping,
    progress,
    addChunk,
    reset,
    pause,
    resume,
    setSpeed,
  }
}
