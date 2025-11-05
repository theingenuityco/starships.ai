'use client'

import Icon from '@/components/primitives/Icon'

import React, { useEffect, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'
import { toast } from 'sonner'
import type { OAuthAccountModel } from '@starships/protocol'

import { motion } from 'motion/react'

// OAuth query keys following established pattern
const OAUTH_QUERY_KEYS = {
  all: ['oauth'] as const,
  accounts: () => [...OAUTH_QUERY_KEYS.all, 'accounts'] as const,
} as const

// Response data extraction helper
const extractResponseData = <T = any,>(response: any): T => response.data.data

// OAuth accounts hook
function useOAuthAccounts(enabled: boolean = true) {
  return useQuery({
    queryKey: OAUTH_QUERY_KEYS.accounts(),
    queryFn: async () => {
      const response = await api.get('/api/v1/auth/oauth/accounts')
      const accounts = extractResponseData<{ accounts: OAuthAccountModel[] }>(response)
      return accounts
    },
    enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  })
}

// Unlink OAuth account mutation
function useUnlinkOAuthAccount() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (provider: 'google' | 'github') => {
      const response = await api.delete(`/api/v1/auth/oauth/unlink/${provider}`)
      return response.data
    },
    onMutate: async provider => {
      // Cancel competing queries
      await queryClient.cancelQueries({ queryKey: OAUTH_QUERY_KEYS.accounts() })

      // Snapshot current accounts
      const previousAccounts = queryClient.getQueryData(OAUTH_QUERY_KEYS.accounts())

      // Optimistic update: remove account
      queryClient.setQueryData(OAUTH_QUERY_KEYS.accounts(), (old: any) => {
        if (!old?.accounts) return old
        return {
          accounts: old.accounts.filter((account: OAuthAccountModel) => account.provider !== provider),
        }
      })

      return { previousAccounts, provider }
    },
    onSuccess: (_, provider) => {
      toast.success(`${provider} account has been unlinked successfully.`)
    },
    onError: (error: any, provider, context) => {
      // Rollback optimistic update
      if (context?.previousAccounts) {
        queryClient.setQueryData(OAUTH_QUERY_KEYS.accounts(), context.previousAccounts)
      }

      toast.error(error?.response?.data?.error?.message || 'Failed to unlink OAuth account')
    },
    onSettled: () => {
      // Refresh accounts data
      queryClient.invalidateQueries({ queryKey: OAUTH_QUERY_KEYS.accounts() })
    },
  })
}

const ProviderIcon = ({ provider }: { provider: 'google' | 'github' }) => {
  if (provider === 'google') {
    return <Icon name="chrome" className="h-4 w-4 text-blue-600" />
  }
  return <Icon name="github" className="h-4 w-4 text-gray-900 dark:text-gray-100" />
}

const ProviderName = ({ provider }: { provider: 'google' | 'github' }) => {
  return provider === 'google' ? 'Google' : 'GitHub'
}

export function OAuthAccountsSettings() {
  const { data: accountsData, isLoading, error, refetch } = useOAuthAccounts()
  const unlinkMutation = useUnlinkOAuthAccount()
  const searchParams = useSearchParams()
  const router = useRouter()
  const oauthLinkToastShownRef = useRef(false)

  const accounts = accountsData?.accounts || []

  // Handle OAuth linking success/error
  useEffect(() => {
    // Small delay to ensure page is loaded
    const timer = setTimeout(() => {
      const oauthLink = searchParams?.get('oauth_link')
      const provider = searchParams?.get('provider')

      if (oauthLink === 'success' && provider && !oauthLinkToastShownRef.current) {
        oauthLinkToastShownRef.current = true
        toast.success(`${provider.charAt(0).toUpperCase() + provider.slice(1)} account linked successfully!`)
        // Refetch accounts data to show the newly linked account
        refetch()

        // Clear query params after showing toast
        const params = new URLSearchParams(searchParams.toString())
        params.delete('oauth_link')
        params.delete('provider')
        router.replace(`?${params.toString()}`, { scroll: false })

        // Reset ref after navigation
        setTimeout(() => {
          oauthLinkToastShownRef.current = false
        }, 100)
      } else if (oauthLink === 'error' && !oauthLinkToastShownRef.current) {
        oauthLinkToastShownRef.current = true
        const message = searchParams?.get('message')
        toast.error(`Failed to link account: ${message || 'Unknown error'}`)

        // Clear query params after showing toast
        const params = new URLSearchParams(searchParams.toString())
        params.delete('oauth_link')
        params.delete('message')
        router.replace(`?${params.toString()}`, { scroll: false })

        // Reset ref after navigation
        setTimeout(() => {
          oauthLinkToastShownRef.current = false
        }, 100)
      }
    }, 100)

    return () => clearTimeout(timer)
  }, [searchParams, refetch, router])

  // OAuth initiation function - uses secure authenticated endpoint
  const handleLinkAccount = async (provider: 'google' | 'github') => {
    try {
      const response = await api.post(`/api/v1/auth/oauth/link/${provider}`)
      const { authUrl } = extractResponseData<{ authUrl: string }>(response)

      // Redirect to OAuth provider with secure state
      window.location.href = authUrl
    } catch (error: any) {
      console.error('Failed to initiate OAuth linking:', error)
      toast.error('Failed to start account linking process')
    }
  }

  const handleUnlinkAccount = async (provider: 'google' | 'github') => {
    if (window.confirm(`Are you sure you want to unlink your ${ProviderName({ provider })} account?`)) {
      await unlinkMutation.mutateAsync(provider)
    }
  }

  const getProviderStatus = (provider: 'google' | 'github') => {
    return accounts.some(account => account.provider === provider)
  }

  const getProviderAccount = (provider: 'google' | 'github') => {
    return accounts.find(account => account.provider === provider)
  }

  if (isLoading) {
    return (
      <Card className="border-border/60 bg-background/70 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-base">Connected Accounts</CardTitle>
          <CardDescription>Loading your connected accounts...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {['google', 'github'].map(provider => (
              <div key={provider} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-gray-200 rounded-full animate-pulse" />
                  <div className="space-y-1">
                    <div className="w-16 h-4 bg-gray-200 rounded animate-pulse" />
                    <div className="w-24 h-3 bg-gray-200 rounded animate-pulse" />
                  </div>
                </div>
                <div className="w-20 h-8 bg-gray-200 rounded animate-pulse" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="border-border/60 bg-background/70 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-base">Connected Accounts</CardTitle>
          <CardDescription>Failed to load connected accounts</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertDescription>Failed to load your connected accounts. Please try refreshing the page.</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-border/60 bg-background/70 backdrop-blur-sm transition-shadow hover:shadow-sm h-fit">
      <CardHeader className="pb-4">
        <CardTitle className="text-base flex items-center gap-2">
          <Icon name="shield" className="h-4 w-4 text-primary" />
          Connected Accounts
        </CardTitle>
        <CardDescription className="text-sm">Link accounts for authentication only - we don&apos;t access your account data or perform actions on your behalf</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {(['google', 'github'] as const).map(provider => {
          const isLinked = getProviderStatus(provider)
          const account = getProviderAccount(provider)

          return (
            <motion.div
              key={provider}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                  <ProviderIcon provider={provider} />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">
                      <ProviderName provider={provider} />
                    </p>
                    {isLinked && (
                      <Badge variant="secondary" className="text-xs">
                        <Icon name="check-circle" className="h-3 w-3 mr-1" />
                        Connected
                      </Badge>
                    )}
                  </div>
                  {isLinked && account ? (
                    <p className="text-xs text-muted-foreground">
                      {account.email}
                      {account.profileData?.name && ` • ${account.profileData.name}`}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Not connected</p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {isLinked ? (
                  <Button variant="outline" size="sm" onClick={() => handleUnlinkAccount(provider)} disabled={unlinkMutation.isPending} className="text-destructive hover:text-destructive">
                    <Icon name="unlink" className="h-3 w-3 mr-1" />
                    Unlink
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => handleLinkAccount(provider)}>
                    <Icon name="external-link" className="h-3 w-3 mr-1" />
                    Connect
                  </Button>
                )}
              </div>
            </motion.div>
          )
        })}

        {accounts.length > 0 && (
          <Alert>
            <Icon name="shield" className="h-4 w-4" />
            <AlertDescription>You can use any linked account to sign in securely. We only use these for authentication - no data access or actions are performed on your accounts.</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}
