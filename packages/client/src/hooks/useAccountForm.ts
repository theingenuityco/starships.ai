'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useCurrentUser, useDeleteUser, useUpdateUserProfile } from '@/hooks/useUsers'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

export type FormState = {
  displayName: string
  avatar: string
  email: string
  currentPassword: string
  newPassword: string
  confirmNewPassword: string
}

export type PasswordErrors = {
  current?: string
  new?: string
  confirm?: string
}

export type ChangeSummaryItem = { type: 'displayName'; from: string; to: string } | { type: 'email'; from: string; to: string } | { type: 'avatar'; from: string; to: string } | { type: 'password' }

const hasPasswordErrors = (errs: PasswordErrors) => !!(errs.current || errs.new || errs.confirm)

export function useAccountForm() {
  const router = useRouter()
  const { userId, user, logout } = useAuth()
  const { data: currentUser, isLoading: loadingUser } = useCurrentUser(userId || null, !!userId)
  const updateProfile = useUpdateUserProfile()
  const deleteUser = useDeleteUser()

  // Refs
  const currentPasswordRef = useRef<HTMLInputElement>(null)

  // UI states
  const [showPassword, setShowPassword] = useState(false)
  const [pendingUpdates, setPendingUpdates] = useState<Record<string, unknown> | null>(null)
  const [showConfirmUpdate, setShowConfirmUpdate] = useState(false)
  const [showConfirmDelete, setShowConfirmDelete] = useState(false)

  // Derived
  const initials = useMemo(() => {
    const base = currentUser?.displayName || user?.name || currentUser?.email || user?.email || 'U'
    const parts = `${base}`.split(' ')
    return (parts[0]?.[0] || 'U').toUpperCase()
  }, [currentUser, user])

  const initial = useMemo(
    () => ({
      displayName: currentUser?.displayName ?? user?.name ?? '',
      avatar: currentUser?.avatar ?? user?.avatar ?? '',
      email: currentUser?.email ?? user?.email ?? '',
    }),
    [currentUser, user]
  )

  const [form, setForm] = useState<FormState>({
    displayName: initial.displayName,
    avatar: initial.avatar,
    email: initial.email,
    currentPassword: '',
    newPassword: '',
    confirmNewPassword: '',
  })

  const [passwordErrors, setPasswordErrors] = useState<PasswordErrors>({})

  // Sync when user data arrives
  useEffect(() => {
    setForm(prev => ({
      ...prev,
      displayName: initial.displayName,
      avatar: initial.avatar,
      email: initial.email,
    }))
  }, [initial.displayName, initial.avatar, initial.email])

  const saving = updateProfile.isPending
  const deleting = deleteUser.isPending

  const dirty = useMemo(() => {
    return form.displayName !== initial.displayName || form.avatar !== initial.avatar || form.email !== initial.email || !!form.newPassword || !!form.currentPassword || !!form.confirmNewPassword
  }, [form, initial])

  // Validation helpers (logic only)
  const computePasswordErrors = (f: FormState): PasswordErrors => {
    const errs: PasswordErrors = {}

    const anyPasswordEdit = !!(f.currentPassword || f.newPassword || f.confirmNewPassword)

    if (anyPasswordEdit) {
      // Current password
      if (!f.currentPassword || f.currentPassword.length < 6) {
        errs.current = 'Current password must be at least 6 characters'
      }

      // New password
      if (!f.newPassword || f.newPassword.length < 6) {
        errs.new = 'New password must be at least 6 characters'
      } else if (f.currentPassword && f.newPassword === f.currentPassword) {
        errs.new = 'New password must be different from current password'
      }

      // Confirm new password
      if (!f.confirmNewPassword || f.confirmNewPassword.length < 6) {
        errs.confirm = 'Re-entered password must be at least 6 characters'
      } else if (f.newPassword && f.confirmNewPassword !== f.newPassword) {
        errs.confirm = 'Passwords do not match'
      }
    }

    return errs
  }

  const validateNonPassword = (): string | null => {
    if (!form.displayName || form.displayName.length < 1 || form.displayName.length > 100) {
      return 'Display name must be between 1 and 100 characters'
    }
    if (!form.email || !form.email.includes('@')) {
      return 'Email must be a valid email address'
    }
    if (form.avatar && form.avatar.length > 500) {
      return 'Avatar URL must be at most 500 characters'
    }
    return null
  }

  // Live-validate password fields (only show errors for touched fields)
  useEffect(() => {
    const errs = computePasswordErrors(form)
    const display: PasswordErrors = {}
    if (form.currentPassword.length > 0) display.current = errs.current
    if (form.newPassword.length > 0) display.new = errs.new
    if (form.confirmNewPassword.length > 0) display.confirm = errs.confirm
    setPasswordErrors(display)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.currentPassword, form.newPassword, form.confirmNewPassword])

  // Actions
  const onSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userId) return

    const nonPasswordError = validateNonPassword()
    if (nonPasswordError) {
      toast.error('Cannot save', { description: nonPasswordError })
      return
    }

    // Evaluate password validation on demand too
    const currentErrs = computePasswordErrors(form)
    setPasswordErrors(currentErrs)

    if (hasPasswordErrors(currentErrs)) {
      toast.error('Please fix the password errors', { description: currentErrs.current || currentErrs.new || currentErrs.confirm })
      return
    }

    const updates: Record<string, unknown> = {}
    if (form.displayName !== initial.displayName) updates.displayName = form.displayName.trim()
    if (form.avatar !== initial.avatar) updates.avatar = form.avatar.trim()
    if (form.email !== initial.email) updates.email = form.email.trim()
    if (form.newPassword) {
      updates.currentPassword = form.currentPassword
      updates.newPassword = form.newPassword
    }

    if (Object.keys(updates).length === 0) return

    // Confirm sensitive updates
    if (updates.email || updates.newPassword) {
      setPendingUpdates(updates)
      setShowConfirmUpdate(true)
      return
    }

    try {
      await updateProfile.mutateAsync({ userId, updates })
      setForm(f => ({ ...f, currentPassword: '', newPassword: '', confirmNewPassword: '' }))
      setPasswordErrors({})
      setShowPassword(false)
      toast.success('Profile updated', { description: 'Your changes have been saved.' })
    } catch (err: any) {
      const apiError = err?.response?.data?.error
      const apiMsg: string = (typeof apiError === 'string' ? apiError : apiError?.message) || err?.message || 'Failed to update profile'
      const apiCode: string | undefined = typeof apiError === 'object' ? apiError?.code : undefined

      if (apiCode === 'VALIDATION_ERROR' && typeof apiMsg === 'string' && apiMsg.toLowerCase().includes('current password is incorrect')) {
        setShowPassword(true)
        setPasswordErrors(prev => ({ ...prev, current: 'Current password is incorrect' }))
        // Focus the current password field for immediate correction
        setTimeout(() => currentPasswordRef.current?.focus(), 0)
      }

      toast.error('Update failed', { description: apiMsg })
    }
  }

  const confirmApplyUpdates = async () => {
    if (!userId || !pendingUpdates) return
    try {
      await updateProfile.mutateAsync({ userId, updates: pendingUpdates })
      setForm(f => ({ ...f, currentPassword: '', newPassword: '', confirmNewPassword: '' }))
      setPasswordErrors({})
      setShowPassword(false)
      setPendingUpdates(null)
      setShowConfirmUpdate(false)
      toast.success('Changes applied', { description: 'Your account details were updated.' })
    } catch (err: any) {
      const apiError = err?.response?.data?.error
      const apiMsg: string = (typeof apiError === 'string' ? apiError : apiError?.message) || err?.message || 'Failed to update profile'
      const apiCode: string | undefined = typeof apiError === 'object' ? apiError?.code : undefined

      if (apiCode === 'VALIDATION_ERROR' && typeof apiMsg === 'string' && apiMsg.toLowerCase().includes('current password is incorrect')) {
        // Close modal, open security section, show inline error, and focus field
        setShowConfirmUpdate(false)
        setShowPassword(true)
        setPasswordErrors(prev => ({ ...prev, current: 'Current password is incorrect' }))
        setTimeout(() => currentPasswordRef.current?.focus(), 0)
      }

      toast.error('Update failed', { description: apiMsg })
    }
  }

  const onDelete = () => setShowConfirmDelete(true)

  const confirmDelete = async () => {
    if (!userId) return
    try {
      await deleteUser.mutateAsync(userId)
      await logout()
      router.push('/')
    } catch {
      // handled by hook toast within deleteUser
    }
  }

  const onRevertAll = () => {
    setForm({
      displayName: initial.displayName,
      avatar: initial.avatar,
      email: initial.email,
      currentPassword: '',
      newPassword: '',
      confirmNewPassword: '',
    })
    setPasswordErrors({})
    setShowPassword(false)
  }

  const cancelPasswordEdit = () => {
    setShowPassword(false)
    setForm(f => ({ ...f, currentPassword: '', newPassword: '', confirmNewPassword: '' }))
    setPasswordErrors({})
  }

  const goToBilling = () => {
    router.push('/profile?tab=billing')
  }

  const changeList: ChangeSummaryItem[] = useMemo(() => {
    const list: ChangeSummaryItem[] = []
    if (form.displayName !== initial.displayName) list.push({ type: 'displayName', from: initial.displayName || '—', to: form.displayName })
    if (form.email !== initial.email) list.push({ type: 'email', from: initial.email || '—', to: form.email })
    if (form.avatar !== initial.avatar) list.push({ type: 'avatar', from: initial.avatar || '—', to: form.avatar || '—' })
    if (form.newPassword) list.push({ type: 'password' })
    return list
  }, [form, initial])

  const handleConfirmUpdateOpenChange = (open: boolean) => {
    setShowConfirmUpdate(open)
    if (!open) setPendingUpdates(null)
  }

  return {
    // Data
    currentUser,
    loadingUser,

    // Derived identity
    initials,
    initial,

    // Form
    form,
    setForm,

    // Validation
    passwordErrors,

    // UI toggles
    showPassword,
    setShowPassword,

    // Confirm update modal
    showConfirmUpdate,
    setShowConfirmUpdate,
    handleConfirmUpdateOpenChange,
    changeList,
    confirmApplyUpdates,

    // Delete modal
    showConfirmDelete,
    setShowConfirmDelete,
    onDelete,
    confirmDelete,

    // Status
    saving,
    deleting,
    dirty,

    // Events
    onSave,
    onRevertAll,
    cancelPasswordEdit,
    goToBilling,

    // Refs
    currentPasswordRef,
  }
}
