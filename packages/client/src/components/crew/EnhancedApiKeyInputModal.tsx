'use client'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Eye,
  EyeOff,
  AlertCircle,
  Loader2,
  Key,
  CheckCircle,
  RefreshCw,
  HelpCircle,
  Copy,
  Check,
  AlertTriangle,
  Info,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  ApiKeyRequirement,
  ApiKeyValidationResult,
} from '@/types/connector-api-keys'
import { ApiKeyValidator, ServiceType } from '@/lib/api-key-validation'
import { MCPServerOption } from '@/lib/api'
import { useErrorRecovery, ErrorRecoveryManager } from '@/lib/error-recovery'
import {
  LoadingOverlay,
  ApiKeyValidationLoading,
  MultiStepLoading,
  LoadingStep,
  InlineLoading,
} from '@/components/ui/loading-states'
import { ErrorBoundary, useErrorHandler } from '@/components/ui/error-boundary'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import React, { useState, useEffect, useCallback, useRef } from 'react'

interface EnhancedApiKeyInputModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (apiKeys: Record<string, string>) => Promise<void>
  connector: MCPServerOption
  requirements: ApiKeyRequirement[]
  initialValues?: Record<string, string>
  showProgress?: boolean
  enableAutoSave?: boolean
  validationMode?: 'realtime' | 'onblur' | 'onsubmit'
}

interface FieldState {
  value: string
  isVisible: boolean
  isValidating: boolean
  validationResult: ApiKeyValidationResult
  hasBeenTouched: boolean
  lastValidated: Date | null
}

interface FormProgress {
  currentStep: number
  totalSteps: number
  completedFields: number
  totalFields: number
}

export function EnhancedApiKeyInputModal({
  isOpen,
  onClose,
  onSubmit,
  connector,
  requirements,
  initialValues = {},
  showProgress = true,
  enableAutoSave = false,
  validationMode = 'realtime',
}: EnhancedApiKeyInputModalProps) {
  // Error handling
  const { handleError, withRetry } = useErrorRecovery()
  const { error: formError, hasError, handleError: setFormError, clearError } = useErrorHandler()

  // Form state
  const [fieldStates, setFieldStates] = useState<Record<string, FieldState>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitAttempts, setSubmitAttempts] = useState(0)
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>(
    'idle'
  )
  const [copiedField, setCopiedField] = useState<string | null>(null)

  // Progress tracking
  const [progress, setProgress] = useState<FormProgress>({
    currentStep: 1,
    totalSteps: 3,
    completedFields: 0,
    totalFields: requirements.length,
  })

  // Refs
  const formRef = useRef<HTMLFormElement>(null)
  const firstErrorFieldRef = useRef<HTMLInputElement>(null)
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Service type for validation
  const serviceType: ServiceType = (connector.id.toLowerCase() as ServiceType) || 'generic'

  // Initialize field states
  useEffect(() => {
    const initialStates: Record<string, FieldState> = {}

    requirements.forEach(req => {
      const initialValue = initialValues[req.envKey] || ''
      initialStates[req.envKey] = {
        value: initialValue,
        isVisible: false,
        isValidating: false,
        validationResult: { isValid: !req.required || !!initialValue },
        hasBeenTouched: false,
        lastValidated: null,
      }
    })

    setFieldStates(initialStates)
    updateProgress(initialStates)
  }, [requirements, initialValues])

  // Update progress tracking
  const updateProgress = useCallback((states: Record<string, FieldState>) => {
    const completedFields = Object.values(states).filter(
      state => state.validationResult.isValid && state.hasBeenTouched
    ).length

    setProgress(prev => ({
      ...prev,
      completedFields,
    }))
  }, [])

  // Debounced validation
  const validateField = useCallback(
    async (envKey: string, value: string, immediate = false) => {
      const requirement = requirements.find(req => req.envKey === envKey)
      if (!requirement) return

      // Set validating state
      setFieldStates(prev => ({
        ...prev,
        [envKey]: {
          ...prev[envKey],
          isValidating: !immediate,
        },
      }))

      try {
        // Add delay for non-immediate validation to show loading state
        if (!immediate) {
          await new Promise(resolve => setTimeout(resolve, 300))
        }

        const validationResult = ApiKeyValidator.validate({
          service: serviceType,
          requirement,
          value,
        })

        setFieldStates(prev => {
          const newStates = {
            ...prev,
            [envKey]: {
              ...prev[envKey],
              validationResult,
              isValidating: false,
              lastValidated: new Date(),
            },
          }
          updateProgress(newStates)
          return newStates
        })

        // Clear form error if this field is now valid
        if (validationResult.isValid && hasError) {
          clearError()
        }
      } catch (error) {
        handleError(
          error as Error,
          ErrorRecoveryManager.createContext('validate-field', 'EnhancedApiKeyInputModal', {
            envKey,
            serviceType,
          })
        )

        setFieldStates(prev => ({
          ...prev,
          [envKey]: {
            ...prev[envKey],
            isValidating: false,
            validationResult: {
              isValid: false,
              error: 'Validation failed. Please try again.',
            },
          },
        }))
      }
    },
    [requirements, serviceType, handleError, hasError, clearError, updateProgress]
  )

  // Handle input changes
  const handleInputChange = useCallback(
    (envKey: string, value: string) => {
      setFieldStates(prev => ({
        ...prev,
        [envKey]: {
          ...prev[envKey],
          value,
          hasBeenTouched: true,
        },
      }))

      // Real-time validation
      if (validationMode === 'realtime') {
        validateField(envKey, value)
      }

      // Auto-save functionality
      if (enableAutoSave) {
        if (autoSaveTimeoutRef.current) {
          clearTimeout(autoSaveTimeoutRef.current)
        }

        setAutoSaveStatus('saving')
        autoSaveTimeoutRef.current = setTimeout(() => {
          // In a real app, this would save to localStorage or send to server
          setAutoSaveStatus('saved')
          setTimeout(() => setAutoSaveStatus('idle'), 2000)
        }, 1000)
      }
    },
    [validationMode, validateField, enableAutoSave]
  )

  // Handle field blur
  const handleFieldBlur = useCallback(
    (envKey: string) => {
      const fieldState = fieldStates[envKey]
      if (!fieldState) return

      if (validationMode === 'onblur' || validationMode === 'realtime') {
        validateField(envKey, fieldState.value, true)
      }
    },
    [fieldStates, validationMode, validateField]
  )

  // Toggle field visibility
  const toggleFieldVisibility = useCallback((envKey: string) => {
    setFieldStates(prev => ({
      ...prev,
      [envKey]: {
        ...prev[envKey],
        isVisible: !prev[envKey].isVisible,
      },
    }))
  }, [])

  // Copy field value to clipboard
  const copyFieldValue = useCallback(
    async (envKey: string) => {
      const fieldState = fieldStates[envKey]
      if (!fieldState?.value) return

      try {
        await navigator.clipboard.writeText(fieldState.value)
        setCopiedField(envKey)
        setTimeout(() => setCopiedField(null), 2000)
      } catch (error) {
        console.error('Failed to copy to clipboard:', error)
      }
    },
    [fieldStates]
  )

  // Check if form is valid
  const isFormValid = useCallback(() => {
    return (
      requirements.length > 0 &&
      Object.entries(fieldStates).every(([envKey, state]) => {
        const requirement = requirements.find(req => req.envKey === envKey)
        if (!requirement) return true

        return state.validationResult.isValid && (!requirement.required || state.value.trim())
      })
    )
  }, [requirements, fieldStates])

  // Focus first invalid field
  const focusFirstInvalidField = useCallback(() => {
    const firstInvalidField = requirements.find(req => {
      const state = fieldStates[req.envKey]
      return state && (!state.validationResult.isValid || (req.required && !state.value.trim()))
    })

    if (firstInvalidField) {
      const element = document.getElementById(firstInvalidField.envKey)
      element?.focus()
    }
  }, [requirements, fieldStates])

  // Handle form submission with retry logic
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!isFormValid() || isSubmitting) return

    setIsSubmitting(true)
    setSubmitAttempts(prev => prev + 1)
    clearError()

    try {
      // Validate all fields if not in realtime mode
      if (validationMode === 'onsubmit') {
        const validationPromises = requirements.map(req =>
          validateField(req.envKey, fieldStates[req.envKey]?.value || '', true)
        )
        await Promise.all(validationPromises)

        // Check if validation passed
        if (!isFormValid()) {
          focusFirstInvalidField()
          return
        }
      }

      // Prepare submission data
      const submissionData = Object.entries(fieldStates).reduce(
        (acc, [key, state]) => {
          const requirement = requirements.find(req => req.envKey === key)
          if (requirement && (requirement.required || state.value.trim())) {
            acc[key] = state.value.trim()
          }
          return acc
        },
        {} as Record<string, string>
      )

      // Submit with retry logic
      await withRetry(() => onSubmit(submissionData), {
        maxRetries: 2,
        baseDelay: 1000,
      })

      onClose()
    } catch (error) {
      handleError(
        error as Error,
        ErrorRecoveryManager.createContext('submit-form', 'EnhancedApiKeyInputModal', {
          connector: connector.id,
          attemptNumber: submitAttempts,
        })
      )

      setFormError(error as Error)
      focusFirstInvalidField()
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle modal close
  const handleClose = () => {
    if (isSubmitting) return
    clearError()
    onClose()
  }

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setSubmitAttempts(0)
      clearError()
      setAutoSaveStatus('idle')
      setCopiedField(null)
    }
  }, [isOpen, clearError])

  // Get help URL for a service
  const getServiceHelpUrl = (requirement: ApiKeyRequirement): string => {
    if (requirement.helpUrl) return requirement.helpUrl

    const helpUrls: Record<string, string> = {
      github:
        'https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token',
      slack: 'https://api.slack.com/authentication/token-types',
      notion: 'https://developers.notion.com/docs/create-a-notion-integration',
      brave: 'https://api.search.brave.com/app/documentation/web-search/get-started',
      stripe: 'https://stripe.com/docs/keys',
      openai: 'https://platform.openai.com/api-keys',
      anthropic: 'https://console.anthropic.com/settings/keys',
      google: 'https://console.developers.google.com/apis/credentials',
      azure: 'https://docs.microsoft.com/en-us/azure/cognitive-services/authentication',
      aws: 'https://docs.aws.amazon.com/general/latest/gr/aws-sec-cred-types.html',
    }

    return helpUrls[serviceType] || '#'
  }

  // Create loading steps for progress tracking
  const loadingSteps: LoadingStep[] = [
    {
      id: 'input',
      label: 'Enter API Keys',
      status:
        progress.completedFields === 0
          ? 'loading'
          : progress.completedFields === progress.totalFields
            ? 'completed'
            : 'loading',
      description: `${progress.completedFields}/${progress.totalFields} fields completed`,
    },
    {
      id: 'validate',
      label: 'Validate Credentials',
      status: isSubmitting
        ? 'loading'
        : progress.completedFields === progress.totalFields
          ? 'completed'
          : 'pending',
      description: 'Checking API key formats and requirements',
    },
    {
      id: 'save',
      label: 'Save Configuration',
      status: isSubmitting ? 'loading' : 'pending',
      description: 'Storing your API keys securely',
    },
  ]

  // Render input field with enhanced features
  const renderInputField = (requirement: ApiKeyRequirement) => {
    const fieldState = fieldStates[requirement.envKey]
    if (!fieldState) return null

    const { value, isVisible, isValidating, validationResult, hasBeenTouched } = fieldState
    const inputType = requirement.sensitive && !isVisible ? '[DEFAULT-PASSWORD]' : 'text'
    const hasError = validationResult && !validationResult.isValid && hasBeenTouched
    const hasSuccess =
      validationResult && validationResult.isValid && hasBeenTouched && value.trim()

    return (
      <div key={requirement.envKey} className="space-y-3">
        {/* Field Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Label
              htmlFor={requirement.envKey}
              className={cn(
                'text-sm font-medium',
                hasError && 'text-destructive',
                hasSuccess && 'text-green-600'
              )}
            >
              {requirement.displayName}
              {requirement.required && <span className="text-red-500 ml-1">*</span>}
            </Label>

            {hasSuccess && <CheckCircle className="h-4 w-4 text-green-500" />}
          </div>

          <div className="flex items-center gap-1">
            {/* Help Button */}
            {(requirement.helpUrl || getServiceHelpUrl(requirement) !== '#') && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => window.open(getServiceHelpUrl(requirement), '_blank')}
                    >
                      <HelpCircle className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Get help for {requirement.displayName}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            {/* Copy Button */}
            {value && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => copyFieldValue(requirement.envKey)}
                    >
                      {copiedField === requirement.envKey ? (
                        <Check className="h-3 w-3 text-green-500" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{copiedField === requirement.envKey ? 'Copied!' : 'Copy value'}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </div>

        {/* Input Field */}
        <div className="relative">
          <Input
            ref={hasError ? firstErrorFieldRef : undefined}
            id={requirement.envKey}
            type={inputType}
            value={value}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange(requirement.envKey, e.target.value)}
            onBlur={() => handleFieldBlur(requirement.envKey)}
            placeholder={requirement.placeholder}
            className={cn(
              'pr-20',
              hasError && 'border-destructive focus:border-destructive focus:ring-destructive',
              hasSuccess && 'border-green-500 focus:border-green-500 focus:ring-green-500'
            )}
            disabled={isSubmitting}
            autoComplete="off"
            spellCheck={false}
            aria-describedby={`${requirement.envKey}-description`}
            aria-invalid={hasError}
          />

          {/* Field Actions */}
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {isValidating && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}

            {requirement.sensitive && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 hover:bg-transparent"
                onClick={() => toggleFieldVisibility(requirement.envKey)}
                disabled={isSubmitting}
                tabIndex={-1}
              >
                {isVisible ? (
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Eye className="h-4 w-4 text-muted-foreground" />
                )}
              </Button>
            )}
          </div>
        </div>

        {/* Field Status */}
        <div className="min-h-[20px]">
          {isValidating && <ApiKeyValidationLoading keyName={requirement.displayName} />}

          {hasError && !isValidating && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-3 w-3 flex-shrink-0" />
              <span>{validationResult.error}</span>
            </div>
          )}

          {hasSuccess && !isValidating && (
            <div className="flex items-center gap-2 text-sm text-green-600">
              <CheckCircle className="h-3 w-3 flex-shrink-0" />
              <span>Valid {requirement.displayName.toLowerCase()}</span>
            </div>
          )}
        </div>

        {/* Field Hints */}
        {(requirement.type === 'file_path' || requirement.type === 'directory_path') && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Info className="h-3 w-3 flex-shrink-0" />
            <span>
              {requirement.type === 'file_path'
                ? 'Enter the full path to the file (e.g., /path/to/file.json)'
                : 'Enter the full path to the directory (e.g., /path/to/directory)'}
            </span>
          </div>
        )}
      </div>
    )
  }

  return (
    <ErrorBoundary component="EnhancedApiKeyInputModal">
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
                <Key className="w-5 h-5 text-primary" />
              </div>
              <div>
                <div>Configure {connector.name}</div>
                {enableAutoSave && (
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-xs">
                      {autoSaveStatus === 'saving' && <InlineLoading size="xs" />}
                      {autoSaveStatus === 'saved' && (
                        <CheckCircle className="h-3 w-3 text-green-500" />
                      )}
                      {autoSaveStatus === 'error' && (
                        <AlertTriangle className="h-3 w-3 text-red-500" />
                      )}
                      <span className="ml-1">
                        {autoSaveStatus === 'saving'
                          ? 'Saving...'
                          : autoSaveStatus === 'saved'
                            ? 'Saved'
                            : autoSaveStatus === 'error'
                              ? 'Save failed'
                              : 'Auto-save enabled'}
                      </span>
                    </Badge>
                  </div>
                )}
              </div>
            </DialogTitle>
            <DialogDescription>
              Enter the required API keys and credentials for {connector.name}. These will be
              securely stored and used to authenticate with the service.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto">
            <LoadingOverlay isLoading={isSubmitting} message="Saving configuration...">
              <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">
                {/* Progress Indicator */}
                {showProgress && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm">Setup Progress</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <MultiStepLoading steps={loadingSteps} />
                    </CardContent>
                  </Card>
                )}

                {/* Form Error */}
                {hasError && (
                  <Card className="border-destructive/20 bg-destructive/5">
                    <CardContent className="pt-6">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <h4 className="font-medium text-destructive mb-1">
                            Configuration Failed
                          </h4>
                          <p className="text-sm text-destructive/80 mb-3">
                            {formError?.message ||
                              'An error occurred while saving your configuration.'}
                          </p>
                          {formError?.recoveryActions && formError.recoveryActions.length > 0 && (
                            <div className="flex gap-2">
                              {formError.recoveryActions.map(action => (
                                <Button
                                  key={action.id}
                                  variant={action.primary ? 'default' : 'outline'}
                                  size="sm"
                                  onClick={() => {
                                    if (action.id === 'retry') {
                                      handleSubmit(new Event('submit') as any)
                                    } else {
                                      action.action()
                                    }
                                  }}
                                  className={
                                    action.destructive ? 'border-destructive text-destructive' : ''
                                  }
                                >
                                  {action.id === 'retry' && <RefreshCw className="h-3 w-3 mr-1" />}
                                  {action.label}
                                </Button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Form Fields */}
                <div className="space-y-6">{requirements.map(renderInputField)}</div>
              </form>
            </LoadingOverlay>
          </div>

          <Separator />

          <DialogFooter className="flex-shrink-0">
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {submitAttempts > 0 && <span>Attempt {submitAttempts}</span>}
                {progress.completedFields > 0 && (
                  <span>
                    {progress.completedFields}/{progress.totalFields} fields completed
                  </span>
                )}
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClose}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={!isFormValid() || isSubmitting}
                  onClick={handleSubmit}
                  className="min-w-[140px]"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Key className="w-4 h-4 mr-2" />
                      Save Configuration
                    </>
                  )}
                </Button>
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ErrorBoundary>
  )
}
