import { NextResponse } from 'next/server'
import { getEnvConfig } from '@starships/env'

/**
 * Runtime Configuration Endpoint
 * Returns runtime configuration for client-side services
 */
export async function GET() {
  try {
    // Load configuration at runtime (not build time!)
    const serverUrl = getEnvConfig().SERVER_URL

    return NextResponse.json({
      serverUrl,
    })
  } catch (error) {
    console.error('Error loading runtime config:', error)
    return NextResponse.json({ error: 'Failed to load configuration' }, { status: 500 })
  }
}
