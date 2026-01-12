'use client'

import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm'
import { StarTheme } from '@/components/theme-context'
import { motion } from 'motion/react'
import { AuthMarketingPanel } from '@/components/auth/AuthMarketingPanel'

export default function ForgotPasswordPage() {
  return (
    <StarTheme theme="dark">
      <div className="min-h-screen bg-black relative overflow-hidden flex items-center justify-center">
        {/* Full-screen background - same as login page */}
        <AuthMarketingPanel className="absolute inset-0" />

        {/* Centered Form */}
        <div className="w-full flex items-center justify-center px-6 py-16 relative z-10">
          <div className="w-full max-w-md">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="mb-8 text-center">
              <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} transition={{ delay: 0.2, duration: 0.5 }} className="mb-6">
                <h1 className="text-3xl font-bold text-primary">Reset Your Password</h1>
                <p className="text-muted-foreground mt-2">Get back to your starship journey</p>
              </motion.div>
            </motion.div>

            <ForgotPasswordForm />
          </div>
        </div>
      </div>
    </StarTheme>
  )
}
