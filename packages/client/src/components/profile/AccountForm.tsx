'use client'

import React from 'react'
import { useAccountForm } from '@/hooks/useAccountForm'
import AccountTopBar from './AccountTopBar'
import ProfileOverviewCard from './ProfileOverviewCard'
import AccountDetailsCard from './AccountDetailsCard'
import SecurityCard from './SecurityCard'
import DangerZoneCard from './DangerZoneCard'
import ConfirmUpdateDialog from './ConfirmUpdateDialog'
import ConfirmDeleteDialog from './ConfirmDeleteDialog'
import AccountFormSkeleton from './AccountFormSkeleton'

export default function AccountForm() {
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
    goToBilling,
    currentPasswordRef,
  } = useAccountForm()

  if (loadingUser && !currentUser) {
    return <AccountFormSkeleton />
  }

  return (
    <>
      <AccountTopBar dirty={dirty} saving={saving} onReset={onRevertAll} formId="account-form" />

      <form id="account-form" onSubmit={onSave} className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <ProfileOverviewCard
          initials={initials}
          displayName={form.displayName || currentUser?.displayName}
          email={form.email || currentUser?.email}
          selectedEmoji={form.avatar || ''}
          onSelectEmoji={emoji => setForm(prev => ({ ...prev, avatar: emoji }))}
        />

        <div className="lg:col-span-2 space-y-6">
          <AccountDetailsCard form={form} setForm={setForm} saving={saving} />

          <SecurityCard
            showPassword={showPassword}
            setShowPassword={setShowPassword}
            form={form}
            setForm={setForm}
            passwordErrors={passwordErrors}
            saving={saving}
            cancelPasswordEdit={cancelPasswordEdit}
            currentPasswordRef={currentPasswordRef}
          />

          <DangerZoneCard deleting={deleting} onDelete={onDelete} />
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
    </>
  )
}
