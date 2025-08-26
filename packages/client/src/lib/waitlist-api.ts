/**
 * Waitlist API client
 */

export interface WaitlistCheckResponse {
  isApproved: boolean;
  message: string;
  redirectUrl?: string;
}

export interface WaitlistStatusResponse {
  isValidated: boolean;
  email?: string;
}

/**
 * Check if an email is approved for early access
 */
export async function checkWaitlistApproval(email: string): Promise<WaitlistCheckResponse> {
  const response = await fetch('/api/waitlist/check', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'include',
    body: JSON.stringify({ email })
  });

  if (!response.ok) {
    throw new Error('Failed to check waitlist status');
  }

  return response.json();
}

/**
 * Get current waitlist validation status
 */
export async function getWaitlistStatus(): Promise<WaitlistStatusResponse> {
  const response = await fetch('/api/waitlist/status', {
    credentials: 'include'
  });

  if (!response.ok) {
    throw new Error('Failed to get waitlist status');
  }

  return response.json();
}

/**
 * Clear waitlist session
 */
export async function clearWaitlistSession(): Promise<void> {
  const response = await fetch('/api/waitlist/logout', {
    method: 'POST',
    credentials: 'include'
  });

  if (!response.ok) {
    throw new Error('Failed to clear waitlist session');
  }
}