'use client'

import React from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { useOAuthAccounts, useUnlinkOAuthAccount, useOAuthLogin } from '@/hooks/useOAuth'
import { Github, Chrome, ExternalLink, Unlink, Shield, CheckCircle } from 'lucide-react'
import { motion } from 'motion/react'

const ProviderIcon = ({ provider }: { provider: 'google' | 'github' }) => {
  if (provider === 'google') {
    return <Chrome className="h-4 w-4 text-blue-600" />
  }
  return <Github className="h-4 w-4 text-gray-900 dark:text-gray-100" />
}

const ProviderName = ({ provider }: { provider: 'google' | 'github' }) => {
  return provider === 'google' ? 'Google' : 'GitHub'
}

export function OAuthAccountsSettings() {
  const { data: accountsData, isLoading, error } = useOAuthAccounts()
  const unlinkMutation = useUnlinkOAuthAccount()
  const { initiateOAuth } = useOAuthLogin()

  const accounts = accountsData?.accounts || []

  const handleLinkAccount = (provider: 'google' | 'github') => {
    initiateOAuth(provider)
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
            <AlertDescription>
              Failed to load your connected accounts. Please try refreshing the page.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-border/60 bg-background/70 backdrop-blur-sm transition-shadow hover:shadow-sm">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          Connected Accounts
        </CardTitle>
        <CardDescription>
          Link your accounts to sign in with multiple methods and enhance security
        </CardDescription>
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
                        <CheckCircle className="h-3 w-3 mr-1" />
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
                    <p className="text-xs text-muted-foreground">
                      Not connected
                    </p>
                  )}
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                {isLinked ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleUnlinkAccount(provider)}
                    disabled={unlinkMutation.isPending}
                    className="text-destructive hover:text-destructive"
                  >
                    <Unlink className="h-3 w-3 mr-1" />
                    Unlink
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleLinkAccount(provider)}
                  >
                    <ExternalLink className="h-3 w-3 mr-1" />
                    Connect
                  </Button>
                )}
              </div>
            </motion.div>
          )
        })}
        
        {accounts.length > 0 && (
          <Alert>
            <Shield className="h-4 w-4" />
            <AlertDescription>
              You can use any connected account to sign in. For security, ensure you have at least one authentication method available.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}