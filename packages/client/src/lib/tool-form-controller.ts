/**
 * Tool Form Controller
 *
 * Provides a programmatic interface for controlling the tool form drawer.
 * This allows Daedalus or other agents to open the drawer and populate form fields.
 */

import type { ToolTemplateCategory } from '@starships/protocol'

export interface ToolFormController {
  /**
   * Opens the tool form drawer
   */
  openDrawer: () => void

  /**
   * Closes the tool form drawer
   */
  closeDrawer: () => void

  /**
   * Updates a specific field in the tool form
   */
  updateField: (field: string, value: string | boolean) => void

  /**
   * Gets the current form data
   */
  getFormData: () => any

  /**
   * Resets the form to initial state
   */
  resetForm: () => void

  /**
   * Validates and submits the form
   */
  submitForm: () => void

  /**
   * Helper to set multiple fields at once
   */
  setFormData: (
    data: Partial<{
      name: string
      description: string
      category: ToolTemplateCategory
      exampleUsage: string
      requiresApiKey: boolean
      parameters: string
      blueprint: string
    }>
  ) => void
}

/**
 * Global tool form controller instance
 * This is set by ConversationInterface when it mounts
 */
let globalController: ToolFormController | null = null

/**
 * Register the global tool form controller
 * Called by ConversationInterface on mount
 */
export function registerToolFormController(controller: ToolFormController) {
  globalController = controller

  // Also expose on window for easy access from console/debugging
  if (typeof window !== 'undefined') {
    ;(window as any).__toolFormController = controller
  }
}

/**
 * Unregister the global tool form controller
 * Called by ConversationInterface on unmount
 */
export function unregisterToolFormController() {
  globalController = null

  if (typeof window !== 'undefined') {
    delete (window as any).__toolFormController
  }
}

/**
 * Get the global tool form controller
 * Returns null if not registered
 */
export function getToolFormController(): ToolFormController | null {
  return globalController
}

/**
 * Helper function to open the tool form drawer
 * Throws if controller is not registered
 */
export function openToolFormDrawer() {
  if (!globalController) {
    throw new Error('Tool form controller not registered. Make sure ConversationInterface is mounted.')
  }
  globalController.openDrawer()
}

/**
 * Helper function to populate the tool form with data
 * Throws if controller is not registered
 */
export function populateToolForm(
  data: Partial<{
    name: string
    description: string
    category: ToolTemplateCategory
    exampleUsage: string
    requiresApiKey: boolean
    parameters: string | object
    blueprint: string | object
  }>
) {
  if (!globalController) {
    throw new Error('Tool form controller not registered. Make sure ConversationInterface is mounted.')
  }

  // Convert objects to JSON strings if needed
  const processedData = {
    ...data,
    parameters: typeof data.parameters === 'object' ? JSON.stringify(data.parameters, null, 2) : data.parameters,
    blueprint: typeof data.blueprint === 'object' ? JSON.stringify(data.blueprint, null, 2) : data.blueprint,
  }

  globalController.setFormData(processedData as any)
}

/**
 * Helper function to open and populate the tool form in one call
 */
export function openAndPopulateToolForm(data: Parameters<typeof populateToolForm>[0]) {
  openToolFormDrawer()
  // Small delay to ensure drawer is open before populating
  setTimeout(() => {
    populateToolForm(data)
  }, 100)
}
