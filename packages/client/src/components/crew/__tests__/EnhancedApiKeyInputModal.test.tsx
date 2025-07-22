import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EnhancedApiKeyInputModal } from '../EnhancedApiKeyInputModal'
import { ApiKeyRequirement } from '@/types/connector-api-keys'
import { MCPServerOption } from '@/lib/api'

// Mock the error recovery module
jest.mock('@/lib/error-recovery', () => ({
  useErrorRecovery: () => ({
    handleError: jest.fn(),
    withRetry: jest.fn(fn => fn()),
    getUserFriendlyMessage: jest.fn(() => 'Test error message'),
    getRecoveryGuidance: jest.fn(() => 'Test guidance'),
  }),
  ErrorRecoveryManager: {
    createContext: jest.fn(() => ({ operation: 'test', component: 'test', timestamp: new Date() })),
    enhanceError: jest.fn(error => ({ ...error, recoveryActions: [] })),
    logError: jest.fn(),
  },
}))

// Mock the error boundary
jest.mock('@/components/ui/error-boundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useErrorHandler: () => ({
    error: null,
    hasError: false,
    handleError: jest.fn(),
    clearError: jest.fn(),
  }),
}))

// Mock loading states
jest.mock('@/components/ui/loading-states', () => ({
  LoadingOverlay: ({ children, isLoading }: { children: React.ReactNode; isLoading: boolean }) => (
    <div>
      {isLoading && <div data-testid="loading-overlay">Loading...</div>}
      {children}
    </div>
  ),
  ApiKeyValidationLoading: ({ keyName }: { keyName: string }) => (
    <div data-testid="validation-loading">Validating {keyName}...</div>
  ),
  MultiStepLoading: ({ steps }: { steps: any[] }) => (
    <div data-testid="multi-step-loading">
      {steps.map((step, i) => (
        <div key={i}>
          {step.label}: {step.status}
        </div>
      ))}
    </div>
  ),
  InlineLoading: ({ message }: { message?: string }) => (
    <div data-testid="inline-loading">{message || 'Loading...'}</div>
  ),
}))

// Mock validation
jest.mock('@/lib/api-key-validation', () => ({
  ApiKeyValidator: {
    validate: jest.fn(() => ({ isValid: true })),
  },
}))

// Mock UI components
jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dialog-content">{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dialog-header">{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <h2 data-testid="dialog-title">{children}</h2>
  ),
  DialogDescription: ({ children }: { children: React.ReactNode }) => (
    <p data-testid="dialog-description">{children}</p>
  ),
  DialogFooter: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dialog-footer">{children}</div>
  ),
}))

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, type, className, ...props }: any) => (
    <button
      onClick={onClick}
      disabled={disabled}
      type={type}
      className={className}
      data-testid="button"
      {...props}
    >
      {children}
    </button>
  ),
}))

jest.mock('@/components/ui/input', () => ({
  Input: ({ value, onChange, placeholder, type, disabled, className, id, ...props }: any) => (
    <input
      id={id}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      type={type}
      disabled={disabled}
      className={className}
      data-testid={`input-${id || 'default'}`}
      {...props}
    />
  ),
}))

jest.mock('@/components/ui/label', () => ({
  Label: ({ children, htmlFor, className }: any) => (
    <label htmlFor={htmlFor} className={className} data-testid={`label-${htmlFor}`}>
      {children}
    </label>
  ),
}))

jest.mock('@/components/ui/card', () => ({
  Card: ({ children, className }: any) => (
    <div className={className} data-testid="card">
      {children}
    </div>
  ),
  CardContent: ({ children, className }: any) => (
    <div className={className} data-testid="card-content">
      {children}
    </div>
  ),
  CardHeader: ({ children }: any) => <div data-testid="card-header">{children}</div>,
  CardTitle: ({ children }: any) => <h3 data-testid="card-title">{children}</h3>,
  CardDescription: ({ children }: any) => <p data-testid="card-description">{children}</p>,
}))

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, variant, className }: any) => (
    <span className={className} data-testid={`badge-${variant || 'default'}`}>
      {children}
    </span>
  ),
}))

jest.mock('@/components/ui/separator', () => ({
  Separator: () => <hr data-testid="separator" />,
}))

jest.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: any) => <div>{children}</div>,
  Tooltip: ({ children }: any) => <div>{children}</div>,
  TooltipTrigger: ({ children }: any) => <div>{children}</div>,
  TooltipContent: ({ children }: any) => <div data-testid="tooltip-content">{children}</div>,
}))

// Mock Lucide icons
jest.mock('lucide-react', () => ({
  Key: () => <div data-testid="key-icon" />,
  Eye: () => <div data-testid="eye-icon" />,
  EyeOff: () => <div data-testid="eye-off-icon" />,
  Loader2: () => <div data-testid="loader-icon" />,
  CheckCircle: () => <div data-testid="check-circle-icon" />,
  AlertCircle: () => <div data-testid="alert-circle-icon" />,
  AlertTriangle: () => <div data-testid="alert-triangle-icon" />,
  RefreshCw: () => <div data-testid="refresh-icon" />,
  HelpCircle: () => <div data-testid="help-circle-icon" />,
  Copy: () => <div data-testid="copy-icon" />,
  Check: () => <div data-testid="check-icon" />,
  Info: () => <div data-testid="info-icon" />,
}))

jest.mock('@/lib/utils', () => ({
  cn: (...classes: string[]) => classes.filter(Boolean).join(' '),
}))

describe('EnhancedApiKeyInputModal', () => {
  const user = userEvent.setup()

  const mockConnector: MCPServerOption = {
    id: 'github-connector',
    name: 'GitHub',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    env: '{"GITHUB_TOKEN": "${GITHUB_TOKEN}"}',
  }

  const mockRequirements: ApiKeyRequirement[] = [
    {
      envKey: 'GITHUB_TOKEN',
      displayName: 'GitHub Token',
      type: 'token',
      placeholder: 'Enter your GitHub token',
      required: true,
      sensitive: true,
      validation: /^gh[pous]_[A-Za-z0-9]{36}$/,
      helpUrl: 'https://github.com/settings/tokens',
    },
    {
      envKey: 'OPTIONAL_KEY',
      displayName: 'Optional Key',
      type: 'api_key',
      placeholder: 'Enter optional key',
      required: false,
      sensitive: false,
    },
  ]

  const defaultProps = {
    isOpen: true,
    onClose: jest.fn(),
    onSubmit: jest.fn(),
    connector: mockConnector,
    requirements: mockRequirements,
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Enhanced Features', () => {
    it('should render with progress tracking when enabled', () => {
      render(<EnhancedApiKeyInputModal {...defaultProps} showProgress={true} />)

      expect(screen.getByTestId('multi-step-loading')).toBeInTheDocument()
      expect(screen.getByText(/Setup Progress/)).toBeInTheDocument()
    })

    it('should show auto-save status when enabled', () => {
      render(<EnhancedApiKeyInputModal {...defaultProps} enableAutoSave={true} />)

      expect(screen.getByText(/Auto-save enabled/)).toBeInTheDocument()
    })

    it('should render field actions (copy, help, visibility toggle)', () => {
      render(<EnhancedApiKeyInputModal {...defaultProps} />)

      // Help button for GitHub token (has helpUrl)
      expect(screen.getByTestId('help-circle-icon')).toBeInTheDocument()

      // Visibility toggle for sensitive field
      expect(screen.getByTestId('eye-icon')).toBeInTheDocument()
    })

    it('should show validation loading state', async () => {
      const { ApiKeyValidator } = require('@/lib/api-key-validation')
      ApiKeyValidator.validate.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve({ isValid: true }), 100))
      )

      render(<EnhancedApiKeyInputModal {...defaultProps} validationMode="realtime" />)

      const input = screen.getByTestId('input-GITHUB_TOKEN')
      await user.type(input, 'test')

      expect(screen.getByTestId('validation-loading')).toBeInTheDocument()
    })

    it('should display success state for valid fields', async () => {
      const { ApiKeyValidator } = require('@/lib/api-key-validation')
      ApiKeyValidator.validate.mockReturnValue({ isValid: true })

      render(<EnhancedApiKeyInputModal {...defaultProps} />)

      const input = screen.getByTestId('input-GITHUB_TOKEN')
      await user.type(input, '[GITHUB-PAT]7890')

      await waitFor(() => {
        expect(screen.getByTestId('check-circle-icon')).toBeInTheDocument()
        expect(screen.getByText(/Valid github token/)).toBeInTheDocument()
      })
    })

    it('should show enhanced error display with recovery actions', async () => {
      const onSubmit = jest.fn().mockRejectedValue(new Error('Network error'))

      render(<EnhancedApiKeyInputModal {...defaultProps} onSubmit={onSubmit} />)

      const input = screen.getByTestId('input-GITHUB_TOKEN')
      await user.type(input, '[GITHUB-PAT]7890')

      const submitButton = screen.getByText('Save Configuration')
      await user.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText(/Configuration Failed/)).toBeInTheDocument()
        expect(screen.getByTestId('alert-triangle-icon')).toBeInTheDocument()
      })
    })

    it('should handle copy to clipboard functionality', async () => {
      // Mock clipboard API
      Object.assign(navigator, {
        clipboard: {
          writeText: jest.fn().mockResolvedValue(undefined),
        },
      })

      render(<EnhancedApiKeyInputModal {...defaultProps} />)

      const input = screen.getByTestId('input-GITHUB_TOKEN')
      await user.type(input, 'test-value')

      const copyButton = screen.getByTestId('copy-icon').closest('button')
      await user.click(copyButton!)

      await waitFor(() => {
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith('test-value')
        expect(screen.getByTestId('check-icon')).toBeInTheDocument()
      })
    })

    it('should show loading overlay during submission', async () => {
      const onSubmit = jest.fn().mockImplementation(() => new Promise(() => {})) // Never resolves

      render(<EnhancedApiKeyInputModal {...defaultProps} onSubmit={onSubmit} />)

      const input = screen.getByTestId('input-GITHUB_TOKEN')
      await user.type(input, '[GITHUB-PAT]7890')

      const submitButton = screen.getByText('Save Configuration')
      await user.click(submitButton)

      await waitFor(() => {
        expect(screen.getByTestId('loading-overlay')).toBeInTheDocument()
        expect(screen.getByText('Saving configuration...')).toBeInTheDocument()
      })
    })

    it('should track form progress correctly', async () => {
      render(<EnhancedApiKeyInputModal {...defaultProps} showProgress={true} />)

      // Initially no fields completed
      expect(screen.getByText('0/2 fields completed')).toBeInTheDocument()

      // Fill first field
      const input1 = screen.getByTestId('input-GITHUB_TOKEN')
      await user.type(input1, '[GITHUB-PAT]7890')

      await waitFor(() => {
        expect(screen.getByText('1/2 fields completed')).toBeInTheDocument()
      })

      // Fill second field
      const input2 = screen.getByTestId('input-OPTIONAL_KEY')
      await user.type(input2, 'optional-value')

      await waitFor(() => {
        expect(screen.getByText('2/2 fields completed')).toBeInTheDocument()
      })
    })

    it('should handle different validation modes', async () => {
      const { ApiKeyValidator } = require('@/lib/api-key-validation')
      const validateSpy = jest.spyOn(ApiKeyValidator, 'validate')

      render(<EnhancedApiKeyInputModal {...defaultProps} validationMode="onblur" />)

      const input = screen.getByTestId('input-GITHUB_TOKEN')
      await user.type(input, 'test')

      // Should not validate on type in onblur mode
      expect(validateSpy).not.toHaveBeenCalled()

      // Should validate on blur
      await user.tab()
      expect(validateSpy).toHaveBeenCalled()
    })

    it('should show field hints for file and directory paths', () => {
      const filePathRequirement: ApiKeyRequirement = {
        envKey: 'FILE_PATH',
        displayName: 'File Path',
        type: 'file_path',
        placeholder: 'Enter file path',
        required: true,
        sensitive: false,
      }

      render(<EnhancedApiKeyInputModal {...defaultProps} requirements={[filePathRequirement]} />)

      expect(screen.getByText(/Enter the full path to the file/)).toBeInTheDocument()
      expect(screen.getByTestId('info-icon')).toBeInTheDocument()
    })
  })

  describe('Error Recovery', () => {
    it('should provide retry functionality on submission failure', async () => {
      const onSubmit = jest
        .fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(undefined)

      render(<EnhancedApiKeyInputModal {...defaultProps} onSubmit={onSubmit} />)

      const input = screen.getByTestId('input-GITHUB_TOKEN')
      await user.type(input, '[GITHUB-PAT]7890')

      const submitButton = screen.getByText('Save Configuration')
      await user.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText(/Configuration Failed/)).toBeInTheDocument()
      })

      // Click retry button
      const retryButton = screen.getByText('Try Again')
      await user.click(retryButton)

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledTimes(2)
      })
    })

    it('should focus first invalid field on validation error', async () => {
      const { ApiKeyValidator } = require('@/lib/api-key-validation')
      ApiKeyValidator.validate.mockReturnValue({
        isValid: false,
        error: 'Invalid format',
      })

      render(<EnhancedApiKeyInputModal {...defaultProps} validationMode="onsubmit" />)

      const submitButton = screen.getByText('Save Configuration')
      await user.click(submitButton)

      await waitFor(() => {
        const firstInput = screen.getByTestId('input-GITHUB_TOKEN')
        expect(firstInput).toHaveFocus()
      })
    })
  })

  describe('Accessibility', () => {
    it('should have proper ARIA attributes', () => {
      render(<EnhancedApiKeyInputModal {...defaultProps} />)

      const input = screen.getByTestId('input-GITHUB_TOKEN')
      expect(input).toHaveAttribute('aria-describedby', 'GITHUB_TOKEN-description')
      expect(input).toHaveAttribute('aria-invalid', 'false')
    })

    it('should update ARIA attributes on validation error', async () => {
      const { ApiKeyValidator } = require('@/lib/api-key-validation')
      ApiKeyValidator.validate.mockReturnValue({
        isValid: false,
        error: 'Invalid format',
      })

      render(<EnhancedApiKeyInputModal {...defaultProps} />)

      const input = screen.getByTestId('input-GITHUB_TOKEN')
      await user.type(input, 'invalid')

      await waitFor(() => {
        expect(input).toHaveAttribute('aria-invalid', 'true')
      })
    })
  })

  describe('Performance', () => {
    it('should debounce validation calls', async () => {
      const { ApiKeyValidator } = require('@/lib/api-key-validation')
      const validateSpy = jest.spyOn(ApiKeyValidator, 'validate')

      render(<EnhancedApiKeyInputModal {...defaultProps} validationMode="realtime" />)

      const input = screen.getByTestId('input-GITHUB_TOKEN')

      // Type multiple characters quickly
      await user.type(input, 'test', { delay: 50 })

      // Should not validate for each character
      expect(validateSpy.mock.calls.length).toBeLessThan(4)
    })
  })
})
