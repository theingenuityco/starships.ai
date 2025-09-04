'use client'

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { missionApi } from '@/lib/missionApi'

export function DebugMissionList() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string>('')

  const testApiCall = async () => {
    setLoading(true)
    setResult('')

    try {
      console.log('Making API call to get all missions...')
      const response = await missionApi.getAllMissions()
      console.log('API Response:', response)

      if (response.error) {
        setResult(`Error: ${response.error}`)
      } else {
        setResult(`Success: Found ${response.data?.missions.length || 0} missions\n${JSON.stringify(response.data, null, 2)}`)
      }
    } catch (err) {
      console.error('Exception:', err)
      setResult(`Exception: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    testApiCall()
  }, [])

  return (
    <div className="p-8">
      <div className="mb-4">
        <h2 className="text-2xl font-bold mb-4">Mission API Debug</h2>
        <Button onClick={testApiCall} disabled={loading}>
          {loading ? 'Loading...' : 'Test API Call'}
        </Button>
      </div>

      <div className="border rounded p-4 bg-gray-50 dark:bg-gray-900">
        <h3 className="font-semibold mb-2">Result:</h3>
        <pre className="whitespace-pre-wrap text-sm">{result || 'No result yet...'}</pre>
      </div>
    </div>
  )
}
