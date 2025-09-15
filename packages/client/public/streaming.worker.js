/**
 * Web Worker for handling SSE streaming
 * Runs in a separate thread to prevent blocking the main UI thread
 */

// Store active connections
const connections = new Map()

/**
 * Handle messages from the main thread
 */
self.addEventListener('message', async event => {
  const { type, id, payload } = event.data

  switch (type) {
    case 'START_STREAM':
      startStream(id, payload)
      break
    case 'STOP_STREAM':
      stopStream(id)
      break
    case 'STOP_ALL':
      stopAllStreams()
      break
    default:
      console.warn('[Worker] Unknown message type:', type)
  }
})

/**
 * Start a new SSE stream
 */
async function startStream(streamId, config) {
  const { url, method, headers, body } = config

  // Close existing connection if any
  if (connections.has(streamId)) {
    stopStream(streamId)
  }

  try {
    // Send connection status
    self.postMessage({
      type: 'STATUS',
      streamId,
      status: 'connecting',
    })

    // Create the fetch request
    const response = await fetch(url, {
      method: method || 'POST',
      headers: headers || {},
      body: body ? JSON.stringify(body) : undefined,
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    // Check if it's an SSE stream
    const contentType = response.headers.get('content-type')
    if (!contentType || !contentType.includes('text/event-stream')) {
      throw new Error('Response is not an SSE stream')
    }

    // Get the reader
    const reader = response.body.getReader()
    const decoder = new TextDecoder()

    // Store the connection
    connections.set(streamId, { reader, active: true })

    // Send connection opened status
    self.postMessage({
      type: 'STATUS',
      streamId,
      status: 'connected',
    })

    // Buffer for incomplete messages
    let buffer = ''

    // Read the stream
    while (true) {
      const connection = connections.get(streamId)
      if (!connection || !connection.active) {
        break
      }

      const { done, value } = await reader.read()

      if (done) {
        self.postMessage({
          type: 'COMPLETE',
          streamId,
        })
        break
      }

      // Decode the chunk
      const chunk = decoder.decode(value, { stream: true })
      buffer += chunk

      // Process complete SSE messages
      const lines = buffer.split('\n')
      buffer = lines.pop() || '' // Keep incomplete line in buffer

      let currentEvent = {}

      for (const line of lines) {
        if (line.trim() === '') {
          // Empty line signals end of event
          if (currentEvent.data) {
            processSSEEvent(streamId, currentEvent)
          }
          currentEvent = {}
        } else if (line.startsWith('event:')) {
          currentEvent.event = line.slice(6).trim()
        } else if (line.startsWith('data:')) {
          const data = line.slice(5).trim()
          if (currentEvent.data) {
            currentEvent.data += '\n' + data
          } else {
            currentEvent.data = data
          }
        } else if (line.startsWith('id:')) {
          currentEvent.id = line.slice(3).trim()
        } else if (line.startsWith('retry:')) {
          currentEvent.retry = parseInt(line.slice(6).trim(), 10)
        }
      }

      // Process any remaining event
      if (currentEvent.data) {
        processSSEEvent(streamId, currentEvent)
      }
    }
  } catch (error) {
    console.error('[Worker] Stream error:', error)
    self.postMessage({
      type: 'ERROR',
      streamId,
      error: {
        message: error.message,
        stack: error.stack,
      },
    })
  } finally {
    // Clean up
    const connection = connections.get(streamId)
    if (connection && connection.reader) {
      try {
        await connection.reader.cancel()
      } catch (e) {
        // Ignore cancel errors
      }
    }
    connections.delete(streamId)
  }
}

/**
 * Process an SSE event
 */
function processSSEEvent(streamId, event) {
  try {
    // Parse JSON data if possible
    let parsedData
    try {
      parsedData = JSON.parse(event.data)
    } catch {
      parsedData = event.data
    }

    // Send the event to the main thread
    self.postMessage({
      type: 'EVENT',
      streamId,
      event: {
        type: event.event || 'message',
        data: parsedData,
        id: event.id,
        timestamp: Date.now(),
      },
    })
  } catch (error) {
    console.error('[Worker] Error processing event:', error)
  }
}

/**
 * Stop a specific stream
 */
function stopStream(streamId) {
  const connection = connections.get(streamId)
  if (connection) {
    connection.active = false
    if (connection.reader) {
      connection.reader.cancel().catch(() => {
        // Ignore cancel errors
      })
    }
    connections.delete(streamId)

    self.postMessage({
      type: 'STATUS',
      streamId,
      status: 'stopped',
    })
  }
}

/**
 * Stop all active streams
 */
function stopAllStreams() {
  for (const streamId of connections.keys()) {
    stopStream(streamId)
  }
}

// Log that the worker is ready
console.log('[Worker] Streaming worker initialized')
