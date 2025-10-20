'use client'

import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm'
import { StarfieldBackground } from '@/components/StarfieldBackground'
import { StarTheme } from '@/components/theme-context'
import { motion } from 'motion/react'
import Link from 'next/link'
import { Suspense } from 'react'

export default function ForgotPasswordPage() {
  return (
    <StarTheme theme="dark">
      <div className="min-h-screen bg-background relative overflow-hidden flex items-center justify-center">
        <Suspense fallback={<div className="absolute inset-0 bg-background" />}>
          <StarfieldBackground launching={false} density={400} speed={0.8} />
        </Suspense>

        {/* Overlay for better text readability */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/40 to-black/60 pointer-events-none" />

        <div className="relative z-10 w-full max-w-md px-6">
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
              <h1 className="text-3xl font-bold bg-gradient-to-r from-white via-primary to-white bg-clip-text text-transparent">
                Reset Password
              </h1>
              <p className="text-muted-foreground mt-2">
                Get back to your starship journey
              </p>
            </motion.div>
          </motion.div>

          <ForgotPasswordForm />

          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            transition={{ delay: 0.8, duration: 0.6 }} 
            className="mt-8 text-center"
          >
            <Link href="/" className="text-sm text-muted-foreground hover:text-primary transition-colors">
              ← Back to home
            </Link>
          </motion.div>
        </div>
      </div>
    </StarTheme>
  )
}