import React, { useEffect, useState } from 'react'
import { DollarSign, Info } from 'lucide-react'
import { calculateEstimatedCost } from '../services/apiKeyValidator'

interface CostEstimatorProps {
  jobDescription: string
  workExperienceCount: number
  aiProvider: 'openai' | 'anthropic'
  isVisible: boolean
}

export function CostEstimator({ 
  jobDescription, 
  workExperienceCount, 
  aiProvider, 
  isVisible 
}: CostEstimatorProps) {
  const [estimatedCost, setEstimatedCost] = useState<number>(0)
  const [showDetails, setShowDetails] = useState(false)

  useEffect(() => {
    if (jobDescription.trim()) {
      const cost = calculateEstimatedCost(
        jobDescription.length,
        workExperienceCount,
        aiProvider
      )
      setEstimatedCost(cost)
    } else {
      setEstimatedCost(0)
    }
  }, [jobDescription, workExperienceCount, aiProvider])

  if (!isVisible || estimatedCost === 0) {
    return null
  }

  const getCostColor = () => {
    if (estimatedCost < 0.10) return 'text-green-600'
    if (estimatedCost < 0.25) return 'text-yellow-600'
    return 'text-orange-600'
  }

  const getCostBadgeColor = () => {
    if (estimatedCost < 0.10) return 'bg-green-100 border-green-200'
    if (estimatedCost < 0.25) return 'bg-yellow-100 border-yellow-200'
    return 'bg-orange-100 border-orange-200'
  }

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-md p-4 mb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <DollarSign className="h-5 w-5 text-blue-600" />
          <span className="text-sm font-medium text-blue-900">
            Estimated Cost
          </span>
          <div className={`px-2 py-1 rounded-md border text-sm font-semibold ${getCostBadgeColor()} ${getCostColor()}`}>
            ${estimatedCost.toFixed(2)}
          </div>
        </div>
        
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="flex items-center space-x-1 text-sm text-blue-600 hover:text-blue-800 transition-colors"
        >
          <Info className="h-4 w-4" />
          <span>{showDetails ? 'Hide' : 'Show'} Details</span>
        </button>
      </div>

      {showDetails && (
        <div className="mt-3 pt-3 border-t border-blue-200">
          <div className="text-sm text-blue-800 space-y-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="font-medium">AI Provider:</span>
                <span className="ml-2 capitalize">{aiProvider}</span>
              </div>
              <div>
                <span className="font-medium">Job Description:</span>
                <span className="ml-2">{jobDescription.length} characters</span>
              </div>
              <div>
                <span className="font-medium">Work Experiences:</span>
                <span className="ml-2">{workExperienceCount} positions</span>
              </div>
              <div>
                <span className="font-medium">Complexity:</span>
                <span className="ml-2">
                  {workExperienceCount <= 2 ? 'Low' : workExperienceCount <= 4 ? 'Medium' : 'High'}
                </span>
              </div>
            </div>
            
            <div className="mt-3 p-2 bg-blue-100 rounded text-xs">
              <p className="font-medium mb-1">Cost Breakdown:</p>
              <ul className="space-y-1">
                <li>• Base cost: ${aiProvider === 'openai' ? '0.15' : '0.12'} (per generation)</li>
                <li>• Length factor: {(jobDescription.length / 1000).toFixed(1)}x</li>
                <li>• Complexity factor: {(workExperienceCount / 5).toFixed(1)}x</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}