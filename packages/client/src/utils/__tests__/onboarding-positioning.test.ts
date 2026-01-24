/**
 * Unit tests for onboarding positioning utilities
 */

import { calculatePopupPosition } from '../onboarding-positioning'

describe('onboarding-positioning utilities', () => {
  describe('calculatePopupPosition', () => {
    let mockElement: HTMLElement
    let mockGetBoundingClientRect: jest.Mock

    beforeEach(() => {
      // Mock window dimensions
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1920,
      })
      Object.defineProperty(window, 'innerHeight', {
        writable: true,
        configurable: true,
        value: 1080,
      })

      // Create mock element
      mockElement = document.createElement('div')
      mockGetBoundingClientRect = jest.fn()
      mockElement.getBoundingClientRect = mockGetBoundingClientRect
    })

    it('should return null for null element', () => {
      expect(calculatePopupPosition(null)).toBeNull()
    })

    it('should calculate position to the right of element', () => {
      mockGetBoundingClientRect.mockReturnValue({
        top: 100,
        left: 50,
        right: 150,
        bottom: 200,
        width: 100,
        height: 100,
      })

      const result = calculatePopupPosition(mockElement)
      expect(result).not.toBeNull()
      expect(result?.left).toBeGreaterThan(150) // Should be to the right
      expect(result?.top).toBeGreaterThanOrEqual(0)
    })

    it('should flip to left side if popup would go off right edge', () => {
      // Position element near right edge
      mockGetBoundingClientRect.mockReturnValue({
        top: 100,
        left: 1800,
        right: 1900,
        bottom: 200,
        width: 100,
        height: 100,
      })

      const result = calculatePopupPosition(mockElement)
      expect(result).not.toBeNull()
      expect(result?.left).toBeLessThan(1800) // Should be to the left
    })

    it('should adjust position if popup would go off bottom edge', () => {
      // Position element near bottom
      mockGetBoundingClientRect.mockReturnValue({
        top: 1000,
        left: 50,
        right: 150,
        bottom: 1100,
        width: 100,
        height: 100,
      })

      const result = calculatePopupPosition(mockElement)
      expect(result).not.toBeNull()
      expect(result?.top).toBeLessThan(1080 - 200) // Should fit in viewport
    })

    it('should adjust position if popup would go off top edge', () => {
      // Position element near top
      mockGetBoundingClientRect.mockReturnValue({
        top: 0,
        left: 50,
        right: 150,
        bottom: 100,
        width: 100,
        height: 100,
      })

      const result = calculatePopupPosition(mockElement)
      expect(result).not.toBeNull()
      expect(result?.top).toBeGreaterThanOrEqual(16) // Should respect padding
    })

    it('should calculate pointer position correctly', () => {
      mockGetBoundingClientRect.mockReturnValue({
        top: 100,
        left: 50,
        right: 150,
        bottom: 200,
        width: 100,
        height: 100,
      })

      const result = calculatePopupPosition(mockElement)
      expect(result).not.toBeNull()
      expect(result?.pointerTop).toBeDefined()
      expect(result?.pointerTop).toBeGreaterThanOrEqual(0)
      expect(result?.pointerTop).toBeLessThanOrEqual(200) // Within popup height
    })

    it('should use custom config when provided', () => {
      mockGetBoundingClientRect.mockReturnValue({
        top: 100,
        left: 50,
        right: 150,
        bottom: 200,
        width: 100,
        height: 100,
      })

      const result = calculatePopupPosition(mockElement, {
        popupWidth: 400,
        popupHeight: 300,
        spacing: 20,
      })

      expect(result).not.toBeNull()
      // Position should account for custom dimensions
      expect(result?.left).toBe(150 + 20) // right + spacing
    })
  })
})
