'use client'

import { useState, useEffect } from 'react'
import { Agent, chatAPI } from '@/lib/api'
import type { Message } from '@/lib/agent-socket-api'
import { MessageBubble } from '@/components/chat/MessageBubble'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Send, RotateCcw, Play, Save, Trash2, Plus, Wifi, WifiOff, AlertCircle } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { agentSocketAPI } from '@/lib/agent-socket-api'
import { useSocketConnection } from '@/hooks/useSocketConnection'
import { useTypewriter } from '@/hooks/useTypewriter'
import { StreamingIndicator } from '@/components/sibil/StreamingIndicator'

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
  const { userId } = useAuth()
  const { toast } = useToast()

  // Socket.IO connection
  const { isConnected, connectionStatus, error: connectionError } = useSocketConnection()
  
  // Typewriter effect
  const typewriter = useTypewriter({
    onComplete: () => setLoading(false)
  })

  // Chat state
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [sessionId] = useState(`test-${agent.id}-${Date.now()}`)
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isTyping, setIsTyping] = useState(false)
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
  const [editingTestCase, setEditingTestCase] = useState<string | null>(null)

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

    // Check Socket.IO connection
    if (!isConnected) {
      setError('Socket.IO connection required. Please check your connection and try again.')
      toast({
        title: 'Connection Error',
        description: 'Socket.IO connection required. Please check your connection.',
        variant: 'destructive',
      })
      return
    }

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      content: messageContent.trim(),
      role: 'user',
      timestamp: new Date().toISOString(),
      sessionId,
      sending: true,
    }

    setMessages(prev => [...prev, userMessage])
    setLoading(true)
    setError(null)
    typewriter.reset()

    // Create streaming assistant message
    const assistantMessageId = `assistant-${Date.now()}`
    setStreamingMessageId(assistantMessageId)

    const streamingMessage: Message = {
      id: assistantMessageId,
      content: '',
      role: 'assistant',
      timestamp: new Date().toISOString(),
      sessionId,
      streaming: true,
      agentId: agent.id
    }

    setMessages(prev => [
      ...prev.slice(0, -1), // Remove sending message
      { ...userMessage, sending: false }, // Add final user message
      streamingMessage, // Add streaming assistant message
    ])

    // Start Socket.IO streaming
    const { abort } = agentSocketAPI.sendMessageStream(agent.id, {
      sessionId,
      message: messageContent
    }, {
      onChunk: (chunk, accumulated) => {
        if (chunk.typewriter) {
          typewriter.addChunk(chunk.typewriter)
        }
        
        // Update streaming message with accumulated content
        setMessages(prev => prev.map(msg =>
          msg.id === assistantMessageId
            ? { ...msg, content: typewriter.displayText || accumulated }
            : msg
        ))
      },
      onComplete: (finalMessage) => {
        // Replace streaming message with final message
        setMessages(prev => prev.map(msg =>
          msg.id === assistantMessageId
            ? {
                ...finalMessage,
                id: assistantMessageId,
                streaming: false
              }
            : msg
        ))
        setStreamingMessageId(null)
        setLoading(false)
        
        toast({
          title: 'Success',
          description: 'Message sent successfully',
          variant: 'success',
        })
      },
      onError: (error) => {
        console.error('Failed to send message:', error)
        setError(`Chat failed: ${error}. Please check your connection and try again.`)
        
        // Remove failed streaming message
        setMessages(prev => prev.filter(msg => msg.id !== assistantMessageId))
        setStreamingMessageId(null)
        setLoading(false)
        
        toast({
          title: 'Error',
          description: `Failed to send message: ${error}`,
          variant: 'destructive',
        })
      },
      onTypingStart: () => {
        setIsTyping(true)
      },
      onTypingStop: () => {
        setIsTyping(false)
      }
    })

    // Store abort function for stream cancellation
    setCurrentStreamAbort(() => abort)
  }

  const handleSendMessage = () => {
    sendMessage(input)
    setInput('')
  }

  const clearChat = async () => {
    try {
      await chatAPI.clearMemory(sessionId)
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
    if (!isConnected) {
      toast({
        title: 'Connection Error',
        description: 'Socket.IO connection required to run test cases',
        variant: 'destructive',
      })
      return
    }

    try {
      setLoading(true)

      // Use Socket.IO streaming for test case execution
      const { abort } = agentSocketAPI.sendMessageStream(agent.id, {
        sessionId: `test-case-${testCase.id}-${Date.now()}`,
        message: testCase.input
      }, {
        onChunk: (chunk, accumulated) => {
          // Test cases don't need real-time display, just collect the response
        },
        onComplete: (finalMessage) => {
          // Create test result
          const result: TestResult = {
            id: `result-${Date.now()}`,
            testCaseId: testCase.id,
            response: finalMessage.content,
            timestamp: new Date().toISOString(),
            passed: false, // User will need to manually evaluate
            notes: '',
          }

          // Update test case with result
          const updatedCases = testCases.map(tc => (tc.id === testCase.id ? { ...tc, result } : tc))
          saveTestCases(updatedCases)
          setLoading(false)

          toast({
            title: 'Success',
            description: 'Test case executed successfully',
            variant: 'success',
          })
        },
        onError: (error) => {
          console.error('Failed to run test case:', error)
          setLoading(false)
          toast({
            title: 'Error',
            description: `Failed to run test case: ${error}`,
            variant: 'destructive',
          })
        }
      })

    } catch (error) {
      console.error('Failed to run test case:', error)
      setLoading(false)
      toast({
        title: 'Error',
        description: 'Failed to run test case',
        variant: 'destructive',
      })
    }
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
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
              <span className="text-primary-foreground text-sm font-medium">
                {agent.name.charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <h2 className="font-semibold">Testing: {agent.name}</h2>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="secondary">{agent.category}</Badge>
                <Badge variant="outline">{agent.model}</Badge>
                {agent.temperature && <Badge variant="outline">temp: {agent.temperature}</Badge>}
                {agent.maxTokens && <Badge variant="outline">max: {agent.maxTokens}</Badge>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Enhanced Connection Status Badge */}
            <div className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs border ${
              isConnected
                ? 'bg-green-50 border-green-200 text-green-700'
                : connectionStatus === 'reconnecting'
                ? 'bg-yellow-50 border-yellow-200 text-yellow-700'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}>
              {isConnected ? (
                <>
                  <Wifi className="w-3 h-3" />
                  <span>Connected</span>
                </>
              ) : connectionStatus === 'reconnecting' ? (
                <>
                  <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  <span>Reconnecting...</span>
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
              <div className="flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-red-50 border border-red-200 text-red-700">
                <AlertCircle className="w-3 h-3" />
                <span>Error</span>
              </div>
            )}
            
            <Button onClick={() => setShowTestCases(!showTestCases)} size="sm" variant="outline">
              {showTestCases ? 'Hide' : 'Show'} Test Cases
            </Button>
            <Button onClick={clearChat} size="sm" variant="outline">
              <RotateCcw className="w-4 h-4 mr-2" />
              Clear Chat
            </Button>
            {onClose && (
              <Button onClick={onClose} size="sm" variant="ghost">
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
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                <p className="mb-4">Start a conversation to test this agent</p>
                {agent.systemPrompt && (
                  <div className="p-4 bg-muted rounded-lg text-left max-w-2xl mx-auto">
                    <p className="text-sm font-medium mb-2">System Prompt:</p>
                    <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                      {agent.systemPrompt}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              messages.map(message => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  streaming={message.id === streamingMessageId}
                  typewriterContent={message.id === streamingMessageId ? typewriter.displayText : undefined}
                />
              ))
            )}
          </div>

          {/* Streaming Indicator */}
          {loading && streamingMessageId && (
            <div className="px-4 py-2 border-t border-border bg-card/50">
              <StreamingIndicator
                onStop={() => {
                  if (currentStreamAbort) {
                    currentStreamAbort()
                    setCurrentStreamAbort(null)
                    setLoading(false)
                    setIsTyping(false)
                    setStreamingMessageId(null)
                  }
                }}
                connectionStatus={connectionStatus}
                isTyping={isTyping}
              />
            </div>
          )}

          {/* Input */}
          <div className="border-t border-border bg-card p-4">
            <div className="flex gap-2">
              <Textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder={isConnected ? "Type a message to test the agent..." : "Connect to Socket.IO to send messages..."}
                className="flex-1 min-h-[60px] resize-none"
                disabled={!isConnected}
                onKeyPress={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSendMessage()
                  }
                }}
              />
              <Button
                onClick={handleSendMessage}
                disabled={!input.trim() || loading || !isConnected}
                size="sm"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
            
            {/* Connection Error Message */}
            {error && (
              <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
                {error}
              </div>
            )}
          </div>
        </div>

        {/* Test Cases Panel */}
        {showTestCases && (
          <>
            <Separator orientation="vertical" />
            <div className="w-96 border-l bg-muted/30 flex flex-col">
              <div className="p-4 border-b">
                <h3 className="font-semibold mb-2">Test Cases</h3>
                <p className="text-xs text-muted-foreground">
                  Create and run test scenarios for this agent
                </p>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* Add New Test Case */}
                <Card className="p-3">
                  <h4 className="text-sm font-medium mb-3">Add Test Case</h4>
                  <div className="space-y-2">
                    <input
                      type="text"
                      placeholder="Test case name"
                      value={newTestCase.name || ''}
                      onChange={e => setNewTestCase(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full px-2 py-1 text-xs border rounded"
                    />
                    <select
                      value={newTestCase.category || 'functionality'}
                      onChange={e =>
                        setNewTestCase(prev => ({
                          ...prev,
                          category: e.target.value as TestCase['category'],
                        }))
                      }
                      className="w-full px-2 py-1 text-xs border rounded"
                    >
                      <option value="functionality">Functionality</option>
                      <option value="safety">Safety</option>
                      <option value="performance">Performance</option>
                    </select>
                    <textarea
                      placeholder="Test input message"
                      value={newTestCase.input || ''}
                      onChange={e => setNewTestCase(prev => ({ ...prev, input: e.target.value }))}
                      className="w-full px-2 py-1 text-xs border rounded h-16 resize-none"
                    />
                    <textarea
                      placeholder="Expected behavior"
                      value={newTestCase.expectedBehavior || ''}
                      onChange={e =>
                        setNewTestCase(prev => ({ ...prev, expectedBehavior: e.target.value }))
                      }
                      className="w-full px-2 py-1 text-xs border rounded h-16 resize-none"
                    />
                    <Button onClick={addTestCase} size="sm" className="w-full">
                      <Plus className="w-3 h-3 mr-1" />
                      Add Test Case
                    </Button>
                  </div>
                </Card>

                {/* Existing Test Cases */}
                {testCases.map(testCase => (
                  <Card key={testCase.id} className="p-3">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <h4 className="text-sm font-medium">{testCase.name}</h4>
                        <Badge className={`text-xs mt-1 ${getCategoryColor(testCase.category)}`}>
                          {testCase.category}
                        </Badge>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          onClick={() => runTestCase(testCase)}
                          size="sm"
                          variant="outline"
                          disabled={loading}
                        >
                          <Play className="w-3 h-3" />
                        </Button>
                        <Button
                          onClick={() => deleteTestCase(testCase.id)}
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div>
                        <p className="font-medium text-muted-foreground">Input:</p>
                        <p className="bg-muted p-2 rounded">{testCase.input}</p>
                      </div>
                      <div>
                        <p className="font-medium text-muted-foreground">Expected:</p>
                        <p className="bg-muted p-2 rounded">{testCase.expectedBehavior}</p>
                      </div>

                      {testCase.result && (
                        <div>
                          <p className="font-medium text-muted-foreground">Last Result:</p>
                          <div className="bg-muted p-2 rounded">
                            <p className="mb-1">{testCase.result.response}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(testCase.result.timestamp).toLocaleString()}
                            </p>
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
