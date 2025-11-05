'use client'


import React, { useEffect, useRef } from 'react'
import { useAccountForm } from '@/hooks/useAccountForm'
import { useAuth } from '@/hooks/useAuth'
import { useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { USER_QUERY_KEYS } from '@/hooks/useUsers'
import { EMAIL_CHANGE_QUERY_KEYS } from '@/hooks/useEmailChange'
import AccountTopBar from './AccountTopBar'
import ProfileOverviewCard from './ProfileOverviewCard'
import AccountDetailsCard from './AccountDetailsCard'
import SecurityCard from './SecurityCard'
import { OAuthAccountsSettings } from './OAuthAccountsSettings'
import { SetPasswordDialog } from './SetPasswordDialog'
import DangerZoneCard from './DangerZoneCard'
import ConfirmUpdateDialog from './ConfirmUpdateDialog'
import ConfirmDeleteDialog from './ConfirmDeleteDialog'
import AccountFormSkeleton from './AccountFormSkeleton'

export default function AccountForm() {
  const { hasPassword, authMethods, isOAuthOnly, userAvatar, userId } = useAuth()
  const [showSetPassword, setShowSetPassword] = useState(false)
  const searchParams = useSearchParams()
  const router = useRouter()
  const queryClient = useQueryClient()
  const emailChangeToastShownRef = useRef(false)
  
  const {
    currentUser,
    loadingUser,
    initials,
    form,
    setForm,
    passwordErrors,
    showPassword,
    setShowPassword,
    showConfirmUpdate,
    handleConfirmUpdateOpenChange,
    changeList,
    confirmApplyUpdates,
    showConfirmDelete,
    setShowConfirmDelete,
    onDelete,
    confirmDelete,
    saving,
    deleting,
    dirty,
    onSave,
    onRevertAll,
    cancelPasswordEdit,
    currentPasswordRef,
    pendingEmailChange,
    resendEmailChangeVerification,
    cancelEmailChange,
  } = useAccountForm()

  // Handle email change query parameters
  useEffect(() => {
    // Add safety check to prevent hydration issues
    if (typeof window === 'undefined' || !searchParams) {
      return
    }

    try {
      const emailChange = searchParams.get('emailChange')

      // Handle email change success message
      if (emailChange === 'success' && !emailChangeToastShownRef.current) {
        emailChangeToastShownRef.current = true
        toast.success('Email changed successfully!')
        
        // Clear pending state if exists
        // (This will be handled by the status query refetch)
        
        // Refresh user data
        if (userId) {
          queryClient.invalidateQueries({ queryKey: USER_QUERY_KEYS.detail(userId) })
          queryClient.invalidateQueries({ queryKey: EMAIL_CHANGE_QUERY_KEYS.status(userId) })
        }
        
        // Clear query param after handling
        router.replace(window.location.pathname, { scroll: false })
      } else if (emailChange === 'error') {
        toast.error('Email change failed. Please try again.')
        // Clear query param after handling
        router.replace(window.location.pathname, { scroll: false })
      }
    } catch (error) {
      // Silently handle URL parameter errors
    }
  }, [searchParams, router, queryClient, userId])

  const handleConnectOAuth = (provider: 'google' | 'github') => {
    window.location.href = `/api/v1/auth/${provider}`
  }

  const handleManageSessions = () => {
    // TODO: Implement session management
  }

  if (loadingUser && !currentUser) {
    return <AccountFormSkeleton />
  }

  return (
    <>
      <AccountTopBar dirty={dirty} saving={saving} onReset={onRevertAll} formId="account-form" />

      <form id="account-form" onSubmit={onSave} className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12 xl:gap-8">
        <div className="lg:col-span-4">
          <ProfileOverviewCard
            initials={initials}
            displayName={form.displayName || currentUser?.displayName}
            email={form.email || currentUser?.email}
            selectedEmoji={form.avatar && !form.avatar.startsWith('http') ? form.avatar : ''}
            profileImageUrl={userAvatar}
            onSelectEmoji={emoji => setForm(prev => ({ ...prev, avatar: emoji }))}
          />
        </div>

        <div className="lg:col-span-8 space-y-6">
          <AccountDetailsCard
            form={form}
            setForm={setForm}
            saving={saving}
            pendingEmailChange={pendingEmailChange}
            onResendEmail={resendEmailChangeVerification}
            onCancelEmailChange={cancelEmailChange}
          />

          <SecurityCard
            hasPassword={hasPassword}
            authMethods={authMethods}
            isOAuthOnly={isOAuthOnly}
            showPassword={showPassword}
            setShowPassword={setShowPassword}
            form={form}
            setForm={setForm}
            passwordErrors={passwordErrors}
            saving={saving}
            cancelPasswordEdit={cancelPasswordEdit}
            currentPasswordRef={currentPasswordRef}
            onSetPassword={() => setShowSetPassword(true)}
          />

          <OAuthAccountsSettings />

          {/* TODO: Temporarily disabled - Delete account functionality */}
          {/* <DangerZoneCard deleting={deleting} onDelete={onDelete} /> */}
        </div>
      </form>

      <ConfirmUpdateDialog
        open={showConfirmUpdate}
        onOpenChange={handleConfirmUpdateOpenChange}
        changeList={changeList}
        saving={saving}
        onCancel={() => handleConfirmUpdateOpenChange(false)}
        onConfirm={confirmApplyUpdates}
      />

      <ConfirmDeleteDialog
        open={showConfirmDelete}
        onOpenChange={open => setShowConfirmDelete(open)}
        deleting={deleting}
        onCancel={() => setShowConfirmDelete(false)}
        onConfirmDelete={confirmDelete}
      />

      <SetPasswordDialog 
        open={showSetPassword}
        onOpenChange={setShowSetPassword}
      />
    </>
  )
}
