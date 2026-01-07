/**
 * Global state to track message animation completion.
 * Used to delay message.append events until the previous message's animation completes.
 */

const animationCompleteMap = new Map<string, boolean>()
const pendingAppendCallbacks = new Set<() => void>()

export function markAnimationComplete(messageId: string) {
  animationCompleteMap.set(messageId, true)
  // Trigger any pending callbacks
  pendingAppendCallbacks.forEach(callback => {
    try {
      callback()
    } catch (e) {
      console.error('Error in pending append callback:', e)
    }
  })
  pendingAppendCallbacks.clear()
}

export function isAnimationComplete(messageId: string): boolean {
  return animationCompleteMap.get(messageId) ?? false
}

export function clearAnimationState(messageId: string) {
  animationCompleteMap.delete(messageId)
}

export function getLastAssistantMessageId(messages: Array<{ id: string; role: string }>): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') {
      return messages[i].id
    }
  }
  return null
}

export function addPendingAppendCallback(callback: () => void) {
  pendingAppendCallbacks.add(callback)
}

export function removePendingAppendCallback(callback: () => void) {
  pendingAppendCallbacks.delete(callback)
}

