'use client'

import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm'
import { StarTheme } from '@/components/theme-context'
import Icon from '@/components/primitives/Icon'
import { motion } from 'motion/react'
import { AuthMarketingPanel } from '@/components/auth/AuthMarketingPanel'

export default function ForgotPasswordPage() {
  return (
    <StarTheme theme="dark">
      <div className="min-h-screen bg-black relative overflow-hidden flex">
        {/* Full-screen background - same as login page */}
        <AuthMarketingPanel className="absolute inset-0" />

        {/* Left Side - Content */}
        <div className="hidden lg:flex lg:w-1/2 relative z-10">
          <div className="relative z-10 flex flex-col justify-center px-16 text-white">
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
            >
              <h1 className="text-5xl font-bold mb-6 text-white">
                Secure Account Recovery
              </h1>
              <p className="text-xl text-gray-300 mb-8 leading-relaxed">
                We&apos;ll help you get back to building your AI automations safely
              </p>
              <div className="space-y-4">
                <motion.div
                  className="flex items-center gap-3"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.6, delay: 0.4 }}
                >
                  <div className="w-10 h-10 rounded-md border border-white/10 bg-white/5 flex items-center justify-center">
                    <Icon name="shield-check" className="w-5 h-5 text-primary" />
                  </div>
                  <span className="text-gray-200">Your agents and data stay protected</span>
                </motion.div>
                <motion.div
                  className="flex items-center gap-3"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.6, delay: 0.6 }}
                >
                  <div className="w-10 h-10 rounded-md border border-white/10 bg-white/5 flex items-center justify-center">
                    <Icon name="zap" className="w-5 h-5 text-primary" />
                  </div>
                  <span className="text-gray-200">Back to your automations in seconds</span>
                </motion.div>
                <motion.div
                  className="flex items-center gap-3"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.6, delay: 0.8 }}
                >
                  <div className="w-10 h-10 rounded-md border border-white/10 bg-white/5 flex items-center justify-center">
                    <Icon name="mail" className="w-5 h-5 text-primary" />
                  </div>
                  <span className="text-gray-200">Reset instructions sent instantly</span>
                </motion.div>
              </div>
            </motion.div>
          </div>
        </div>

        {/* Right Side - Form */}
        <div className="w-full lg:w-1/2 flex items-center justify-center px-6 py-12 relative z-10">
          <div className="w-full max-w-md">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="mb-8 text-center"
            >
              <motion.div
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, duration: 0.5 }}
                className="mb-6"
              >
                <h1 className="text-3xl font-bold text-primary">
                  Reset Your Password
                </h1>
                <p className="text-muted-foreground mt-2">
                  Get back to your starship journey
                </p>
              </motion.div>
            </motion.div>

            <ForgotPasswordForm />
          </div>
        </div>
      </div>
    </StarTheme>
  )
}