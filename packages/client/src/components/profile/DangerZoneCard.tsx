'use client'

import React from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Trash2 } from 'lucide-react'

type DangerZoneCardProps = {
  deleting: boolean
  onDelete: () => void
}

export default function DangerZoneCard({ deleting, onDelete }: DangerZoneCardProps) {
  return (
    <Card className="border-destructive/40 bg-background/70 backdrop-blur-sm transition-shadow hover:shadow-sm">
      <CardHeader>
        <CardTitle className="text-destructive text-base">Danger Zone</CardTitle>
        <CardDescription>Delete your account and all associated data.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <Trash2 className="h-4 w-4 text-destructive" />
            <span>This action cannot be undone.</span>
          </div>
          <Button type="button" variant="destructive" onClick={onDelete} disabled={deleting}>
            {deleting ? 'Deleting…' : 'Delete account'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
