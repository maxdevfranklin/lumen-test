interface ValidationResult {
  isValid: boolean
  error?: string
  model?: string
  estimatedCost?: number
}

export async function validateOpenAIKey(apiKey: string): Promise<ValidationResult> {
  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    })

    if (response.ok) {
      const data = await response.json()
      const hasGPT4 = data.data.some((model: any) => model.id.includes('gpt-4'))
      return {
        isValid: true,
        model: hasGPT4 ? 'GPT-4' : 'GPT-3.5',
        estimatedCost: hasGPT4 ? 0.15 : 0.05
      }
    } else {
      const errorData = await response.json().catch(() => ({}))
      return {
        isValid: false,
        error: errorData.error?.message || `Invalid API key (${response.status})`
      }
    }
  } catch (error) {
    return {
      isValid: false,
      error: 'Network error - please check your connection'
    }
  }
}

export async function validateAnthropicKey(apiKey: string): Promise<ValidationResult> {
  try {
    // Use a simpler endpoint that doesn't require a full message
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307', // Use cheaper model for validation
        max_tokens: 1,
        messages: [
          {
            role: 'user',
            content: 'Hi'
          }
        ]
      })
    })

    if (response.ok) {
      return {
        isValid: true,
        model: 'Claude-3',
        estimatedCost: 0.12
      }
    } else {
      const errorText = await response.text().catch(() => '')
      let errorMessage = 'Invalid API key'
      
      if (response.status === 401) {
        errorMessage = 'Invalid API key - please check your key'
      } else if (response.status === 429) {
        errorMessage = 'Rate limit exceeded - key is valid but quota reached'
      } else if (response.status === 400) {
        // For validation, a 400 might still mean the key is valid but request format is wrong
        // Let's try to parse the error to see if it's about the key or the request
        try {
          const errorData = JSON.parse(errorText)
          if (errorData.error?.type === 'authentication_error') {
            errorMessage = 'Invalid API key'
          } else {
            // If it's not an auth error, the key might be valid
            return {
              isValid: true,
              model: 'Claude-3',
              estimatedCost: 0.12
            }
          }
        } catch {
          errorMessage = `Validation error (${response.status})`
        }
      }
      
      return {
        isValid: false,
        error: errorMessage
      }
    }
  } catch (error) {
    return {
      isValid: false,
      error: 'Network error - please check your connection'
    }
  }
}

export function calculateEstimatedCost(
  jobDescriptionLength: number,
  profileComplexity: number,
  aiProvider: 'openai' | 'anthropic'
): number {
  const baseCosts = {
    openai: 0.15,
    anthropic: 0.12
  }

  const lengthMultiplier = Math.max(1, jobDescriptionLength / 1000)
  const complexityMultiplier = Math.max(1, profileComplexity / 5)

  const baseCost = baseCosts[aiProvider]
  const estimatedCost = baseCost * lengthMultiplier * complexityMultiplier

  return Math.round(estimatedCost * 100) / 100
}