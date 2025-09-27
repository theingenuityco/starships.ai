'use client'

import { useState, useEffect } from 'react'
import { EnvironmentSummary } from '@starships/protocol'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { AlertCircle, Key, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'

interface EnvironmentVariableFormProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: { key: string; value?: string; description?: string }) => void
  environmentVariable?: EnvironmentSummary
  loading?: boolean
}

export function EnvironmentVariableForm({ isOpen, onClose, onSubmit, environmentVariable, loading = false }: EnvironmentVariableFormProps) {
  const [formData, setFormData] = useState({
    key: '',
    value: '',
    description: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const isEdit = !!environmentVariable

  // Reset form when dialog opens/closes or environment variable changes
  useEffect(() => {
    if (isOpen && environmentVariable) {
      setFormData({
        key: environmentVariable.key,
        value: '', // Value is never shown for security
        description: environmentVariable.description || '',
      })
    } else if (isOpen && !environmentVariable) {
      setFormData({
        key: '',
        value: '',
        description: '',
      })
    }
    setErrors({})
  }, [isOpen, environmentVariable])

  const validateForm = () => {
    const newErrors: Record<string, string> = {}

    if (!formData.key.trim()) {
      newErrors.key = 'Key is required'
    } else if (!/^[A-Z][A-Z0-9_]*$/.test(formData.key.trim())) {
      newErrors.key = 'Environment key must be uppercase letters, numbers, and underscores only'
    }

    if (!isEdit && !formData.value.trim()) {
      newErrors.value = 'Value is required'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateForm()) return

    const submitData: { key: string; value?: string; description?: string } = {
      key: formData.key,
      description: formData.description || undefined,
    }

    // Only include value if it's provided (for updates, empty value means no change)
    if (formData.value.trim() || !isEdit) {
      submitData.value = formData.value
    }

    onSubmit(submitData)
  }

  const handleClose = () => {
    setFormData({ key: '', value: '', description: '' })
    setErrors({})
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="h-5 w-5 text-primary" />
            {isEdit ? 'Edit Environment Variable' : 'Add Environment Variable'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            {/* Key Field */}
            <div className="space-y-2">
              <Label htmlFor="key" className="flex items-center gap-2">
                <Key className="h-4 w-4 text-muted-foreground" />
                Key
              </Label>
              <Input
                id="key"
                value={formData.key}
                onChange={e => setFormData(prev => ({ ...prev, key: e.target.value.toUpperCase() }))}
                placeholder="API_KEY"
                className={cn('font-mono', errors.key && 'border-destructive focus:border-destructive')}
                disabled={isEdit} // Don't allow key changes in edit mode
              />
              {errors.key && (
                <p className="flex items-center gap-1 text-sm text-destructive">
                  <AlertCircle className="h-3 w-3" />
                  {errors.key}
                </p>
              )}
              <p className="text-xs text-muted-foreground">Use uppercase letters, numbers, and underscores. Must start with a letter.</p>
            </div>

            {/* Value Field */}
            <div className="space-y-2">
              <Label htmlFor="value" className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                Value {isEdit && '(leave empty to keep current value)'}
              </Label>
              <Input
                id="value"
                type="password"
                value={formData.value}
                onChange={e => setFormData(prev => ({ ...prev, value: e.target.value }))}
                placeholder={isEdit ? 'Enter new value (optional)' : 'Enter value'}
                className={cn('font-mono', errors.value && 'border-destructive focus:border-destructive')}
              />
              {errors.value && (
                <p className="flex items-center gap-1 text-sm text-destructive">
                  <AlertCircle className="h-3 w-3" />
                  {errors.value}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {isEdit ? 'Only provide a value if you want to update it. Current value is not shown for security.' : 'This value will be encrypted and stored securely.'}
              </p>
            </div>

            {/* Description Field */}
            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Brief description of what this variable is used for"
                className="min-h-[80px]"
                rows={3}
              />
              <p className="text-xs text-muted-foreground">Help others understand what this environment variable is for.</p>
            </div>
          </div>

          <DialogFooter className="gap-3">
            <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : isEdit ? 'Update Variable' : 'Add Variable'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
