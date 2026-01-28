/**
 * Utility functions for calculating onboarding popup positions
 * Extracted from NavigationOnboardingTour for better testability and maintainability
 */

export interface PopupPosition {
  top: number
  left: number
  pointerTop?: number
}

export interface PositioningConfig {
  popupWidth: number
  popupHeight: number
  spacing: number
  viewportPadding: number
}

const DEFAULT_CONFIG: PositioningConfig = {
  popupWidth: 320,
  popupHeight: 200,
  spacing: 16,
  viewportPadding: 16,
}

/**
 * Calculate popup position relative to a target element
 * Handles viewport edge cases and pointer positioning
 * 
 * @param targetElement - The DOM element to position the popup relative to
 * @param config - Optional configuration to override defaults
 * @returns Popup position with coordinates and pointer position, or null if element is invalid
 */
export function calculatePopupPosition(
  targetElement: HTMLElement | null,
  config: Partial<PositioningConfig> = {}
): PopupPosition | null {
  if (!targetElement) return null

  const cfg = { ...DEFAULT_CONFIG, ...config }
  const rect = targetElement.getBoundingClientRect()
  const viewport = {
    width: window.innerWidth,
    height: window.innerHeight,
  }

  // Calculate target center
  const targetCenterY = rect.top + rect.height / 2

  // Initial position: to the right of target, vertically centered
  let left = rect.right + cfg.spacing
  let top = targetCenterY - cfg.popupHeight / 2

  // Adjust for viewport boundaries
  const adjusted = adjustForViewport(
    { left, top },
    rect,
    cfg,
    viewport
  )

  // Calculate pointer position (relative to popup top)
  // Pointer should point to the center of the navigation item
  const pointerTop = targetCenterY - adjusted.top

  return {
    top: adjusted.top,
    left: adjusted.left,
    pointerTop: clamp(pointerTop, 0, cfg.popupHeight), // Keep pointer within popup bounds
  }
}

/**
 * Adjust position to keep popup within viewport
 */
function adjustForViewport(
  position: { left: number; top: number },
  targetRect: DOMRect,
  config: PositioningConfig,
  viewport: { width: number; height: number }
): { left: number; top: number } {
  let { left, top } = position

  // Check right edge - flip to left side if needed
  if (left + config.popupWidth > viewport.width) {
    left = targetRect.left - config.popupWidth - config.spacing
  }

  // Ensure we don't go off left edge either
  if (left < config.viewportPadding) {
    left = config.viewportPadding
  }

  // Check bottom edge
  if (top + config.popupHeight > viewport.height) {
    top = viewport.height - config.popupHeight - config.viewportPadding
  }

  // Check top edge
  if (top < config.viewportPadding) {
    top = config.viewportPadding
  }

  return { left, top }
}

/**
 * Clamp a value between min and max
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
