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
    <div className="space-y-1">
      {/* Compact strength indicator */}
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
        <span className={cn('text-xs font-medium whitespace-nowrap', strength.color)}>
          {strength.label}
        </span>
      </div>

      {/* Ultra-compact inline requirements */}
      <div className="flex items-center gap-1 text-xs">
        <RequirementDot met={requirements.minLength} text="8+" />
        <RequirementDot met={requirements.hasUppercase} text="A" />
        <RequirementDot met={requirements.hasLowercase} text="a" />
        <RequirementDot met={requirements.hasNumber} text="1" />
        <RequirementDot met={requirements.hasSpecial} text="!@" />
      </div>
    </div>
  )
}

function RequirementDot({ met, text }: { met: boolean; text: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-xs',
        met ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
      )}
    >
      <Icon
        name={met ? 'check' : 'x'}
        className="h-2.5 w-2.5"
      />
      <span className="text-xs font-medium">{text}</span>
    </span>
  )
}

function RequirementItem({ met, text, compact = false }: { met: boolean; text: string; compact?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2", compact && "min-h-[18px]")}>
      <div className={cn(
        "flex items-center justify-center rounded-full flex-shrink-0",
        compact ? 'h-3 w-3' : 'h-4 w-4',
        met ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
      )}>
        <Icon
          name={met ? 'check' : 'x'}
          className={cn(
            compact ? 'h-2 w-2' : 'h-2.5 w-2.5'
          )}
        />
      </div>
      <span
        className={cn(
          'text-sm',
          met ? 'text-green-700' : 'text-red-600'
        )}
      >
        {text}
      </span>
    </div>
  )
}