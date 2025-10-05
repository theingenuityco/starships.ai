import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { toast } from 'sonner';
import type { OAuthAccountModel } from '@starships/protocol';

// Hierarchical query keys following established pattern
export const OAUTH_QUERY_KEYS = {
  all: ['oauth'] as const,
  accounts: () => [...OAUTH_QUERY_KEYS.all, 'accounts'] as const,
  userAccounts: (userId: string) => [...OAUTH_QUERY_KEYS.accounts(), userId] as const,
} as const;

/**
 * Response data extraction helper - follows established pattern
 */
const extractResponseData = <T>(response: any): T => response.data.data;

/**
 * Get user's linked OAuth accounts
 * Follows established query pattern with caching
 */
export function useOAuthAccounts(enabled: boolean = true) {
  return useQuery({
    queryKey: OAUTH_QUERY_KEYS.accounts(),
    queryFn: async () => {
      const response = await api.get('/api/v1/auth/oauth/accounts');
      const accounts = extractResponseData<{ accounts: OAuthAccountModel[] }>(response);
      return accounts;
    },
    enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}

/**
 * Unlink OAuth account mutation
 * Follows established mutation pattern with optimistic updates
 */
export function useUnlinkOAuthAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (provider: 'google' | 'github') => {
      const response = await api.delete(`/api/v1/auth/oauth/unlink/${provider}`);
      return response.data;
    },
    onMutate: async (provider) => {
      // Cancel competing queries
      await queryClient.cancelQueries({ queryKey: OAUTH_QUERY_KEYS.accounts() });

      // Snapshot current accounts
      const previousAccounts = queryClient.getQueryData(OAUTH_QUERY_KEYS.accounts());

      // Optimistic update: remove account
      queryClient.setQueryData(OAUTH_QUERY_KEYS.accounts(), (old: any) => {
        if (!old?.accounts) return old;
        return {
          accounts: old.accounts.filter((account: OAuthAccountModel) => account.provider !== provider),
        };
      });

      return { previousAccounts, provider };
    },
    onSuccess: (_, provider) => {
      toast.success(`${provider} account has been unlinked successfully.`);
    },
    onError: (error: any, provider, context) => {
      // Rollback optimistic update
      if (context?.previousAccounts) {
        queryClient.setQueryData(OAUTH_QUERY_KEYS.accounts(), context.previousAccounts);
      }

      toast.error(error?.response?.data?.error?.message || 'Failed to unlink OAuth account');
    },
    onSettled: () => {
      // Refresh accounts data
      queryClient.invalidateQueries({ queryKey: OAUTH_QUERY_KEYS.accounts() });
    },
  });
}

/**
 * OAuth initiation helper
 * Handles redirect to OAuth provider
 */
export function useOAuthLogin() {
  return {
    initiateOAuth: (provider: 'google' | 'github') => {
      window.location.href = `/api/v1/auth/${provider}`;
    },
  };
}