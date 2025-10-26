'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { Icon } from '@/components/primitives/Icon'
import { Progress } from '@/components/ui/progress'
import { 
  calculatePasswordStrength, 
  checkPasswordRequirements,
  getStrengthColorClass,
  type PasswordStrength,
  type PasswordRequirements 
} from '@/utils/passwordStrength'

interface PasswordStrengthMeterProps {
  password: string
  showRequirements?: boolean
  className?: string
}

export function PasswordStrengthMeter({ 
  password, 
  showRequirements = true,
  className 
}: PasswordStrengthMeterProps) {
  const [strength, setStrength] = useState<PasswordStrength>({
    score: 0,
    label: 'Very Weak',
    color: 'text-gray-500',
    percentage: 0,
    feedback: [],
  })
  const [requirements, setRequirements] = useState<PasswordRequirements>({
    minLength: false,
    hasUppercase: false,
    hasLowercase: false,
    hasNumber: false,
    hasSpecial: false,
  })

  useEffect(() => {
    if (!password) {
      setStrength({
        score: 0,
        label: 'Very Weak',
        color: 'text-gray-500',
        percentage: 0,
        feedback: [],
      })
      setRequirements({
        minLength: false,
        hasUppercase: false,
        hasLowercase: false,
        hasNumber: false,
        hasSpecial: false,
      })
      return
    }

    const newStrength = calculatePasswordStrength(password)
    const newRequirements = checkPasswordRequirements(password)
    setStrength(newStrength)
    setRequirements(newRequirements)
  }, [password])

  if (!password) return null

  return (
    <div className={cn('space-y-1', className)}>
      {/* Ultra-compact inline strength meter */}
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                'h-full transition-all duration-300',
                getStrengthColorClass(strength.score)
              )}
              style={{ width: `${strength.percentage}%` }}
            />
          </div>
        </div>
        <span className={cn('text-xs font-medium whitespace-nowrap min-w-[60px]', strength.color)}>
          {strength.label}
        </span>
      </div>

      {/* Ultra-compact Requirements - all in one line with dots */}
      {showRequirements && (
        <div className="flex items-center gap-1 text-xs flex-wrap">
          <RequirementDot met={requirements.minLength} text="8+" />
          <span className="text-muted-foreground/50">•</span>
          <RequirementDot met={requirements.hasUppercase} text="A" />
          <span className="text-muted-foreground/50">•</span>
          <RequirementDot met={requirements.hasLowercase} text="a" />
          <span className="text-muted-foreground/50">•</span>
          <RequirementDot met={requirements.hasNumber} text="1" />
          <span className="text-muted-foreground/50">•</span>
          <RequirementDot met={requirements.hasSpecial} text="!@" />
        </div>
      )}
    </div>
  )
}

function RequirementDot({ met, text }: { met: boolean; text: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5',
        met ? 'text-green-600' : 'text-muted-foreground'
      )}
    >
      <Icon
        name={met ? 'check' : 'x'}
        className={cn(
          'h-2.5 w-2.5',
          met ? 'text-green-600' : 'text-muted-foreground'
        )}
      />
      <span className="text-xs">{text}</span>
    </span>
  )
}

function RequirementItem({ met, text, compact = false }: { met: boolean; text: string; compact?: boolean }) {
  return (
    <div className={cn("flex items-center gap-1.5", compact && "min-h-[18px]")}>
      <Icon
        name={met ? 'check-circle' : 'circle'}
        className={cn(
          compact ? 'h-3 w-3' : 'h-3.5 w-3.5',
          met ? 'text-green-600' : 'text-muted-foreground'
        )}
      />
      <span
        className={cn(
          'text-xs',
          met ? 'text-green-600' : 'text-muted-foreground'
        )}
      >
        {text}
      </span>
    </div>
  )
}