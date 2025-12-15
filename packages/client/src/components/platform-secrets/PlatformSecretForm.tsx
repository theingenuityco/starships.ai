'use client'

import Icon from '@/components/primitives/Icon'

import { useEffect, useState } from 'react'
import type { PlatformSecretSummary } from '@starships/protocol'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

interface PlatformSecretFormProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: { key: string; value?: string; description?: string }) => void
  secret?: PlatformSecretSummary
  loading?: boolean
}

export function PlatformSecretForm({ isOpen, onClose, onSubmit, secret, loading = false }: PlatformSecretFormProps) {
  const [formData, setFormData] = useState({
    key: '',
    value: '',
    description: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const isEdit = !!secret

  useEffect(() => {
    if (isOpen && secret) {
      setFormData({
        key: secret.key,
        value: '', // never show stored value
        description: secret.description || '',
      })
    } else if (isOpen && !secret) {
      setFormData({ key: '', value: '', description: '' })
    }
    setErrors({})
  }, [isOpen, secret])

  const validateForm = () => {
    const newErrors: Record<string, string> = {}

    if (!formData.key.trim()) {
      newErrors.key = 'Key is required'
    } else if (!/^[A-Z0-9_]+$/.test(formData.key.trim())) {
      newErrors.key = 'Key must be uppercase letters, numbers, and underscores only'
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
            <Icon name="key" className="h-5 w-5 text-primary" />
            {isEdit ? 'Edit Platform Secret' : 'Add Platform Secret'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="key" className="flex items-center gap-2">
                <Icon name="key" className="h-4 w-4 text-muted-foreground" />
                Key
              </Label>
              <Input
                id="key"
                value={formData.key}
                onChange={e => setFormData(prev => ({ ...prev, key: e.target.value.toUpperCase() }))}
                placeholder="DISCORD_BOT_TOKEN"
                className={cn('font-mono', errors.key && 'border-destructive focus:border-destructive')}
                disabled={isEdit}
              />
              {errors.key && (
                <p className="flex items-center gap-1 text-sm text-destructive">
                  <Icon name="alert-circle" className="h-3 w-3" />
                  {errors.key}
                </p>
              )}
              <p className="text-xs text-muted-foreground">Use uppercase letters, numbers, and underscores.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="value" className="flex items-center gap-2">
                <Icon name="file-text" className="h-4 w-4 text-muted-foreground" />
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
                  <Icon name="alert-circle" className="h-3 w-3" />
                  {errors.value}
                </p>
              )}
              <p className="text-xs text-muted-foreground">Values are encrypted and never displayed after saving.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="What is this secret used for?"
                className="min-h-[80px]"
                rows={3}
              />
              <p className="text-xs text-muted-foreground">Help others understand what this secret is for.</p>
            </div>
          </div>

          <DialogFooter className="gap-3">
            <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : isEdit ? 'Update Secret' : 'Add Secret'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
