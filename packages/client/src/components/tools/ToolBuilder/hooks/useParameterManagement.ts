// This hook is no longer needed with the simplified JSON editor approach
// Keeping it as a stub for backwards compatibility, but all logic removed

interface UseParameterManagementProps {
  parametersJSON: string
  onParametersChange: (json: string) => void
}

export const useParameterManagement = ({ parametersJSON, onParametersChange }: UseParameterManagementProps) => {
  // Return the raw JSON and change handler
  // No complex parameter management needed anymore
  return {
    parametersJSON,
    onParametersChange,
  }
}
