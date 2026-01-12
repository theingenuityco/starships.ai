'use client'


import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAccountForm } from '@/hooks/useAccountForm'
import { useAuth } from '@/hooks/useAuth'
import AccountTopBar from './AccountTopBar'
import ProfileOverviewCard from './ProfileOverviewCard'
import AccountDetailsCard from './AccountDetailsCard'
import SecurityCard from './SecurityCard'
import { OAuthAccountsSettings } from './OAuthAccountsSettings'
import { SetPasswordDialog } from './SetPasswordDialog'
import ConfirmUpdateDialog from './ConfirmUpdateDialog'
import ConfirmDeleteDialog from './ConfirmDeleteDialog'
import AccountFormSkeleton from './AccountFormSkeleton'
import SignOutSection from './SignOutSection'
import ExpertModeCard from './ExpertModeCard'

export default function AccountForm() {
  const router = useRouter()
  const { hasPassword, authMethods, isOAuthOnly, userAvatar, logout } = useAuth()
  const [showSetPassword, setShowSetPassword] = useState(false)
  
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

      <form
        id="account-form"
        onSubmit={onSave}
        className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[520px_1fr] xl:items-start"
      >
        <div className="space-y-6">
          <ProfileOverviewCard
            initials={initials}
            displayName={form.displayName || currentUser?.displayName}
            email={form.email || currentUser?.email}
            selectedEmoji={form.avatar && !form.avatar.startsWith('http') ? form.avatar : ''}
            profileImageUrl={userAvatar}
            onSelectEmoji={emoji => setForm(prev => ({ ...prev, avatar: emoji }))}
          />
          <OAuthAccountsSettings />
        </div>

        <div className="space-y-6">
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

          <ExpertModeCard />

          <SignOutSection onSignOut={logout} onNavigateHome={() => router.push('/')} />
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
