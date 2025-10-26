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
    <div className={cn('space-y-2', className)}>
      {/* Compact Strength Meter with inline label */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
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

      {/* Compact Requirements Grid */}
      {showRequirements && (
        <div className="grid grid-cols-2 gap-1">
          <RequirementItem
            met={requirements.minLength}
            text="8+ chars"
            compact
          />
          <RequirementItem
            met={requirements.hasUppercase}
            text="Uppercase"
            compact
          />
          <RequirementItem
            met={requirements.hasLowercase}
            text="Lowercase"
            compact
          />
          <RequirementItem
            met={requirements.hasNumber}
            text="Number"
            compact
          />
          <RequirementItem
            met={requirements.hasSpecial}
            text="Special (!@#...)"
            compact
          />
          {/* Empty div for 2x3 grid balance when 5 items */}
          <div />
        </div>
      )}
    </div>
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