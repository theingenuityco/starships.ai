'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/useToast'
import { useTypewriter } from '@/hooks/useTypewriter'
import api, { Agent } from '@/lib/api'
import type { Message } from '@/types/chat'
import { AlertCircle, Play, Plus, RotateCcw, Send, Trash2, Wifi, WifiOff } from 'lucide-react'
import { useEffect, useState } from 'react'

interface AgentTesterProps {
  agent: Agent
  onClose?: () => void
}

interface TestCase {
  id: string
  name: string
  input: string
  expectedBehavior: string
  category: 'functionality' | 'safety' | 'performance'
  result?: TestResult
}

interface TestResult {
  id: string
  testCaseId: string
  response: string
  timestamp: string
  passed: boolean
  notes?: string
}

export function AgentTester({ agent, onClose }: AgentTesterProps) {
  const { toast } = useToast()

  // Real-time connection is not implemented
  const isConnected = false
  const connectionStatus = 'disconnected' as const
  const connectionError = 'Real-time communication is not yet implemented'

  // Typewriter effect
  const typewriter = useTypewriter({
    onComplete: () => setLoading(false),
  })

  // Chat state
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [conversationId] = useState(`test-${agent.id}-${Date.now()}`)
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, setIsTyping] = useState(false)
  const [currentStreamAbort, setCurrentStreamAbort] = useState<(() => void) | null>(null)

  // Test case management state
  const [testCases, setTestCases] = useState<TestCase[]>([])
  const [showTestCases, setShowTestCases] = useState(false)
  const [newTestCase, setNewTestCase] = useState<Partial<TestCase>>({
    name: '',
    input: '',
    expectedBehavior: '',
    category: 'functionality',
  })

  // Load saved test cases for this agent
  useEffect(() => {
    loadTestCases()
  }, [agent.id])

  const loadTestCases = () => {
    try {
      const saved = localStorage.getItem(`agent-test-cases-${agent.id}`)
      if (saved) {
        setTestCases(JSON.parse(saved))
      }
    } catch (error) {
      console.error('Failed to load test cases:', error)
    }
  }

  const saveTestCases = (cases: TestCase[]) => {
    try {
      localStorage.setItem(`agent-test-cases-${agent.id}`, JSON.stringify(cases))
      setTestCases(cases)
    } catch (error) {
      console.error('Failed to save test cases:', error)
      toast({
        title: 'Error',
        description: 'Failed to save test cases',
        variant: 'destructive',
      })
    }
  }

  const sendMessage = async (messageContent: string) => {
    if (!messageContent.trim() || loading) return

    // Real-time testing not yet implemented
    setError('Real-time agent testing is currently unavailable.')
    toast({
      title: 'Feature Unavailable',
      description: 'Real-time agent testing is not yet implemented.',
      variant: 'destructive',
    })
    return
  }

  const handleSendMessage = () => {
    sendMessage(input)
    setInput('')
  }

  const clearChat = async () => {
    try {
      await api.delete(`/api/v1/conversations/${conversationId}/memory`)
      setMessages([])
      toast({
        title: 'Success',
        description: 'Chat cleared successfully',
        variant: 'success',
      })
    } catch (error) {
      console.error('Failed to clear chat:', error)
      toast({
        title: 'Error',
        description: 'Failed to clear chat',
        variant: 'destructive',
      })
    }
  }

  const addTestCase = () => {
    if (!newTestCase.name || !newTestCase.input || !newTestCase.expectedBehavior) {
      toast({
        title: 'Error',
        description: 'Please fill in all test case fields',
        variant: 'destructive',
      })
      return
    }

    const testCase: TestCase = {
      id: `test-${Date.now()}`,
      name: newTestCase.name,
      input: newTestCase.input,
      expectedBehavior: newTestCase.expectedBehavior,
      category: newTestCase.category || 'functionality',
    }

    const updatedCases = [...testCases, testCase]
    saveTestCases(updatedCases)
    setNewTestCase({ name: '', input: '', expectedBehavior: '', category: 'functionality' })
    toast({
      title: 'Success',
      description: 'Test case added successfully',
      variant: 'success',
    })
  }

  const deleteTestCase = (id: string) => {
    const updatedCases = testCases.filter(tc => tc.id !== id)
    saveTestCases(updatedCases)
    toast({
      title: 'Success',
      description: 'Test case deleted',
      variant: 'success',
    })
  }

  const runTestCase = async (testCase: TestCase) => {
    toast({
      title: 'Feature Unavailable',
      description: 'Test case execution is not yet implemented.',
      variant: 'destructive',
    })
    return
  }

  const getCategoryColor = (category: TestCase['category']) => {
    const colors = {
      functionality: 'bg-blue-100 text-blue-800',
      safety: 'bg-red-100 text-red-800',
      performance: 'bg-green-100 text-green-800',
    }
    return colors[category]
  }

  return (
    <div className="h-full flex flex-col bg-zinc-900">
      {/* Clean, Modern Header */}
      <div className="border-b border-zinc-800 bg-zinc-900 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
              <span className="text-white text-sm font-medium">{agent.name.charAt(0).toUpperCase()}</span>
            </div>
            <div>
              <h2 className="font-semibold text-lg text-white">Testing: {agent.name}</h2>
              <div className="flex items-center gap-2 mt-1">
                <Badge className="bg-blue-600 text-white">{agent.category}</Badge>
                <Badge variant="outline" className="text-zinc-400 border-zinc-700">
                  {agent.model}
                </Badge>
                {agent.temperature && (
                  <Badge variant="outline" className="text-zinc-400 border-zinc-700">
                    temp: {agent.temperature}
                  </Badge>
                )}
                {agent.maxTokens && (
                  <Badge variant="outline" className="text-zinc-400 border-zinc-700">
                    max: {agent.maxTokens}
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Clean Connection Status Badge */}
            <div className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${'bg-red-500/10 text-red-500'}`}>
              {isConnected ? (
                <>
                  <Wifi className="w-3 h-3" />
                  <span>Connected</span>
                </>
              ) : false ? (
                <>
                  <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full" />
                  <span>Reconnecting</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3 h-3" />
                  <span>Disconnected</span>
                </>
              )}
            </div>

            {/* Connection Error Indicator */}
            {connectionError && (
              <div className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-red-500/10 text-red-500">
                <AlertCircle className="w-3 h-3" />
                <span>Error</span>
              </div>
            )}

            <Button onClick={() => setShowTestCases(!showTestCases)} size="sm" variant="outline" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800">
              {showTestCases ? 'Hide' : 'Show'} Test Cases
            </Button>
            <Button onClick={clearChat} size="sm" variant="outline" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800">
              <RotateCcw className="w-4 h-4 mr-2" />
              Clear Chat
            </Button>
            {onClose && (
              <Button onClick={onClose} size="sm" variant="ghost" className="text-zinc-400 hover:bg-zinc-800">
                Close
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Chat Area */}
        <div className="flex-1 flex flex-col">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4">
            {messages.length === 0 ? (
              <div className="text-center text-zinc-500 py-8">
                <p className="mb-4">Start a conversation to test this agent</p>
              </div>
            ) : (
              messages.map(message => (
                <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'} mb-4`}>
                  <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${message.role === 'user' ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-200 border border-zinc-700'}`}>
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                    <p className="text-xs opacity-70 mt-1">
                      {new Date(message.timestamp).toLocaleTimeString()}
                      {message.streaming && <span className="ml-2 text-blue-400">●</span>}
                      {message.sending && <span className="ml-2 text-yellow-400">⏳</span>}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Streaming Indicator */}
          {loading && streamingMessageId && (
            <div className="px-4 py-2 border-t border-zinc-800 bg-zinc-900">
              <div className="flex items-center gap-2 text-sm text-zinc-400">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <span>{agent.name} is responding...</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0 ml-auto text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300"
                  onClick={() => {
                    if (currentStreamAbort) {
                      currentStreamAbort()
                      setCurrentStreamAbort(null)
                      setLoading(false)
                      setIsTyping(false)
                      setStreamingMessageId(null)
                    }
                  }}
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect width="10" height="10" rx="1" fill="currentColor" />
                  </svg>
                </Button>
              </div>
            </div>
          )}

          {/* Input */}
          <div className="border-t border-zinc-800 bg-zinc-900 p-4">
            <div className="flex gap-2">
              <Textarea
                value={input}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
                placeholder="Real-time agent testing is currently unavailable..."
                className="flex-1 min-h-[60px] resize-none bg-zinc-800 text-white placeholder-zinc-500 border-none rounded-lg focus:ring-1 focus:ring-blue-500"
                disabled={!isConnected}
                onKeyPress={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSendMessage()
                  }
                }}
              />
              <Button onClick={handleSendMessage} disabled={!input.trim() || loading || !isConnected} size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
                <Send className="w-4 h-4" />
              </Button>
            </div>

            {/* Connection Error Message */}
            {error && <div className="mt-2 p-2 bg-red-500/10 rounded text-sm text-red-500">{error}</div>}
          </div>
        </div>

        {/* Test Cases Panel */}
        {showTestCases && (
          <>
            <Separator orientation="vertical" className="bg-zinc-800" />
            <div className="w-96 border-l border-zinc-800 bg-zinc-900 flex flex-col">
              <div className="p-4 border-b border-zinc-800">
                <h3 className="font-semibold text-white mb-2">Test Cases</h3>
                <p className="text-xs text-zinc-400">Create and run test scenarios for this agent</p>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* Add New Test Case */}
                <Card className="p-4 bg-zinc-800 border-zinc-700 shadow-md">
                  <h4 className="text-sm font-medium mb-3 text-white">Add Test Case</h4>
                  <div className="space-y-2">
                    <input
                      type="text"
                      placeholder="Test case name"
                      value={newTestCase.name || ''}
                      onChange={e => setNewTestCase(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full px-2 py-1 text-xs bg-zinc-700 border-none rounded text-white placeholder-zinc-500 focus:ring-1 focus:ring-blue-500"
                    />
                    <select
                      value={newTestCase.category || 'functionality'}
                      onChange={e =>
                        setNewTestCase(prev => ({
                          ...prev,
                          category: e.target.value as TestCase['category'],
                        }))
                      }
                      className="w-full px-2 py-1 text-xs bg-zinc-700 border-none rounded text-white focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="functionality">Functionality</option>
                      <option value="safety">Safety</option>
                      <option value="performance">Performance</option>
                    </select>
                    <textarea
                      placeholder="Test input message"
                      value={newTestCase.input || ''}
                      onChange={e => setNewTestCase(prev => ({ ...prev, input: e.target.value }))}
                      className="w-full px-2 py-1 text-xs bg-zinc-700 border-none rounded h-16 resize-none text-white placeholder-zinc-500 focus:ring-1 focus:ring-blue-500"
                    />
                    <textarea
                      placeholder="Expected behavior"
                      value={newTestCase.expectedBehavior || ''}
                      onChange={e => setNewTestCase(prev => ({ ...prev, expectedBehavior: e.target.value }))}
                      className="w-full px-2 py-1 text-xs bg-zinc-700 border-none rounded h-16 resize-none text-white placeholder-zinc-500 focus:ring-1 focus:ring-blue-500"
                    />
                    <Button onClick={addTestCase} size="sm" className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                      <Plus className="w-3 h-3 mr-1" />
                      Add Test Case
                    </Button>
                  </div>
                </Card>

                {/* Existing Test Cases */}
                {testCases.map(testCase => (
                  <Card key={testCase.id} className="p-4 bg-zinc-800 border-zinc-700 shadow-md">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <h4 className="text-sm font-medium text-white">{testCase.name}</h4>
                        <Badge className={`text-xs mt-1 ${getCategoryColor(testCase.category)}`}>{testCase.category}</Badge>
                      </div>
                      <div className="flex gap-1">
                        <Button onClick={() => runTestCase(testCase)} size="sm" variant="outline" className="border-zinc-700 text-zinc-300 hover:bg-zinc-700" disabled={loading}>
                          <Play className="w-3 h-3" />
                        </Button>
                        <Button onClick={() => deleteTestCase(testCase.id)} size="sm" variant="ghost" className="text-red-400 hover:bg-red-500/10">
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div>
                        <p className="font-medium text-zinc-400">Input:</p>
                        <p className="bg-zinc-700 p-2 rounded text-zinc-300">{testCase.input}</p>
                      </div>
                      <div>
                        <p className="font-medium text-zinc-400">Expected:</p>
                        <p className="bg-zinc-700 p-2 rounded text-zinc-300">{testCase.expectedBehavior}</p>
                      </div>

                      {testCase.result && (
                        <div>
                          <p className="font-medium text-zinc-400">Last Result:</p>
                          <div className="bg-zinc-700 p-2 rounded">
                            <p className="mb-1 text-zinc-300">{testCase.result.response}</p>
                            <p className="text-xs text-zinc-500">{new Date(testCase.result.timestamp).toLocaleString()}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
