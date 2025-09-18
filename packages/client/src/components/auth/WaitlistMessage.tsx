'use client'

import { Card } from '@/components/ui/card'
import { CheckCircle, Clock, Rocket } from 'lucide-react'
import { motion } from 'motion/react'

interface WaitlistMessageProps {
  message: string
  onClose?: () => void
}

export function WaitlistMessage({ message, onClose }: WaitlistMessageProps) {
  return (
    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }}>
      <Card className="p-6 bg-primary/10 border-primary/30">
        <div className="flex items-start space-x-3">
          <motion.div
            initial={{ rotate: -10 }}
            animate={{ rotate: 10 }}
            transition={{ repeat: Infinity, repeatType: 'reverse', duration: 2 }}
          >
            <Clock className="h-6 w-6 text-primary" />
          </motion.div>

          <div className="flex-1">
            <h3 className="font-semibold mb-2 flex items-center">
              <Rocket className="h-5 w-5 mr-2" />
              You're on the waitlist!
            </h3>
            <p className="text-muted-foreground">{message}</p>
          </div>

          {onClose && (
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl leading-none px-2">
              ×
            </button>
          )}
        </div>
      </Card>
    </motion.div>
  )
}