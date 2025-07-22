/**
 * Utils Library Tests
 * Tests utility functions used throughout the client
 */

import { cn } from '../utils'

describe('Utils Library', () => {
  describe('cn (className utility)', () => {
    it('should merge class names correctly', () => {
      const result = cn('base-class', 'additional-class')
      expect(result).toContain('base-class')
      expect(result).toContain('additional-class')
    })

    it('should handle conditional classes', () => {
      const isActive = true
      const isDisabled = false
      
      const result = cn(
        'base-class',
        isActive && 'active-class',
        isDisabled && 'disabled-class'
      )
      
      expect(result).toContain('base-class')
      expect(result).toContain('active-class')
      expect(result).not.toContain('disabled-class')
    })

    it('should handle undefined and null values', () => {
      const result = cn('base-class', undefined, null, 'valid-class')
      
      expect(result).toContain('base-class')
      expect(result).toContain('valid-class')
      expect(result).not.toContain('undefined')
      expect(result).not.toContain('null')
    })

    it('should handle empty strings', () => {
      const result = cn('base-class', '', 'valid-class')
      
      expect(result).toContain('base-class')
      expect(result).toContain('valid-class')
      expect(result).not.toMatch(/\s{2,}/) // No double spaces
    })

    it('should handle arrays of classes', () => {
      const result = cn(['class1', 'class2'], 'class3')
      
      expect(result).toContain('class1')
      expect(result).toContain('class2')
      expect(result).toContain('class3')
    })

    it('should handle complex conditional logic', () => {
      const variant = 'primary'
      const size = 'large'
      const disabled = false
      
      const result = cn(
        'button',
        {
          'button-primary': variant === 'primary',
          'button-secondary': variant === 'secondary',
          'button-large': size === 'large',
          'button-disabled': disabled,
        }
      )
      
      expect(result).toContain('button')
      expect(result).toContain('button-primary')
      expect(result).toContain('button-large')
      expect(result).not.toContain('button-secondary')
      expect(result).not.toContain('button-disabled')
    })

    it('should return empty string for no valid classes', () => {
      const result = cn(undefined, null, false, '')
      
      expect(result).toBe('')
    })

    it('should handle Tailwind CSS merge conflicts', () => {
      // This tests the underlying clsx + twMerge functionality
      const result = cn('p-4 p-2', 'text-red-500 text-blue-500')
      
      // Should resolve conflicts by taking the last value
      expect(result).toContain('p-2') // Later padding wins
      expect(result).not.toContain('p-4')
      expect(result).toContain('text-blue-500') // Later text color wins
      expect(result).not.toContain('text-red-500')
    })

    it('should preserve non-conflicting classes', () => {
      const result = cn('p-4', 'm-2', 'bg-white', 'border')
      
      expect(result).toContain('p-4')
      expect(result).toContain('m-2')
      expect(result).toContain('bg-white')
      expect(result).toContain('border')
    })

    it('should handle responsive classes correctly', () => {
      const result = cn('text-sm md:text-base lg:text-lg', 'text-blue-500')
      
      expect(result).toContain('text-sm')
      expect(result).toContain('md:text-base')
      expect(result).toContain('lg:text-lg')
      expect(result).toContain('text-blue-500')
    })

    it('should handle modifier classes correctly', () => {
      const result = cn('hover:bg-blue-500', 'focus:ring-2', 'active:scale-95')
      
      expect(result).toContain('hover:bg-blue-500')
      expect(result).toContain('focus:ring-2')
      expect(result).toContain('active:scale-95')
    })

    it('should handle dark mode classes correctly', () => {
      const result = cn('bg-white dark:bg-gray-900', 'text-black dark:text-white')
      
      expect(result).toContain('bg-white')
      expect(result).toContain('dark:bg-gray-900')
      expect(result).toContain('text-black')
      expect(result).toContain('dark:text-white')
    })

    it('should be performant with many classes', () => {
      const startTime = performance.now()
      
      const manyClasses = Array.from({ length: 100 }, (_, i) => `class-${i}`)
      const result = cn(...manyClasses)
      
      const endTime = performance.now()
      const duration = endTime - startTime
      
      expect(duration).toBeLessThan(10) // Should complete within 10ms
      expect(result).toContain('class-0')
      expect(result).toContain('class-99')
    })

    it('should handle edge cases gracefully', () => {
      // Test various edge cases that might break the function
      expect(() => cn()).not.toThrow()
      expect(() => cn('')).not.toThrow()
      expect(() => cn(null, undefined, false, 0)).not.toThrow()
      expect(() => cn({ '': true, ' ': false })).not.toThrow()
    })

    it('should be consistent across multiple calls', () => {
      const classes = ['base', 'modifier', 'state']
      
      const result1 = cn(...classes)
      const result2 = cn(...classes)
      
      expect(result1).toBe(result2)
    })

    it('should handle object syntax correctly', () => {
      const isActive = true
      const isLoading = false
      const hasError = true
      
      const result = cn({
        'btn': true,
        'btn-active': isActive,
        'btn-loading': isLoading,
        'btn-error': hasError,
        'btn-disabled': false
      })
      
      expect(result).toContain('btn')
      expect(result).toContain('btn-active')
      expect(result).toContain('btn-error')
      expect(result).not.toContain('btn-loading')
      expect(result).not.toContain('btn-disabled')
    })
  })
})