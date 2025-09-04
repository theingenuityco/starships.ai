'use client'

export default function GlobalError() {
  return (
    <html>
      <body>
        <div
          style={{
            display: 'flex',
            minHeight: '100vh',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}
        >
          <h2 style={{ fontSize: '24px', fontWeight: '600', marginBottom: '16px' }}>
            Something went wrong!
          </h2>
          <button
            onClick={() => {
              // Clear all caches and reload
              if ('caches' in window) {
                caches.keys().then(names => {
                  names.forEach(name => {
                    caches.delete(name)
                  })
                })
              }
              window.location.href = '/'
            }}
            style={{
              padding: '8px 16px',
              backgroundColor: '#000',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Reload Application
          </button>
        </div>
      </body>
    </html>
  )
}
