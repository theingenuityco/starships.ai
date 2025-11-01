import { useEffect, useMemo, useRef, useState } from 'react'

/**
 * Detects agent creations during an active streaming turn and exposes a modal state
 * that opens only after the turn completes.
 *
 * Detection heuristic: assistant tool call named like 'open-agent*' with a provided name and no slug.
 */
export function useDeferredAgentCreationModal(options: { liveMessages: any[] | undefined; isStreaming: boolean | undefined }) {
  const isStreaming = Boolean(options?.isStreaming)
  const liveMessages = Array.isArray(options?.liveMessages) ? (options!.liveMessages as any[]) : []

  const prevStreamingRef = useRef<boolean>(false)
  const createdNamesRef = useRef<Set<string>>(new Set())

  const [isOpen, setIsOpen] = useState<boolean>(false)
  const [createdNames, setCreatedNames] = useState<string[]>([])

  // While streaming, look for assistant tool calls that represent agent creation
  useEffect(() => {
    if (!isStreaming || !liveMessages.length) return

    const recent = liveMessages.slice(-10)
    for (let i = recent.length - 1; i >= 0; i--) {
      const msg = recent[i] as any
      if (!msg || msg.role !== 'assistant' || !Array.isArray(msg.toolCalls)) continue
      for (const tc of msg.toolCalls as any[]) {
        const rawName = tc?.function?.name as string | undefined
        const fnName = typeof rawName === 'string' ? rawName.toLowerCase() : ''
        if (!fnName || !fnName.includes('open-agent')) continue

        let args: any = tc?.function?.arguments
        if (typeof args === 'string') {
          try {
            args = JSON.parse(args)
          } catch {}
        }
        const hasName = args && typeof args.name === 'string' && args.name.trim().length > 0
        const hasSlug = args && typeof args.slug === 'string' && args.slug.trim().length > 0
        if (hasName && !hasSlug) {
          createdNamesRef.current.add(String(args.name))
        }
      }
    }
  }, [isStreaming, liveMessages])

  // When streaming ends, open the modal if any creations were detected
  useEffect(() => {
    const was = prevStreamingRef.current
    if (was && !isStreaming) {
      const names = Array.from(createdNamesRef.current)
      if (names.length > 0) {
        setCreatedNames(names)
        setIsOpen(true)
        createdNamesRef.current.clear()
      }
    }
    prevStreamingRef.current = Boolean(isStreaming)
  }, [isStreaming])

  const close = useMemo(() => ({
    close: () => setIsOpen(false),
  }), [])

  return {
    isOpen,
    createdNames,
    setIsOpen,
    ...close,
  }
}


