// Notifications were removed in the org-layer pivot. This is a no-op stub so the
// surviving nav/favicon UI compiles and degrades gracefully (no unread badges).
// TODO: remove the notification UI entirely.

export const NOTIFICATION_QUERY_KEYS = {
  all: ['notifications'] as const,
  byStarship: (starshipId: string) => ['notifications', starshipId] as const,
  stream: (starshipId: string) => ['notifications', 'stream', starshipId] as const,
}

export function useNotificationsList(_starshipId?: string | null, _enabled?: boolean) {
  return { data: undefined as unknown, isLoading: false, error: null }
}

export function useMarkConversationRead() {
  return { mutate: () => undefined, mutateAsync: async () => undefined, isPending: false }
}
