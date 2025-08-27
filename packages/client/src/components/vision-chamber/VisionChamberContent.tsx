'use client'

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { SimpleVisionChamber } from './SimpleVisionChamber'
import { SibilFloatingMessage } from '@/components/sibil/SibilFloatingMessage'
import { 
  ArrowLeft, Eye, Loader2, Activity, 
  Sparkles, Info, CheckCircle
} from 'lucide-react'
import Link from 'next/link'
import { starshipAPI, Starship } from '@/lib/api'
import { useStarshipStore } from '@/store/starship-store'
import { useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'motion/react'

interface VisionChamberContentProps {
  slug: string
}

export function VisionChamberContent({ slug }: VisionChamberContentProps) {
  const [starship, setStarship] = useState<Starship | null>(null)
  const [starshipLoading, setStarshipLoading] = useState(true)
  const [showFloatingMessage, setShowFloatingMessage] = useState(false)
  const [isManualOpen, setIsManualOpen] = useState(false)
  const [showPaymentSuccess, setShowPaymentSuccess] = useState(false)
  const {  } = useStarshipStore()
  const searchParams = useSearchParams()

  // Fetch starship data and check if first starship
  useEffect(() => {
    const fetchStarship = async () => {
      try {
        setStarshipLoading(true)
        const data = await starshipAPI.getStarshipBySlug(slug)
        setStarship(data.starship)
        
        // Check if this is the user's first starship and auto-show message
        const dismissed = localStorage.getItem('sibil-vision-message-dismissed')
        if (!dismissed) {
          setShowFloatingMessage(true)
        }
      } catch (error) {
        console.error('Failed to fetch starship:', error)
      } finally {
        setStarshipLoading(false)
      }
    }

    fetchStarship()
  }, [slug])

  // Check for payment success parameter
  useEffect(() => {
    const paymentStatus = searchParams.get('payment')
    
    if (paymentStatus === 'success') {
      // Show success modal
      setShowPaymentSuccess(true)
      
      // Show success toast as well
      toast.success('🎉 Payment successful!', {
        description: 'Your starship is now fully activated and ready for missions.',
        duration: 5000,
      })
      
      // Clean up URL parameters after showing success
      const timer = setTimeout(() => {
        const url = new URL(window.location.href)
        url.searchParams.delete('payment')
        url.searchParams.delete('session_id')
        window.history.replaceState({}, '', url.pathname)
      }, 1000)
      
      return () => clearTimeout(timer)
    }
  }, [searchParams])

  // Function to manually show the info modal
  const handleShowInfo = () => {
    setIsManualOpen(true)
    setShowFloatingMessage(true)
  }

  // State for info button animation
  const [animateInfoButton, setAnimateInfoButton] = useState(false)

  // Handle dismissing the floating message
  const handleDismissMessage = () => {
    setShowFloatingMessage(false)
    setIsManualOpen(false)
    // Animate the info button to show where the information is stored
    setAnimateInfoButton(true)
    setTimeout(() => setAnimateInfoButton(false), 2000)
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-gradient-to-br from-background to-muted/5">
      {/* Enhanced Professional Header - Matching Crew Console Style */}
      <div className="relative overflow-hidden">
        {/* Background gradient effect - reduced opacity */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-primary/2 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-transparent to-primary/5" />
        
        <div className="relative flex items-center justify-between px-8 py-6 backdrop-blur-sm border-b border-border/40">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground hover:bg-primary/10 transition-all -ml-2 px-2"
              asChild
            >
              <Link href="/fleet">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="absolute inset-0 bg-purple-500/5 blur-sm" />
                  <div className="relative bg-gradient-to-br from-purple-500/15 to-purple-500/10 p-3 rounded-xl shadow-sm border border-purple-500/15">
                    <Eye className="h-6 w-6 text-purple-500" />
                  </div>
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center gap-3">
                    <h1 className="text-2xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                      Vision Chamber
                    </h1>
                    <button
                      onClick={handleShowInfo}
                      className="rounded-full p-0 hover:opacity-80 transition-all relative"
                      title="Vision Chamber Guide"
                    >
                      <Info className={`h-6 w-6 text-emerald-500 transition-all ${
                        animateInfoButton ? 'scale-110' : ''
                      }`} />
                      {animateInfoButton && (
                        <span className="absolute inset-0 rounded-full bg-emerald-500/20 animate-ping-slow" />
                      )}
                    </button>
                  </div>
                  <p className="text-sm text-muted-foreground">Explore visual insights and perspectives</p>
                </div>
              </div>

            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Starship info */}
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="absolute inset-0 bg-green-500/5" />
                <div className="relative bg-gradient-to-br from-green-500/15 to-green-500/10 p-2 rounded-lg">
                  <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse" />
                </div>
              </div>
              <div className="flex flex-col">
                <span className="text-base font-semibold text-foreground">
                  {starshipLoading ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Loading...
                    </span>
                  ) : (
                    starship?.name || 'Unknown Starship'
                  )}
                </span>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Activity className="h-3 w-3" />
                  Active Starship
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content - Full Height Vision Chamber */}
      <div className="flex-1 overflow-hidden">
        <SimpleVisionChamber />
      </div>

      {/* Floating Message for first-time users */}
      <SibilFloatingMessage 
        show={showFloatingMessage} 
        onDismiss={handleDismissMessage}
        isManualOpen={isManualOpen}
      />
      {/* Payment Success Modal */}
      <AnimatePresence>
        {showPaymentSuccess && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={() => setShowPaymentSuccess(false)}
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ type: "spring", duration: 0.5 }}
              className="relative max-w-md mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <Card className="border-2 border-green-500/20 bg-background/95 backdrop-blur">
                <CardContent className="p-8">
                  {/* Success Icon with Animation */}
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                    className="flex justify-center mb-6"
                  >
                    <div className="relative">
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                        className="absolute inset-0 rounded-full bg-gradient-to-r from-green-400 to-emerald-600 opacity-20 blur-xl"
                      />
                      <div className="relative bg-gradient-to-br from-green-500 to-emerald-600 rounded-full p-4">
                        <CheckCircle className="w-12 h-12 text-white" />
                      </div>
                    </div>
                  </motion.div>

                  {/* Success Message */}
                  <div className="text-center space-y-4">
                    <motion.h2
                      initial={{ y: 20, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: 0.3 }}
                      className="text-2xl font-bold bg-gradient-to-r from-green-400 to-emerald-600 bg-clip-text text-transparent"
                    >
                      Payment Successful! 🚀
                    </motion.h2>
                    
                    <motion.p
                      initial={{ y: 20, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: 0.4 }}
                      className="text-muted-foreground"
                    >
                      Your starship <span className="font-semibold text-foreground">{starship?.name}</span> is now fully activated and ready for epic missions!
                    </motion.p>

                    {/* Sparkle Effects */}
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.5 }}
                      className="flex justify-center space-x-2 py-2"
                    >
                      {[...Array(3)].map((_, i) => (
                        <motion.div
                          key={i}
                          animate={{
                            y: [0, -10, 0],
                            opacity: [0.5, 1, 0.5],
                          }}
                          transition={{
                            duration: 2,
                            repeat: Infinity,
                            delay: i * 0.2,
                          }}
                        >
                          <Sparkles className="w-5 h-5 text-yellow-400" />
                        </motion.div>
                      ))}
                    </motion.div>

                    {/* Action Button */}
                    <motion.div
                      initial={{ y: 20, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: 0.6 }}
                    >
                      <Button
                        onClick={() => setShowPaymentSuccess(false)}
                        className="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700"
                      >
                        Set Your Vision
                      </Button>
                    </motion.div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}