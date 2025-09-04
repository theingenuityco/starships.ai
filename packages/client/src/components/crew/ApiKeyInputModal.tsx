'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
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
import { Eye, EyeOff, ExternalLink, AlertCircle, Loader2, Key } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  ApiKeyRequirement,
  ApiKeyValidationResult,
  ConnectorApiKeyState,
} from '@/types/connector-api-keys'
import { ApiKeyValidator, ServiceType } from '@/lib/api-key-validation'
import { MCPServerOption } from '@/lib/api'

interface ApiKeyInputModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (apiKeys: Record<string, string>) => Promise<void>
  connector: MCPServerOption
  requirements: ApiKeyRequirement[]
  initialValues?: Record<string, string>
}

interface FieldVisibility {
  [key: string]: boolean
}

export function ApiKeyInputModal({
  isOpen,
  onClose,
  onSubmit,
  connector,
  requirements,
  initialValues = {},
}: ApiKeyInputModalProps) {
  // State management
  const [state, setState] = useState<ConnectorApiKeyState>({
    requirements,
    values: { ...initialValues },
    validationResults: {},
    isSubmitting: false,
  })

  const [fieldVisibility, setFieldVisibility] = useState<FieldVisibility>({})
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Determine service type for validation - memoize to prevent infinite loops
  const serviceType: ServiceType = useMemo(() => {
    return (connector.id.toLowerCase() as ServiceType) || 'generic'
  }, [connector.id])

  // Initialize validation results - only run when requirements change, not on every state update
  useEffect(() => {
    console.log(
      '[ApiKeyInputModal] useEffect triggered - requirements:',
      requirements.length,
      'serviceType:',
      serviceType
    )
    const initialValidationResults: Record<string, ApiKeyValidationResult> = {}
    requirements.forEach(req => {
      const value = state.values[req.envKey] || ''
      initialValidationResults[req.envKey] = ApiKeyValidator.validate({
        service: serviceType,
        requirement: req,
        value,
      })
    })

    console.log(
      '[ApiKeyInputModal] Setting validation results:',
      Object.keys(initialValidationResults)
    )
    setState(prev => ({
      ...prev,
      validationResults: initialValidationResults,
    }))
  }, [requirements, serviceType]) // Remove state.values dependency to prevent infinite loop

  // Handle input changes with real-time validation
  const handleInputChange = useCallback(
    (envKey: string, value: string) => {
      const requirement = requirements.find(req => req.envKey === envKey)
      if (!requirement) return

      const validationResult = ApiKeyValidator.validate({
        service: serviceType,
        requirement,
        value,
      })

      setState(prev => ({
        ...prev,
        values: { ...prev.values, [envKey]: value },
        validationResults: { ...prev.validationResults, [envKey]: validationResult },
      }))

      // Clear submit error when user starts typing
      if (submitError) {
        setSubmitError(null)
      }
    },
    [requirements, serviceType, submitError]
  )

  // Toggle password visibility
  const toggleFieldVisibility = useCallback((envKey: string) => {
    setFieldVisibility(prev => ({
      ...prev,
      [envKey]: !prev[envKey],
    }))
  }, [])

  // Check if form is valid
  const isFormValid = useCallback(() => {
    return (
      requirements.length > 0 &&
      Object.values(state.validationResults).every(result => result.isValid) &&
      requirements.filter(req => req.required).every(req => state.values[req.envKey]?.trim())
    )
  }, [requirements, state.validationResults, state.values])

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!isFormValid() || state.isSubmitting) return

    setState(prev => ({ ...prev, isSubmitting: true }))
    setSubmitError(null)

    try {
      // Filter out empty values for optional fields
      const filteredValues = Object.entries(state.values).reduce(
        (acc, [key, value]) => {
          const requirement = requirements.find(req => req.envKey === key)
          if (requirement && (requirement.required || value.trim())) {
            acc[key] = value.trim()
          }
          return acc
        },
        {} as Record<string, string>
      )

      await onSubmit(filteredValues)
      onClose()
    } catch (error) {
      console.error('Failed to submit API keys:', error)
      setSubmitError(
        error instanceof Error ? error.message : 'Failed to save API keys. Please try again.'
      )
    } finally {
      setState(prev => ({ ...prev, isSubmitting: false }))
    }
  }

  // Handle modal close
  const handleClose = () => {
    if (state.isSubmitting) return
    onClose()
  }

  // Reset form when modal opens/closes
  useEffect(() => {
    console.log(
      '[ApiKeyInputModal] Modal state changed - isOpen:',
      isOpen,
      'initialValues:',
      Object.keys(initialValues)
    )
    if (isOpen) {
      console.log('[ApiKeyInputModal] Resetting form state')
      setState(prev => ({
        ...prev,
        values: { ...initialValues },
        isSubmitting: false,
      }))
      setSubmitError(null)
      setFieldVisibility({})
    }
  }, [isOpen]) // Remove initialValues dependency to prevent infinite loop

  // Get help URL for a service
  const getServiceHelpUrl = (requirement: ApiKeyRequirement): string => {
    if (requirement.helpUrl) return requirement.helpUrl

    // Default help URLs based on service type
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

  // Render input field
  const renderInputField = (requirement: ApiKeyRequirement) => {
    const value = state.values[requirement.envKey] || ''
    const validationResult = state.validationResults[requirement.envKey]
    const isVisible = fieldVisibility[requirement.envKey]
    const inputType = requirement.sensitive && !isVisible ? 'password' : 'text'
    const hasError = validationResult && !validationResult.isValid && value.trim() !== ''

    return (
      <div key={requirement.envKey} className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor={requirement.envKey} className="text-sm font-medium">
            {requirement.displayName}
            {requirement.required && <span className="text-red-500 ml-1">*</span>}
          </Label>
          {requirement.helpUrl || getServiceHelpUrl(requirement) !== '#' ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-auto p-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => window.open(getServiceHelpUrl(requirement), '_blank')}
            >
              <ExternalLink className="w-3 h-3 mr-1" />
              Help
            </Button>
          ) : null}
        </div>

        <div className="relative">
          <Input
            id={requirement.envKey}
            type={inputType}
            value={value}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              handleInputChange(requirement.envKey, e.target.value)
            }
            placeholder={requirement.placeholder}
            className={cn(
              'pr-10 border border-input',
              hasError && 'border-red-500 focus:border-red-500 focus:ring-red-500'
            )}
            disabled={state.isSubmitting}
            autoComplete="off"
            spellCheck={false}
          />

          {requirement.sensitive && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-2 top-1/2 -translate-y-1/2 h-auto p-1 hover:bg-transparent"
              onClick={() => toggleFieldVisibility(requirement.envKey)}
              disabled={state.isSubmitting}
            >
              {isVisible ? (
                <EyeOff className="w-4 h-4 text-muted-foreground" />
              ) : (
                <Eye className="w-4 h-4 text-muted-foreground" />
              )}
            </Button>
          )}
        </div>

        {hasError && (
          <div className="flex items-center gap-1 text-sm text-red-600">
            <AlertCircle className="w-3 h-3 flex-shrink-0" />
            <span>{validationResult.error}</span>
          </div>
        )}

        {requirement.type === 'file_path' && (
          <p className="text-xs text-muted-foreground">
            Enter the full path to the file (e.g., /path/to/file.json)
          </p>
        )}

        {requirement.type === 'directory_path' && (
          <p className="text-xs text-muted-foreground">
            Enter the full path to the directory (e.g., /path/to/directory)
          </p>
        )}
      </div>
    )
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={open => {
        console.log(
          '[ApiKeyInputModal] Dialog onOpenChange called with:',
          open,
          'current isOpen:',
          isOpen
        )
        if (!open) {
          handleClose()
        }
      }}
    >
      <DialogContent className="sm:max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="w-5 h-5" />
            Configure {connector.name}
          </DialogTitle>
          <DialogDescription>
            Enter the required API keys and credentials for {connector.name}. These will be securely
            stored and used to authenticate with the service.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {requirements.map(renderInputField)}
          </div>

          {submitError && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-md">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
              <p className="text-sm text-red-700">{submitError}</p>
            </div>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={state.isSubmitting}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!isFormValid() || state.isSubmitting}
              className="w-full sm:w-auto"
            >
              {state.isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Configuration'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
