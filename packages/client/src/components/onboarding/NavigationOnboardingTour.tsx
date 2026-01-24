'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'motion/react'
import { useNavigationOnboarding, type OnboardingStep } from '@/hooks/useNavigationOnboarding'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface NavigationOnboardingTourProps {
  starshipSlug?: string | null
  navigationItemRefs: Map<string, React.RefObject<HTMLElement>>
}

export function NavigationOnboardingTour({ starshipSlug, navigationItemRefs }: NavigationOnboardingTourProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { currentStep, currentStepInfo, totalSteps, nextStep, previousStep, shouldShowOnboarding, startOnboarding } = useNavigationOnboarding()
  const [popupPosition, setPopupPosition] = useState<{ top: number; left: number; pointerTop?: number } | null>(null)
  const popupRef = useRef<HTMLDivElement>(null)

  // Start onboarding when component mounts and should show
  // Only start on conversations page (as per requirements)
  useEffect(() => {
    if (shouldShowOnboarding && currentStep === null && pathname.includes('/conversations')) {
      // Small delay to ensure navigation items are rendered
      const timer = setTimeout(() => {
        startOnboarding()
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [shouldShowOnboarding, currentStep, startOnboarding, pathname])

  // Get route for current step
  const getStepRoute = (step: OnboardingStep | null): string | null => {
    if (!step || !starshipSlug) return null

    // Step 1 is marketplace (no starship slug needed)
    if (step.step === 1) {
      return '/marketplace'
    }

    // Steps 2-5 need starship slug
    const routeMap: Record<number, string> = {
      2: `/ship/${starshipSlug}/connectors`,
      3: `/ship/${starshipSlug}/agents`,
      4: `/ship/${starshipSlug}/schedules`,
      5: `/ship/${starshipSlug}/conversations`,
    }

    return routeMap[step.step] || null
  }

  // Navigate to step route when step changes
  useEffect(() => {
    if (!currentStepInfo || !shouldShowOnboarding) return

    const route = getStepRoute(currentStepInfo)
    if (route && pathname !== route) {
      router.push(route)
    }
  }, [currentStepInfo, starshipSlug, pathname, router, shouldShowOnboarding])

  // Update popup position when step or navigation items change
  useEffect(() => {
    if (!currentStepInfo || !shouldShowOnboarding) {
      setPopupPosition(null)
      return
    }

    // Map step labels to ref keys
    const refKeyMap: Record<number, string> = {
      1: 'Explore Agents',
      2: 'Connectors',
      3: 'My Agents',
      4: 'Schedules',
      5: 'New Chat',
    }

    const refKey = refKeyMap[currentStepInfo.step]
    if (!refKey) {
      setPopupPosition(null)
      return
    }

    const itemRef = navigationItemRefs.get(refKey)
    const element = itemRef?.current

    if (!element) {
      setPopupPosition(null)
      return
    }

    // Calculate position: popup appears to the right of the navigation item
    const rect = element.getBoundingClientRect()
    const popupWidth = 320 // Approximate popup width
    const popupHeight = 200 // Approximate popup height
    const spacing = 16 // Space between item and popup

    // Calculate navigation item center position
    const itemCenterY = rect.top + rect.height / 2

    // Position popup to the right of the navigation item
    // Try to align popup center vertically with navigation item center
    let top = itemCenterY - popupHeight / 2
    const left = rect.right + spacing

    // Ensure popup stays within viewport
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    let finalLeft = left
    let finalTop = top

    // Adjust if popup would go off right edge
    if (finalLeft + popupWidth > viewportWidth) {
      finalLeft = rect.left - popupWidth - spacing
    }

    // Adjust if popup would go off bottom
    if (finalTop + popupHeight > viewportHeight) {
      finalTop = viewportHeight - popupHeight - 16
    }

    // Adjust if popup would go off top
    if (finalTop < 16) {
      finalTop = 16
    }

    // Calculate pointer position relative to popup top
    // Pointer should point to the center of the navigation item
    const pointerTop = itemCenterY - finalTop

    setPopupPosition({ top: finalTop, left: finalLeft, pointerTop })
  }, [currentStepInfo, navigationItemRefs, shouldShowOnboarding])

  if (!shouldShowOnboarding || !currentStep || !currentStepInfo || !popupPosition) {
    return null
  }

  const isFirstStep = currentStep === 1
  const isLastStep = currentStep === totalSteps

  return (
    <>
      {/* Overlay */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 z-[9998]"
        style={{ pointerEvents: 'auto' }}
      />

      {/* Popup */}
      <AnimatePresence>
        {currentStepInfo && (
          <motion.div
            ref={popupRef}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed z-[9999] bg-card border-2 border-primary rounded-lg shadow-2xl p-6"
            style={{
              top: `${popupPosition.top}px`,
              left: `${popupPosition.left}px`,
              width: '320px',
              maxWidth: '90vw',
            }}
          >
            {/* Pointer - pointing left to navigation item */}
            {popupPosition.pointerTop !== undefined && (
              <div
                className="absolute left-0 w-0 h-0"
                style={{
                  top: `${popupPosition.pointerTop}px`,
                  transform: 'translateX(-100%) translateY(-50%)',
                  borderTop: '12px solid transparent',
                  borderBottom: '12px solid transparent',
                  borderRight: '12px solid hsl(var(--primary))',
                }}
              />
            )}

            {/* Content */}
            <div className="space-y-4">
              {/* Title */}
              <div>
                <h3 className="text-lg font-semibold text-foreground">{currentStepInfo.label}</h3>
                <p className="text-sm text-muted-foreground mt-1">{currentStepInfo.description}</p>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between pt-2 border-t border-border">
                {/* Step indicator - bottom left */}
                <span className="text-xs text-muted-foreground">
                  {currentStep}/{totalSteps}
                </span>

                {/* Navigation buttons - bottom right */}
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={previousStep}
                    disabled={isFirstStep}
                    className="text-xs"
                  >
                    Back
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={nextStep}
                    className="text-xs"
                  >
                    {isLastStep ? 'Finish' : 'Next'}
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
