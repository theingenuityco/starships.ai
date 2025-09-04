'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'motion/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Rocket, Sparkles, Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import { StarfieldBackground } from '@/components/StarfieldBackground'
import { checkWaitlistApproval, getWaitlistStatus } from '@/lib/waitlist-api'

export default function WaitlistPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<'success' | 'error' | 'info' | ''>('')
  const [isValidated, setIsValidated] = useState(false)

  // Check if already validated on mount
  useEffect(() => {
    checkSessionStatus()
  }, [])

  const checkSessionStatus = async () => {
    try {
      const data = await getWaitlistStatus()
      if (data.isValidated) {
        // Already validated, redirect to main page
        router.push('/')
      }
    } catch (error) {
      console.error('Error checking session status:', error)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!email || !email.includes('@')) {
      setMessage('Please enter a valid email address')
      setMessageType('error')
      return
    }

    setIsLoading(true)
    setMessage('')
    setMessageType('')

    try {
      const data = await checkWaitlistApproval(email)

      if (data.isApproved) {
        setMessage(data.message)
        setMessageType('success')
        setIsValidated(true)

        // Use window.location for hard redirect to ensure cookie is properly set
        setTimeout(() => {
          window.location.href = data.redirectUrl || '/'
        }, 2000)
      } else {
        setMessage(data.message)
        setMessageType('info')
      }
    } catch {
      setMessage('Service temporarily unavailable. Please try again.')
      setMessageType('error')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen bg-black dark:bg-black text-white overflow-hidden">
      <StarfieldBackground />

      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="w-full max-w-md"
        >
          {/* Private Alpha Badge */}
          <div className="flex justify-center mb-6">
            <Badge className="px-4 py-1.5 text-sm bg-primary/20 text-primary border-primary/30">
              <Sparkles className="w-3 h-3 mr-1.5" />
              Private Alpha
            </Badge>
          </div>

          {/* Logo and Title */}
          <div className="text-center mb-8">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="flex justify-center mb-4"
            >
              <div className="w-20 h-20 bg-gradient-to-br from-primary to-primary/80 rounded-full flex items-center justify-center">
                <Rocket className="w-10 h-10 text-primary-foreground" />
              </div>
            </motion.div>

            <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              Starships.ai
            </h1>
            <p className="text-muted-foreground">Your AI-powered mission control</p>
          </div>

          {/* Waitlist Form Card */}
          <Card className="p-6 bg-gray-900/80 dark:bg-gray-900/80 backdrop-blur-md border-gray-700 dark:border-gray-700">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
                  Enter your email to join the waitlist
                </label>
                <Input
                  id="email"
                  type="email"
                  placeholder="captain@starship.ai"
                  value={email}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                  disabled={isLoading || isValidated}
                  className="bg-gray-800/50 dark:bg-gray-800/50 border-gray-600 dark:border-gray-600 text-white dark:text-white placeholder-gray-400 dark:placeholder-gray-400 focus:border-primary focus:ring-primary"
                  required
                />
              </div>

              <Button
                type="submit"
                disabled={isLoading || isValidated}
                className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white dark:text-white disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Checking...
                  </>
                ) : isValidated ? (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Validated!
                  </>
                ) : (
                  'Join the Waitlist'
                )}
              </Button>
            </form>

            {/* Message Display */}
            {message && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`mt-4 p-3 rounded-lg flex items-start space-x-2 ${
                  messageType === 'success'
                    ? 'bg-green-500/20 text-green-600 dark:text-green-400 border border-green-500/30'
                    : messageType === 'error'
                      ? 'bg-destructive/20 text-destructive border border-destructive/30'
                      : 'bg-primary/20 text-primary border border-primary/30'
                }`}
              >
                {messageType === 'success' ? (
                  <CheckCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                ) : messageType === 'error' ? (
                  <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                ) : (
                  <Sparkles className="w-5 h-5 mt-0.5 flex-shrink-0" />
                )}
                <span className="text-sm">{message}</span>
              </motion.div>
            )}
          </Card>

          {/* Additional Info */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.8 }}
            className="mt-8 text-center text-sm text-muted-foreground"
          >
            <p>Be among the first to experience the future of AI mission control</p>
            <p className="mt-2">Currently accepting a limited number of alpha testers</p>
          </motion.div>
        </motion.div>
      </div>
    </div>
  )
}
