'use client';

import { OnboardingSession, StorageSchema } from './types';

const STORAGE_KEY = 'onboarding_session';
const STORAGE_VERSION = 1;
const TTL_HOURS = 2;

// Generate a unique device ID for this session
function getDeviceId(): string {
  let deviceId = localStorage.getItem('device_id');
  if (!deviceId) {
    deviceId = `device_${Date.now()}_${Math.random().toString(36).substring(2)}`;
    localStorage.setItem('device_id', deviceId);
  }
  return deviceId;
}

// Generate a unique session ID
export function generateSessionId(): string {
  return `sibil_${Date.now()}_${Math.random().toString(36).substring(2)}`;
}

// Store session with fallback chain
export function storeSession(session: OnboardingSession): boolean {
  const schema: StorageSchema = {
    version: STORAGE_VERSION,
    data: session,
    metadata: {
      createdAt: Date.now(),
      updatedAt: Date.now(),
      expiresAt: Date.now() + (TTL_HOURS * 60 * 60 * 1000),
      deviceId: getDeviceId()
    }
  };

  const serialized = JSON.stringify(schema);

  // Use localStorage as primary (persists across auth redirects)
  try {
    localStorage.setItem(STORAGE_KEY, serialized);
    // Also store in sessionStorage for same-session access
    try {
      sessionStorage.setItem(STORAGE_KEY, serialized);
    } catch (e) {
      // SessionStorage failure is not critical
    }
    return true;
  } catch (e) {
    console.warn('LocalStorage failed:', e);
  }

  // Fall back to sessionStorage only
  try {
    sessionStorage.setItem(STORAGE_KEY, serialized);
    return true;
  } catch (e) {
    console.warn('SessionStorage failed:', e);
  }

  // Fall back to URL state (compressed)
  try {
    const compressed = btoa(serialized);
    const url = new URL(window.location.href);
    url.searchParams.set('onboarding_state', compressed);
    window.history.replaceState({ onboarding: compressed }, '', url.toString());
    return true;
  } catch (e) {
    console.warn('URL state failed:', e);
  }

  // Last resort: cookie (vision ID only)
  try {
    document.cookie = `onboarding_vision=${encodeURIComponent(session.pendingVision || '')}; max-age=7200; path=/`;
    return true;
  } catch (e) {
    console.error('All storage methods failed:', e);
    return false;
  }
}

// Retrieve session from storage
export function retrieveSession(): StorageSchema | null {
  // Try localStorage first (persists across auth redirects)
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.warn('Failed to retrieve from localStorage:', e);
  }

  // Try sessionStorage as fallback
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.warn('Failed to retrieve from sessionStorage:', e);
  }

  // Try URL state
  try {
    const url = new URL(window.location.href);
    const compressed = url.searchParams.get('onboarding_state');
    if (compressed) {
      const decompressed = atob(compressed);
      return JSON.parse(decompressed);
    }
  } catch (e) {
    console.warn('Failed to retrieve from URL state:', e);
  }

  // Try cookie (limited recovery)
  try {
    const cookies = document.cookie.split(';');
    const visionCookie = cookies.find(c => c.trim().startsWith('onboarding_vision='));
    if (visionCookie) {
      const vision = decodeURIComponent(visionCookie.split('=')[1]);
      if (vision) {
        // Create a minimal session from cookie
        const minimalSession: OnboardingSession = {
          pendingVision: vision,
          visionAnalysis: null,
          isOnboarding: true,
          onboardingStep: 'vision',
          startedAt: Date.now(),
          sibilSessionId: generateSessionId(),
          sibilMessages: [],
          lastError: null,
          retryCount: 0
        };

        return {
          version: STORAGE_VERSION,
          data: minimalSession,
          metadata: {
            createdAt: Date.now(),
            updatedAt: Date.now(),
            expiresAt: Date.now() + (TTL_HOURS * 60 * 60 * 1000),
            deviceId: getDeviceId()
          }
        };
      }
    }
  } catch (e) {
    console.warn('Failed to retrieve from cookie:', e);
  }

  return null;
}

// Clear session from all storage
export function clearSession(): void {
  // Clear from all storage locations
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn('Failed to clear sessionStorage:', e);
  }

  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn('Failed to clear localStorage:', e);
  }

  // Clear URL state
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete('onboarding_state');
    window.history.replaceState({}, '', url.toString());
  } catch (e) {
    console.warn('Failed to clear URL state:', e);
  }

  // Clear cookie
  try {
    document.cookie = 'onboarding_vision=; max-age=0; path=/';
  } catch (e) {
    console.warn('Failed to clear cookie:', e);
  }
}

// Check if storage is available
export function isStorageAvailable(): boolean {
  try {
    const test = '__storage_test__';
    sessionStorage.setItem(test, test);
    sessionStorage.removeItem(test);
    return true;
  } catch {
    return false;
  }
}