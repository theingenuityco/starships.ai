'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { Icon } from '@/components/primitives/Icon'
import { Label } from '@/components/ui/label'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
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
    <div className="space-y-2">
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
    </div>
  )
}

function RequirementTooltipItem({ met, text }: { met: boolean; text: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className={cn(
        "flex items-center justify-center rounded-full flex-shrink-0 h-3.5 w-3.5",
        met ? 'bg-green-500/20 text-green-600' : 'bg-muted text-muted-foreground'
      )}>
        <Icon
          name={met ? 'check' : 'x'}
          className="h-2.5 w-2.5"
        />
      </div>
      <span className={cn(
        'text-xs',
        met ? 'text-foreground' : 'text-muted-foreground'
      )}>
        {text}
      </span>
    </div>
  )
}

interface PasswordLabelWithTooltipProps {
  htmlFor: string
  label?: string
  password?: string
}

export function PasswordLabelWithTooltip({ 
  htmlFor, 
  label = 'Password',
  password = ''
}: PasswordLabelWithTooltipProps) {
  const requirements = checkPasswordRequirements(password)
  
  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex items-center gap-1.5">
        <Label htmlFor={htmlFor}>{label}</Label>
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" className="flex items-center justify-center">
              <Icon name="info" className="h-4 w-4 text-muted-foreground hover:text-foreground transition-colors cursor-help" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" className="max-w-[260px] px-3 py-2.5 bg-popover text-popover-foreground border">
            <div className="space-y-2">
              <p className="font-semibold text-xs mb-2">Password Requirements:</p>
              <div className="space-y-1.5">
                <RequirementTooltipItem 
                  met={requirements.minLength} 
                  text="At least 8 characters" 
                />
                <RequirementTooltipItem 
                  met={requirements.hasUppercase} 
                  text="One uppercase letter" 
                />
                <RequirementTooltipItem 
                  met={requirements.hasLowercase} 
                  text="One lowercase letter" 
                />
                <RequirementTooltipItem 
                  met={requirements.hasNumber} 
                  text="One number" 
                />
                <RequirementTooltipItem 
                  met={requirements.hasSpecial} 
                  text="One special character" 
                />
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  )
}