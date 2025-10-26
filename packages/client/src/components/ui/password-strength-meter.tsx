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
    <>
      {/* Compact strength indicator - ONLY this affects layout */}
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

      {/* Fixed positioned validation popup - NEVER affects document flow */}
      <div className="fixed left-4 top-1/2 -translate-y-1/2 z-[9999] pointer-events-none">
        <div className="bg-popover border border-border rounded-lg shadow-xl p-3 w-[280px]">
          {/* Strength header */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-foreground">Password Requirements</span>
            <span className={cn('text-xs font-medium px-2 py-1 rounded', 
              strength.score >= 4 ? 'bg-green-100 text-green-700' :
              strength.score >= 2 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-600'
            )}>
              {strength.label}
            </span>
          </div>
          
          {/* Requirements list */}
          <div className="space-y-1.5">
            <RequirementItem
              met={requirements.minLength}
              text="At least 8 characters"
            />
            <RequirementItem
              met={requirements.hasUppercase}
              text="One uppercase letter"
            />
            <RequirementItem
              met={requirements.hasLowercase}
              text="One lowercase letter"
            />
            <RequirementItem
              met={requirements.hasNumber}
              text="One number"
            />
            <RequirementItem
              met={requirements.hasSpecial}
              text="One special character (!@#$%...)"
            />
          </div>
        </div>
      </div>
    </>
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