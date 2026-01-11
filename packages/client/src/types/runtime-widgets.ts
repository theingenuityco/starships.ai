import type { SupportedWidgetType } from '@/lib/widgets'

export type RuntimeWidgetStatus = 'pending' | 'creating' | 'ready' | 'updated' | 'error'

export interface RuntimeWidgetInstance {
  runtimeId: string
  conversationId: string
  widgetId?: string
  widgetType: SupportedWidgetType | string
  props: Record<string, unknown>
  name?: string
  description?: string
  messageId?: string
  toolCallId?: string
  status?: RuntimeWidgetStatus
  source?: 'ui_action'
  createdAt: number
}
