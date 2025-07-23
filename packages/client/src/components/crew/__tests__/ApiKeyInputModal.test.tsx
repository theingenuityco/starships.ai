import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiKeyInputModal } from '../ApiKeyInputModal'
import { ApiKeyRequirement } from '@/types/connector-api-keys'
import { MCPServerOption } from '@/lib/api'

// Mock the validation module
jest.mock('@/lib/api-key-validation', () => ({
  ApiKeyValidator: {
    validate: jest.fn(),
  },
  ServiceType: {},
}))

// Mock Lucide React icons
jest.mock('lucide-react', () => ({
  Key: ({ className }: { className?: string }) => (
    <div data-testid="key-icon" className={className} />
  ),
  Eye: ({ className }: { className?: string }) => (
    <div data-testid="eye-icon" className={className} />
  ),
  EyeOff: ({ className }: { className?: string }) => (
    <div data-testid="eye-off-icon" className={className} />
  ),
  ExternalLink: ({ className }: { className?: string }) => (
    <div data-testid="external-link-icon" className={className} />
  ),
  AlertCircle: ({ className }: { className?: string }) => (
    <div data-testid="alert-circle-icon" className={className} />
  ),
  Loader2: ({ className }: { className?: string }) => (
    <div data-testid="loader-icon" className={className} />
  ),
}))

// Mock utility functions
jest.mock('@/lib/utils', () => ({
  cn: (...classes: string[]) => classes.filter(Boolean).join(' '),
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
  Button: ({
    children,
    onClick,
    disabled,
    type,
    variant,
    size,
    className,
    ...props
  }: {
    children: React.ReactNode
    onClick?: () => void
    disabled?: boolean
    type?: string
    variant?: string
    size?: string
    className?: string
  }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      type={type}
      className={className}
      data-testid={`button-${variant || 'default'}`}
      {...props}
    >
      {children}
    </button>
  ),
}))

jest.mock('@/components/ui/input', () => ({
  Input: ({
    value,
    onChange,
    placeholder,
    type,
    disabled,
    className,
    id,
    ...props
  }: {
    value?: string
    onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void
    placeholder?: string
    type?: string
    disabled?: boolean
    className?: string
    id?: string
  }) => (
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
  Label: ({
    children,
    htmlFor,
    className,
  }: {
    children: React.ReactNode
    htmlFor?: string
    className?: string
  }) => (
    <label htmlFor={htmlFor} className={className} data-testid={`label-${htmlFor}`}>
      {children}
    </label>
  ),
}))

// Import the mocked validation module
import { ApiKeyValidator } from '@/lib/api-key-validation'

const mockApiKeyValidator = ApiKeyValidator as jest.Mocked<typeof ApiKeyValidator>

describe('ApiKeyInputModal', () => {
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
    // Default to valid validation results
    mockApiKeyValidator.validate.mockReturnValue({ isValid: true })
  })

  describe('Rendering', () => {
    it('should render modal when open', () => {
      render(<ApiKeyInputModal {...defaultProps} />)

      expect(screen.getByTestId('dialog')).toBeInTheDocument()
      expect(screen.getByTestId('dialog-title')).toHaveTextContent('Configure GitHub')
      expect(screen.getByTestId('key-icon')).toBeInTheDocument()
    })

    it('should not render modal when closed', () => {
      render(<ApiKeyInputModal {...defaultProps} isOpen={false} />)

      expect(screen.queryByTestId('dialog')).not.toBeInTheDocument()
    })

    it('should render description text', () => {
      render(<ApiKeyInputModal {...defaultProps} />)

      expect(screen.getByTestId('dialog-description')).toHaveTextContent(
        'Enter the required API keys and credentials for GitHub'
      )
    })

    it('should render all requirement fields', () => {
      render(<ApiKeyInputModal {...defaultProps} />)

      expect(screen.getByTestId('label-GITHUB_TOKEN')).toHaveTextContent('GitHub Token')
      expect(screen.getByTestId('input-GITHUB_TOKEN')).toBeInTheDocument()
      expect(screen.getByTestId('label-OPTIONAL_KEY')).toHaveTextContent('Optional Key')
      expect(screen.getByTestId('input-OPTIONAL_KEY')).toBeInTheDocument()
    })

    it('should show required indicator for required fields', () => {
      render(<ApiKeyInputModal {...defaultProps} />)

      expect(screen.getByTestId('label-GITHUB_TOKEN')).toHaveTextContent('*')
      expect(screen.getByTestId('label-OPTIONAL_KEY')).not.toHaveTextContent('*')
    })

    it('should render help links when available', () => {
      render(<ApiKeyInputModal {...defaultProps} />)

      const helpButtons = screen.getAllByText('Help')
      expect(helpButtons).toHaveLength(1) // Only GitHub has help URL
    })

    it('should render password visibility toggle for sensitive fields', () => {
      render(<ApiKeyInputModal {...defaultProps} />)

      // GitHub token is sensitive, should have eye icon
      const githubInput = screen.getByTestId('input-GITHUB_TOKEN')
      expect(githubInput).toHaveAttribute('type', 'password')
      expect(screen.getByTestId('eye-icon')).toBeInTheDocument()

      // Optional key is not sensitive, should not have eye icon
      const optionalInput = screen.getByTestId('input-OPTIONAL_KEY')
      expect(optionalInput).toHaveAttribute('type', 'text')
    })
  })

  describe('Form Interaction', () => {
    it('should update input values when typing', async () => {
      render(<ApiKeyInputModal {...defaultProps} />)

      const githubInput = screen.getByTestId('input-GITHUB_TOKEN')
      await user.type(githubInput, 'ghp_test_token')

      expect(githubInput).toHaveValue('ghp_test_token')
    })

    it('should toggle password visibility', async () => {
      render(<ApiKeyInputModal {...defaultProps} />)

      const githubInput = screen.getByTestId('input-GITHUB_TOKEN')
      const toggleButton = screen.getByTestId('eye-icon').closest('button')

      expect(githubInput).toHaveAttribute('type', 'password')

      await user.click(toggleButton!)

      expect(githubInput).toHaveAttribute('type', 'text')
      expect(screen.getByTestId('eye-off-icon')).toBeInTheDocument()
    })

    it('should open help URL when help button is clicked', async () => {
      const mockOpen = jest.fn()
      Object.defineProperty(window, 'open', { value: mockOpen })

      render(<ApiKeyInputModal {...defaultProps} />)

      const helpButton = screen.getByText('Help')
      await user.click(helpButton)

      expect(mockOpen).toHaveBeenCalledWith('https://github.com/settings/tokens', '_blank')
    })

    it('should validate input in real-time', async () => {
      mockApiKeyValidator.validate.mockReturnValue({
        isValid: false,
        error: 'Invalid token format',
      })

      render(<ApiKeyInputModal {...defaultProps} />)

      const githubInput = screen.getByTestId('input-GITHUB_TOKEN')
      await user.type(githubInput, 'invalid_token')

      expect(mockApiKeyValidator.validate).toHaveBeenCalled()
    })

    it('should display validation errors', async () => {
      mockApiKeyValidator.validate.mockReturnValue({
        isValid: false,
        error: 'GitHub token must start with ghp_',
      })

      render(<ApiKeyInputModal {...defaultProps} />)

      const githubInput = screen.getByTestId('input-GITHUB_TOKEN')
      await user.type(githubInput, 'invalid_token')

      await waitFor(() => {
        expect(screen.getByText('GitHub token must start with ghp_')).toBeInTheDocument()
        expect(screen.getByTestId('alert-circle-icon')).toBeInTheDocument()
      })
    })

    it('should clear submit error when user starts typing', async () => {
      const onSubmit = jest.fn().mockRejectedValue(new Error('Submit failed'))

      render(<ApiKeyInputModal {...defaultProps} onSubmit={onSubmit} />)

      // Fill form and submit to trigger error
      const githubInput = screen.getByTestId('input-GITHUB_TOKEN')
      await user.type(githubInput, 'ghp_valid_token')

      const submitButton = screen.getByTestId('button-default')
      await user.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText('Submit failed')).toBeInTheDocument()
      })

      // Start typing should clear the error
      await user.type(githubInput, 'x')

      await waitFor(() => {
        expect(screen.queryByText('Submit failed')).not.toBeInTheDocument()
      })
    })
  })

  describe('Form Validation', () => {
    it('should disable submit button when form is invalid', () => {
      mockApiKeyValidator.validate.mockReturnValue({
        isValid: false,
        error: 'Invalid input',
      })

      render(<ApiKeyInputModal {...defaultProps} />)

      const submitButton = screen.getByTestId('button-default')
      expect(submitButton).toBeDisabled()
    })

    it('should enable submit button when form is valid', async () => {
      mockApiKeyValidator.validate.mockReturnValue({ isValid: true })

      render(<ApiKeyInputModal {...defaultProps} />)

      const githubInput = screen.getByTestId('input-GITHUB_TOKEN')
      await user.type(githubInput, 'ghp_valid_token')

      await waitFor(() => {
        const submitButton = screen.getByTestId('button-default')
        expect(submitButton).not.toBeDisabled()
      })
    })

    it('should require all required fields to be filled', async () => {
      render(<ApiKeyInputModal {...defaultProps} />)

      // Only fill optional field
      const optionalInput = screen.getByTestId('input-OPTIONAL_KEY')
      await user.type(optionalInput, 'optional_value')

      const submitButton = screen.getByTestId('button-default')
      expect(submitButton).toBeDisabled()

      // Fill required field
      const githubInput = screen.getByTestId('input-GITHUB_TOKEN')
      await user.type(githubInput, 'ghp_valid_token')

      await waitFor(() => {
        expect(submitButton).not.toBeDisabled()
      })
    })
  })

  describe('Form Submission', () => {
    it('should call onSubmit with form values', async () => {
      const onSubmit = jest.fn().mockResolvedValue(undefined)

      render(<ApiKeyInputModal {...defaultProps} onSubmit={onSubmit} />)

      const githubInput = screen.getByTestId('input-GITHUB_TOKEN')
      const optionalInput = screen.getByTestId('input-OPTIONAL_KEY')

      await user.type(githubInput, 'ghp_valid_token')
      await user.type(optionalInput, 'optional_value')

      const submitButton = screen.getByTestId('button-default')
      await user.click(submitButton)

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith({
          GITHUB_TOKEN: 'ghp_valid_token',
          OPTIONAL_KEY: 'optional_value',
        })
      })
    })

    it('should filter out empty optional fields', async () => {
      const onSubmit = jest.fn().mockResolvedValue(undefined)

      render(<ApiKeyInputModal {...defaultProps} onSubmit={onSubmit} />)

      const githubInput = screen.getByTestId('input-GITHUB_TOKEN')
      await user.type(githubInput, 'ghp_valid_token')
      // Leave optional field empty

      const submitButton = screen.getByTestId('button-default')
      await user.click(submitButton)

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith({
          GITHUB_TOKEN: 'ghp_valid_token',
        })
      })
    })

    it('should show loading state during submission', async () => {
      const onSubmit = jest.fn().mockImplementation(() => new Promise(() => {})) // Never resolves

      render(<ApiKeyInputModal {...defaultProps} onSubmit={onSubmit} />)

      const githubInput = screen.getByTestId('input-GITHUB_TOKEN')
      await user.type(githubInput, 'ghp_valid_token')

      const submitButton = screen.getByTestId('button-default')
      await user.click(submitButton)

      await waitFor(() => {
        expect(screen.getByTestId('loader-icon')).toBeInTheDocument()
        expect(screen.getByText('Saving...')).toBeInTheDocument()
        expect(submitButton).toBeDisabled()
      })
    })

    it('should disable all inputs during submission', async () => {
      const onSubmit = jest.fn().mockImplementation(() => new Promise(() => {})) // Never resolves

      render(<ApiKeyInputModal {...defaultProps} onSubmit={onSubmit} />)

      const githubInput = screen.getByTestId('input-GITHUB_TOKEN')
      await user.type(githubInput, 'ghp_valid_token')

      const submitButton = screen.getByTestId('button-default')
      await user.click(submitButton)

      await waitFor(() => {
        expect(githubInput).toBeDisabled()
        expect(screen.getByTestId('input-OPTIONAL_KEY')).toBeDisabled()
      })
    })

    it('should call onClose after successful submission', async () => {
      const onSubmit = jest.fn().mockResolvedValue(undefined)
      const onClose = jest.fn()

      render(<ApiKeyInputModal {...defaultProps} onSubmit={onSubmit} onClose={onClose} />)

      const githubInput = screen.getByTestId('input-GITHUB_TOKEN')
      await user.type(githubInput, 'ghp_valid_token')

      const submitButton = screen.getByTestId('button-default')
      await user.click(submitButton)

      await waitFor(() => {
        expect(onClose).toHaveBeenCalled()
      })
    })

    it('should display error message on submission failure', async () => {
      const onSubmit = jest.fn().mockRejectedValue(new Error('Network error'))

      render(<ApiKeyInputModal {...defaultProps} onSubmit={onSubmit} />)

      const githubInput = screen.getByTestId('input-GITHUB_TOKEN')
      await user.type(githubInput, 'ghp_valid_token')

      const submitButton = screen.getByTestId('button-default')
      await user.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument()
        expect(screen.getByTestId('alert-circle-icon')).toBeInTheDocument()
      })
    })

    it('should prevent submission when already submitting', async () => {
      const onSubmit = jest.fn().mockImplementation(() => new Promise(() => {})) // Never resolves

      render(<ApiKeyInputModal {...defaultProps} onSubmit={onSubmit} />)

      const githubInput = screen.getByTestId('input-GITHUB_TOKEN')
      await user.type(githubInput, 'ghp_valid_token')

      const submitButton = screen.getByTestId('button-default')

      // Click multiple times
      await user.click(submitButton)
      await user.click(submitButton)
      await user.click(submitButton)

      // Should only be called once
      expect(onSubmit).toHaveBeenCalledTimes(1)
    })
  })

  describe('Modal Controls', () => {
    it('should call onClose when cancel button is clicked', async () => {
      const onClose = jest.fn()

      render(<ApiKeyInputModal {...defaultProps} onClose={onClose} />)

      const cancelButton = screen.getByTestId('button-outline')
      await user.click(cancelButton)

      expect(onClose).toHaveBeenCalled()
    })

    it('should prevent closing during submission', async () => {
      const onSubmit = jest.fn().mockImplementation(() => new Promise(() => {})) // Never resolves
      const onClose = jest.fn()

      render(<ApiKeyInputModal {...defaultProps} onSubmit={onSubmit} onClose={onClose} />)

      const githubInput = screen.getByTestId('input-GITHUB_TOKEN')
      await user.type(githubInput, 'ghp_valid_token')

      const submitButton = screen.getByTestId('button-default')
      await user.click(submitButton)

      await waitFor(() => {
        const cancelButton = screen.getByTestId('button-outline')
        expect(cancelButton).toBeDisabled()
      })
    })
  })

  describe('Initial Values', () => {
    it('should populate form with initial values', () => {
      const initialValues = {
        GITHUB_TOKEN: 'ghp_existing_token',
        OPTIONAL_KEY: 'existing_optional',
      }

      render(<ApiKeyInputModal {...defaultProps} initialValues={initialValues} />)

      expect(screen.getByTestId('input-GITHUB_TOKEN')).toHaveValue('ghp_existing_token')
      expect(screen.getByTestId('input-OPTIONAL_KEY')).toHaveValue('existing_optional')
    })

    it('should reset form when modal opens', async () => {
      const initialValues = {
        GITHUB_TOKEN: 'ghp_initial_token',
      }

      const { rerender } = render(
        <ApiKeyInputModal {...defaultProps} isOpen={false} initialValues={initialValues} />
      )

      // Open modal and modify input
      rerender(<ApiKeyInputModal {...defaultProps} isOpen={true} initialValues={initialValues} />)

      const githubInput = screen.getByTestId('input-GITHUB_TOKEN')
      await user.clear(githubInput)
      await user.type(githubInput, 'modified_token')

      expect(githubInput).toHaveValue('modified_token')

      // Close and reopen modal
      rerender(<ApiKeyInputModal {...defaultProps} isOpen={false} initialValues={initialValues} />)
      rerender(<ApiKeyInputModal {...defaultProps} isOpen={true} initialValues={initialValues} />)

      // Should reset to initial value
      expect(screen.getByTestId('input-GITHUB_TOKEN')).toHaveValue('ghp_initial_token')
    })
  })

  describe('Accessibility', () => {
    it('should have proper form structure', () => {
      render(<ApiKeyInputModal {...defaultProps} />)

      const form = screen.getByRole('form')
      expect(form).toBeInTheDocument()
    })

    it('should associate labels with inputs', () => {
      render(<ApiKeyInputModal {...defaultProps} />)

      const githubLabel = screen.getByTestId('label-GITHUB_TOKEN')
      const githubInput = screen.getByTestId('input-GITHUB_TOKEN')

      expect(githubLabel).toHaveAttribute('for', 'GITHUB_TOKEN')
      expect(githubInput).toHaveAttribute('id', 'GITHUB_TOKEN')
    })

    it('should have proper button labels', () => {
      render(<ApiKeyInputModal {...defaultProps} />)

      expect(screen.getByText('Cancel')).toBeInTheDocument()
      expect(screen.getByText('Save Configuration')).toBeInTheDocument()
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty requirements array', () => {
      render(<ApiKeyInputModal {...defaultProps} requirements={[]} />)

      expect(screen.getByTestId('dialog')).toBeInTheDocument()
      expect(screen.queryByTestId('input-GITHUB_TOKEN')).not.toBeInTheDocument()
    })

    it('should handle requirements without help URLs', () => {
      const requirementsWithoutHelp = mockRequirements.map(req => ({
        ...req,
        helpUrl: undefined,
      }))

      render(<ApiKeyInputModal {...defaultProps} requirements={requirementsWithoutHelp} />)

      expect(screen.queryByText('Help')).not.toBeInTheDocument()
    })

    it('should handle very long connector names', () => {
      const longNameConnector = {
        ...mockConnector,
        name: 'Very Long Connector Name That Might Cause Layout Issues',
      }

      render(<ApiKeyInputModal {...defaultProps} connector={longNameConnector} />)

      expect(screen.getByTestId('dialog-title')).toHaveTextContent(
        'Configure Very Long Connector Name That Might Cause Layout Issues'
      )
    })

    it('should handle special characters in field values', async () => {
      const onSubmit = jest.fn().mockResolvedValue(undefined)

      render(<ApiKeyInputModal {...defaultProps} onSubmit={onSubmit} />)

      const githubInput = screen.getByTestId('input-GITHUB_TOKEN')
      await user.type(githubInput, 'ghp_token_with_special_chars_!@#$%')

      const submitButton = screen.getByTestId('button-default')
      await user.click(submitButton)

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith({
          GITHUB_TOKEN: 'ghp_token_with_special_chars_!@#$%',
        })
      })
    })
  })
})
