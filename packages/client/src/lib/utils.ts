import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { formatDistanceToNow, format, isToday, isYesterday, parseISO } from 'date-fns'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: Date | string): string {
  const parsedDate = typeof date === 'string' ? parseISO(date) : date

  return format(parsedDate, 'MMM d, yyyy h:mm a')
}

export function formatTime(date: Date | string): string {
  const parsedDate = typeof date === 'string' ? parseISO(date) : date

  // Show relative time for recent messages
  if (isToday(parsedDate)) {
    const distance = formatDistanceToNow(parsedDate, { addSuffix: true })
    // Show "just now" for very recent messages (less than 1 minute)
    if (distance.includes('less than a minute') || distance.includes('1 minute')) {
      return 'just now'
    }
    return distance
  }

  // Show "yesterday" for yesterday's messages
  if (isYesterday(parsedDate)) {
    return `yesterday ${format(parsedDate, 'h:mm a')}`
  }

  // Show full date for older messages
  return format(parsedDate, 'MMM d, h:mm a')
}

export function generateId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36)
}

/**
 * Validates if a URL is safe for internal redirects
 * Prevents open redirect vulnerabilities
 * 
 * @param url - The URL to validate
 * @returns true if the URL is safe for internal redirect, false otherwise
 */
export function isValidRedirectUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false
  
  // Must start with / (relative path)
  if (!url.startsWith('/')) return false
  
  // Prevent protocol-relative URLs (//evil.com)
  if (url.startsWith('//')) return false
  
  // Prevent javascript: and data: URLs
  if (/^(javascript|data):/i.test(url)) return false
  
  // Additional safety: no @ symbols (prevents user:pass@host URLs)
  if (url.includes('@')) return false
  
  return true
}
