'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import Icon from '@/components/primitives/Icon'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface ProblemStatementsEditorProps {
  statements: string[]
  onChange: (statements: string[]) => void
  onRegenerate?: () => void
  disabled?: boolean
}

export function ProblemStatementsEditor({ statements, onChange, onRegenerate, disabled }: ProblemStatementsEditorProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')

  const handleEdit = (index: number) => {
    setEditingIndex(index)
    setEditValue(statements[index] || '')
  }

  const handleSave = () => {
    if (editingIndex !== null && editValue.trim()) {
      const updated = [...statements]
      updated[editingIndex] = editValue.trim()
      onChange(updated)
      setEditingIndex(null)
      setEditValue('')
    }
  }

  const handleCancel = () => {
    setEditingIndex(null)
    setEditValue('')
  }

  const handleDelete = (index: number) => {
    const updated = statements.filter((_, i) => i !== index)
    onChange(updated)
  }

  const handleAdd = () => {
    if (statements.length < 5) {
      const newIndex = statements.length
      onChange([...statements, ''])
      // Use setTimeout to ensure state update happens first
      setTimeout(() => {
        setEditingIndex(newIndex)
        setEditValue('')
      }, 0)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground">Problem Statements</p>
        {onRegenerate && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRegenerate}
            disabled={disabled}
            className="h-7 text-xs"
          >
            <Icon name="refresh-cw" className="h-3 w-3 mr-1" />
            Regenerate All
          </Button>
        )}
      </div>

      <div className="space-y-2">
        {statements.map((statement, index) => (
          <div key={index} className="flex items-start gap-2">
            {editingIndex === index ? (
              <div className="flex-1 flex items-center gap-2">
                <Input
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleSave()
                    } else if (e.key === 'Escape') {
                      handleCancel()
                    }
                  }}
                  className="h-8 text-sm"
                  autoFocus
                  maxLength={200}
                  placeholder="Enter problem statement..."
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={handleSave}
                  disabled={!editValue.trim()}
                  className="h-8 w-8 p-0"
                >
                  <Icon name="check" className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={handleCancel}
                  className="h-8 w-8 p-0"
                >
                  <Icon name="x" className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <>
                <div className="flex-1 rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-sm min-h-[32px] flex items-center">
                  <p className="text-foreground/90">{statement || <span className="text-muted-foreground italic">Empty statement</span>}</p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => handleEdit(index)}
                  disabled={disabled}
                  className="h-8 w-8 p-0"
                >
                  <Icon name="pencil" className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => handleDelete(index)}
                  disabled={disabled}
                  className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                >
                  <Icon name="trash" className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        ))}

        {statements.length < 5 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAdd}
            disabled={disabled}
            className="w-full h-8 text-xs"
          >
            <Icon name="plus" className="h-3 w-3 mr-1" />
            Add Statement
          </Button>
        )}
      </div>
    </div>
  )
}
