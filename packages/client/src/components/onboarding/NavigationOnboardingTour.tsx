'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'motion/react'
import { useNavigationOnboardingContext } from '@/contexts/NavigationOnboardingContext'
import { ONBOARDING_STEPS, type OnboardingStep } from '@/hooks/useNavigationOnboarding'
import { Button } from '@/components/ui/button'
import Icon from '@/components/primitives/Icon'
import { cn } from '@/lib/utils'
import { calculatePopupPosition } from '@/utils/onboarding-positioning'

interface NavigationOnboardingTourProps {
  starshipSlug?: string | null
  navigationItemRefs: Map<string, React.RefObject<HTMLDivElement | null>>
}

export function NavigationOnboardingTour({ starshipSlug, navigationItemRefs }: NavigationOnboardingTourProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { currentStep, currentStepInfo, totalSteps, nextStep, previousStep, shouldShowOnboarding, startOnboarding, skipTour, isCompleting } = useNavigationOnboardingContext()
  const [popupPosition, setPopupPosition] = useState<{ top: number; left: number; pointerTop?: number } | null>(null)
  const popupRef = useRef<HTMLDivElement>(null)

  // Calculate sidebar width dynamically to exclude it from overlay
  const [sidebarWidth, setSidebarWidth] = useState(312) // Default: 56px (rail) + 256px (expanded sidebar)

  // Handle initial redirect: if on conversations page, redirect to marketplace
  // Split into two effects to avoid race conditions (matches conversations/layout.tsx pattern)
  useEffect(() => {
    if (!shouldShowOnboarding || currentStep !== null || isCompleting) return

    // If on conversations page, redirect to marketplace first
    if (pathname.includes('/conversations')) {
      router.replace('/marketplace')
      return // Let pathname change effect handle starting
    }
  }, [shouldShowOnboarding, currentStep, pathname, router, isCompleting])

  // Separate effect watches pathname changes to start onboarding when ready
  // Uses requestAnimationFrame for DOM readiness (matches client-layout.tsx pattern)
  useEffect(() => {
    if (!shouldShowOnboarding || currentStep !== null) return

    // When we land on marketplace, start onboarding
    if (pathname === '/marketplace' || pathname.includes('/marketplace')) {
      // Use RAF only for DOM readiness, not navigation timing
      const rafId = requestAnimationFrame(() => {
        startOnboarding()
      })
      return () => cancelAnimationFrame(rafId)
    }
  }, [pathname, shouldShowOnboarding, currentStep, startOnboarding])

  // Get route for current step
  const getStepRoute = (step: OnboardingStep | null): string | null => {
    if (!step) return null

    // Step 1 is marketplace (no starship slug needed)
    if (step.step === 1) {
      return '/marketplace'
    }

    // Steps 2+ need starship slug
    if (!starshipSlug) return null

    const routeMap: Record<number, string> = {
      2: `/ship/${starshipSlug}/connectors`,
      3: `/ship/${starshipSlug}/agents`,
      4: `/ship/${starshipSlug}/schedules`,
      // Steps 5-6 ("Channels" + "Direct messages") anchor to sidebar sections, which are visible on starship pages.
      // Keep the user on the schedules page (last starship page in this tour) for consistency.
      5: `/ship/${starshipSlug}/schedules`,
      6: `/ship/${starshipSlug}/schedules`,
    }

    return routeMap[step.step] || null
  }

  // Navigate to step route when step changes
  useEffect(() => {
    if (!shouldShowOnboarding) return

    // If we have a current step, navigate to its route
    if (currentStepInfo) {
      const route = getStepRoute(currentStepInfo)
      if (route && pathname !== route) {
        // Use replace to avoid adding to history during onboarding
        router.replace(route)
      }
    }
    // If step 1 is active but we're not on marketplace, navigate there
    else if (currentStep === 1 && pathname !== '/marketplace' && !pathname.includes('/marketplace')) {
      router.replace('/marketplace')
    }
  }, [currentStep, currentStepInfo, starshipSlug, pathname, router, shouldShowOnboarding])

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
      5: 'Channels',
      6: 'Direct messages',
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

    // Calculate position using utility function
    const position = calculatePopupPosition(element, {
      popupWidth: 320,
      popupHeight: 220,
    })

    setPopupPosition(position)
  }, [currentStepInfo, navigationItemRefs, shouldShowOnboarding])

  // Update sidebar width dynamically with error handling
  useEffect(() => {
    const updateSidebarWidth = () => {
      try {
        const sidebar = document.querySelector('[data-navigation-sidebar]') as HTMLElement
        if (sidebar) {
          const rect = sidebar.getBoundingClientRect()
          if (rect.width > 0) {
            setSidebarWidth(rect.width)
            return
          }
        }
      } catch (error) {
        // Silent fallback - matches codebase pattern of not logging everything
      }

      // Fallback to default if sidebar not found or invalid
      setSidebarWidth(312)
    }

    updateSidebarWidth()

    // Try to observe sidebar
    try {
      const sidebar = document.querySelector('[data-navigation-sidebar]')
      if (sidebar) {
        const observer = new ResizeObserver(updateSidebarWidth)
        observer.observe(sidebar)
        window.addEventListener('resize', updateSidebarWidth)

        return () => {
          observer.disconnect()
          window.removeEventListener('resize', updateSidebarWidth)
        }
      }
    } catch (error) {
      // Fallback: just listen to window resize
    }

    // Fallback: just listen to window resize if sidebar not found
    window.addEventListener('resize', updateSidebarWidth)
    return () => {
      window.removeEventListener('resize', updateSidebarWidth)
    }
  }, [])

  if (!shouldShowOnboarding || !currentStep || !currentStepInfo || !popupPosition) {
    return null
  }

  const isFirstStep = currentStep === 1
  const isLastStep = currentStep === totalSteps

  return (
    <>
      {/* Overlay - excludes navigation sidebar */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed bg-black/50 z-[9998]"
        style={{
          pointerEvents: 'auto',
          top: 0,
          right: 0,
          bottom: 0,
          left: `${sidebarWidth}px`,
        }}
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
                <div className="flex items-center gap-2">
                  {currentStepInfo.icon && <Icon name={currentStepInfo.icon} className="w-5 h-5 text-primary" />}
                  <h3 className="text-lg font-semibold text-foreground">{currentStepInfo.label}</h3>
                </div>
                <p className="text-sm text-muted-foreground mt-1">{currentStepInfo.description}</p>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between pt-2 border-t border-border">
                {/* Step indicator and Skip - bottom left */}
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">
                    {currentStep}/{totalSteps}
                  </span>
                  <Button variant="ghost" size="sm" onClick={skipTour} disabled={isCompleting} className="text-xs text-muted-foreground h-auto py-0 px-0 hover:text-foreground">
                    Skip tour (don&apos;t show again)
                  </Button>
                </div>

                {/* Navigation buttons - bottom right */}
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={previousStep} disabled={isFirstStep} className="text-xs">
                    Back
                  </Button>
                  <Button variant="default" size="sm" onClick={nextStep} className="text-xs">
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
