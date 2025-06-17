import React, { useState } from 'react'
import { CheckCircle, XCircle, Loader, AlertCircle } from 'lucide-react'
import { validateOpenAIKey, validateAnthropicKey } from '../services/apiKeyValidator'

interface ApiKeyValidatorProps {
  apiKey: string
  provider: 'openai' | 'anthropic'
  onValidationResult?: (isValid: boolean, cost?: number) => void
}

export function ApiKeyValidator({ apiKey, provider, onValidationResult }: ApiKeyValidatorProps) {
  const [validating, setValidating] = useState(false)
  const [validationResult, setValidationResult] = useState<{
    isValid: boolean
    error?: string
    model?: string
    estimatedCost?: number
  } | null>(null)

  const validateKey = async () => {
    if (!apiKey.trim()) {
      setValidationResult({
        isValid: false,
        error: 'API key is required'
      })
      onValidationResult?.(false)
      return
    }

    setValidating(true)
    setValidationResult(null)

    try {
      const result = provider === 'openai' 
        ? await validateOpenAIKey(apiKey)
        : await validateAnthropicKey(apiKey)
      
      setValidationResult(result)
      onValidationResult?.(result.isValid, result.estimatedCost)
    } catch (error) {
      const errorResult = {
        isValid: false,
        error: 'Validation failed - please try again'
      }
      setValidationResult(errorResult)
      onValidationResult?.(false)
    } finally {
      setValidating(false)
    }
  }

  const getStatusIcon = () => {
    if (validating) {
      return <Loader className="h-4 w-4 animate-spin text-blue-600" />
    }
    
    if (validationResult?.isValid) {
      return <CheckCircle className="h-4 w-4 text-green-600" />
    }
    
    if (validationResult && !validationResult.isValid) {
      return <XCircle className="h-4 w-4 text-red-600" />
    }
    
    return <AlertCircle className="h-4 w-4 text-gray-400" />
  }

  const getStatusMessage = () => {
    if (validating) {
      return 'Validating API key...'
    }
    
    if (validationResult?.isValid) {
      return `✓ Valid ${validationResult.model} access${validationResult.estimatedCost ? ` (~$${validationResult.estimatedCost} per resume)` : ''}`
    }
    
    if (validationResult && !validationResult.isValid) {
      return `✗ ${validationResult.error}`
    }
    
    return 'Click to validate API key'
  }

  const getStatusColor = () => {
    if (validating) return 'text-blue-600'
    if (validationResult?.isValid) return 'text-green-600'
    if (validationResult && !validationResult.isValid) return 'text-red-600'
    return 'text-gray-500'
  }

  return (
    <div className="mt-2">
      <button
        onClick={validateKey}
        disabled={validating || !apiKey.trim()}
        className="flex items-center space-x-2 text-sm px-3 py-1 rounded-md border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {getStatusIcon()}
        <span className={getStatusColor()}>
          {getStatusMessage()}
        </span>
      </button>
    </div>
  )
}