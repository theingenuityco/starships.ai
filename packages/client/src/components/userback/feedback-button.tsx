'use client'

import React from 'react'
import type { UserbackFeedbackType } from '@userback/widget'
import { useUserback } from './userback-provider'
import { Button } from '@/components/ui/button'

interface FeedbackButtonProps {
  /**
   * The type of feedback form to open
   * Options: 'general', 'bug', 'feature', etc.
   */
  formType?: UserbackFeedbackType
  /**
   * Custom button text
   */
  children?: React.ReactNode
  /**
   * Button variant
   */
  variant?: 'default' | 'outline' | 'ghost' | 'link' | 'destructive' | 'secondary'
  /**
   * Button size
   */
  size?: 'default' | 'sm' | 'lg' | 'icon'
  /**
   * Additional class names
   */
  className?: string
}

/**
 * A button component that opens the Userback feedback widget
 *
 * @example
 * ```tsx
 * <FeedbackButton>Send Feedback</FeedbackButton>
 * <FeedbackButton formType="bug">Report a Bug</FeedbackButton>
 * <FeedbackButton variant="outline" size="sm">Feedback</FeedbackButton>
 * ```
 */
export function FeedbackButton({
  formType,
  children,
  variant,
  size,
  className
}: FeedbackButtonProps) {
  const userback = useUserback()

  const handleClick = () => {
    if (userback) {
      if (formType) {
        userback.openForm(formType)
      } else {
        userback.openForm()
      }
    } else {
      console.warn('Userback is not ready yet')
    }
  }

  return (
    <Button
      onClick={handleClick}
      variant={variant}
      size={size}
      className={className}
    >
      {children}
    </Button>
  )
}
