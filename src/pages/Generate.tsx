import React, { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { FileText, Download, RefreshCw, Settings, Save } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ResumePreview } from '../components/ResumePreview'
import { CostEstimator } from '../components/CostEstimator'
import { generateResume } from '../services/resumeGenerator'
import { downloadPDF, downloadDocx } from '../services/fileGenerator'

interface GeneratedResume {
  professionalTitle: string
  professionalSummary: string
  workExperiences: Array<{
    company: string
    position: string
    startDate: string
    endDate: string
    isCurrent: boolean
    achievements: string[]
  }>
  technicalSkills: string[]
  personalInfo: {
    name: string
    email: string
    phone: string
    location: string
  }
  educations: Array<{
    university: string
    degree: string
    startDate: string
    endDate: string
  }>
}

export function Generate() {
  const { user } = useAuth()
  const [companyName, setCompanyName] = useState('')
  const [role, setRole] = useState('')
  const [jobDescription, setJobDescription] = useState('')
  const [note, setNote] = useState('')
  const [generatedResume, setGeneratedResume] = useState<GeneratedResume | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [hasProfile, setHasProfile] = useState(false)
  const [hasSettings, setHasSettings] = useState(false)
  const [workExperienceCount, setWorkExperienceCount] = useState(0)
  const [preferredAI, setPreferredAI] = useState<'openai' | 'anthropic'>('openai')
  const [generationCost, setGenerationCost] = useState<number | null>(null)
  const [currentJobHistoryId, setCurrentJobHistoryId] = useState<string | null>(null)
  const [customRoles, setCustomRoles] = useState<{ [key: string]: string }>({})

  useEffect(() => {
    if (user) {
      checkRequirements()
    }
  }, [user])

  const checkRequirements = async () => {
    try {
      // Check if profile exists
      const { data: profileData } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user?.id)
        .single()

      setHasProfile(!!profileData)

      if (profileData) {
        // Get work experience count
        const { data: workData } = await supabase
          .from('work_experiences')
          .select('id')
          .eq('profile_id', profileData.id)

        setWorkExperienceCount(workData?.length || 0)
        
        // Initialize custom roles with current positions
        if (workData && workData.length > 0) {
          const roles: { [key: string]: string } = {}
          workData.forEach((work: any, index: number) => {
            roles[`work_${index}`] = work.position || ''
          })
          setCustomRoles(roles)
        }
      }

      // Check if settings exist
      const { data: settingsData } = await supabase
        .from('user_settings')
        .select('openai_key, anthropic_key, preferred_ai')
        .eq('user_id', user?.id)
        .maybeSingle()

      setHasSettings(!!settingsData?.openai_key || !!settingsData?.anthropic_key)
      if (settingsData?.preferred_ai) {
        setPreferredAI(settingsData.preferred_ai as 'openai' | 'anthropic')
      }
    } catch (error) {
      console.error('Error checking requirements:', error)
    }
  }

  const updateCustomRole = (workIndex: number, newRole: string) => {
    setCustomRoles(prev => ({
      ...prev,
      [`work_${workIndex}`]: newRole
    }))
  }

  const handleGenerate = async () => {
    if (!companyName.trim() || !role.trim() || !jobDescription.trim()) {
      alert('Please fill in company name, role, and job description')
      return
    }

    setLoading(true)
    setGenerationCost(null)
    
    const startTime = Date.now()
    
    try {
      // First, save job history
      const { data: jobHistoryData, error: jobHistoryError } = await supabase
        .from('job_history')
        .insert({
          user_id: user?.id!,
          company_name: companyName,
          role: role,
          job_description: jobDescription,
          note: note.trim() || null
        })
        .select()
        .single()

      if (jobHistoryError) {
        throw new Error(`Failed to save job history: ${jobHistoryError.message}`)
      }

      setCurrentJobHistoryId(jobHistoryData.id)

      // Generate resume
      const resume = await generateResume(jobDescription, user?.id!, customRoles)
      setGeneratedResume(resume)
      
      // Calculate actual generation time and estimate cost
      const endTime = Date.now()
      const generationTime = (endTime - startTime) / 1000 // in seconds
      
      // Estimate cost based on generation time and complexity
      const estimatedCost = calculateActualCost(jobDescription.length, workExperienceCount, preferredAI, generationTime)
      setGenerationCost(estimatedCost)

      // Save resume history
      const { error: resumeHistoryError } = await supabase
        .from('resume_history')
        .insert({
          job_history_id: jobHistoryData.id,
          resume_data: resume,
          generation_cost: estimatedCost,
          ai_provider: preferredAI
        })

      if (resumeHistoryError) {
        console.error('Failed to save resume history:', resumeHistoryError)
        // Don't throw error here as the resume was generated successfully
      }
      
    } catch (error) {
      console.error('Error generating resume:', error)
      alert('Error generating resume. Please check your settings and try again.')
    } finally {
      setLoading(false)
    }
  }

  const calculateActualCost = (
    jobDescriptionLength: number,
    workCount: number,
    aiProvider: 'openai' | 'anthropic',
    generationTime: number
  ): number => {
    // More accurate cost calculation based on actual usage
    const baseCosts = {
      openai: 0.03,    // per 1K tokens input + 0.06 per 1K tokens output
      anthropic: 0.015 // per 1K tokens input + 0.075 per 1K tokens output
    }

    // Estimate tokens used (rough approximation)
    const inputTokens = Math.ceil((jobDescriptionLength + (workCount * 200)) / 4) // ~4 chars per token
    const outputTokens = Math.ceil(2000) // Estimated output tokens for a resume
    
    const inputCost = (inputTokens / 1000) * baseCosts[aiProvider]
    const outputCost = (outputTokens / 1000) * (baseCosts[aiProvider] * 2) // Output typically costs 2x input
    
    return Math.round((inputCost + outputCost) * 100) / 100
  }

  const handleDownloadPDF = async () => {
    if (generatedResume) {
      await downloadPDF(generatedResume)
    }
  }

  const handleDownloadDocx = async () => {
    if (generatedResume) {
      await downloadDocx(generatedResume)
    }
  }

  const handleClearForm = () => {
    setCompanyName('')
    setRole('')
    setJobDescription('')
    setNote('')
    setGeneratedResume(null)
    setGenerationCost(null)
    setCurrentJobHistoryId(null)
    setCustomRoles({})
  }

  if (!hasProfile) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-6 text-center">
          <FileText className="h-12 w-12 text-blue-600 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Complete Your Profile</h2>
          <p className="text-gray-600 mb-6">
            Please complete your profile before generating resumes.
          </p>
          <Link
            to="/profile"
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            Go to Profile
          </Link>
        </div>
      </div>
    )
  }

  if (!hasSettings) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-6 text-center">
          <Settings className="h-12 w-12 text-blue-600 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Configure AI Settings</h2>
          <p className="text-gray-600 mb-6">
            Please add your API key in settings to generate resumes.
          </p>
          <Link
            to="/settings"
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            Go to Settings
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Input Section */}
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex justify-between items-center mb-4">
                <h1 className="text-2xl font-bold text-gray-900">AI Resume Generator</h1>
                <button
                  onClick={handleClearForm}
                  className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
                >
                  Clear Form
                </button>
              </div>
              
              <div className="space-y-4">
                {/* Company Name and Role */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Company Name *
                    </label>
                    <input
                      type="text"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      placeholder="e.g., Google, Microsoft, Apple"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Role *
                    </label>
                    <input
                      type="text"
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      placeholder="e.g., Senior Software Engineer"
                    />
                  </div>
                </div>

                {/* Job Description */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Job Description *
                  </label>
                  <textarea
                    value={jobDescription}
                    onChange={(e) => setJobDescription(e.target.value)}
                    rows={8}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 resize-none"
                    placeholder="Paste the job description here..."
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {jobDescription.length} characters
                  </p>
                </div>

                {/* Note */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Note (Optional)
                  </label>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 resize-none"
                    placeholder="Add any personal notes about this application..."
                  />
                </div>

                {/* Custom Role Mapping */}
                {workExperienceCount > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Customize Roles for This Job Application
                    </label>
                    <div className="space-y-3 bg-blue-50 border border-blue-200 rounded-md p-4">
                      <p className="text-sm text-blue-700 mb-3">
                        Adjust your job titles to better match the requirements of this specific role:
                      </p>
                      {Array.from({ length: workExperienceCount }, (_, index) => (
                        <div key={index} className="flex items-center space-x-3">
                          <span className="text-sm font-medium text-gray-600 w-20">
                            Job {index + 1}:
                          </span>
                          <input
                            type="text"
                            value={customRoles[`work_${index}`] || ''}
                            onChange={(e) => updateCustomRole(index, e.target.value)}
                            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                            placeholder={`Enter role title for position ${index + 1}`}
                          />
                        </div>
                      ))}
                      <p className="text-xs text-blue-600 mt-2">
                        💡 Tip: Use keywords from the job description to make your roles more relevant
                      </p>
                    </div>
                  </div>
                )}

                {/* Cost Estimator */}
                <CostEstimator
                  jobDescription={jobDescription}
                  workExperienceCount={workExperienceCount}
                  aiProvider={preferredAI}
                  isVisible={jobDescription.trim().length > 0}
                />
                
                <button
                  onClick={handleGenerate}
                  disabled={loading || !companyName.trim() || !role.trim() || !jobDescription.trim()}
                  className="w-full flex items-center justify-center space-x-2 px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span>Generating Resume...</span>
                    </>
                  ) : (
                    <>
                      <FileText className="h-4 w-4" />
                      <span>Generate Resume</span>
                    </>
                  )}
                </button>

                {/* Generation Cost Display */}
                {generationCost !== null && (
                  <div className="bg-green-50 border border-green-200 rounded-md p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-green-800">
                        Generation Cost
                      </span>
                      <span className="text-sm font-bold text-green-900">
                        ${generationCost.toFixed(3)}
                      </span>
                    </div>
                    <p className="text-xs text-green-700 mt-1">
                      Using {preferredAI === 'openai' ? 'OpenAI GPT-4' : 'Anthropic Claude'} • Saved to history
                    </p>
                  </div>
                )}
                
                {generatedResume && (
                  <div className="flex space-x-3">
                    <button
                      onClick={handleDownloadPDF}
                      className="flex-1 flex items-center justify-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
                    >
                      <Download className="h-4 w-4" />
                      <span>Download PDF</span>
                    </button>
                    <button
                      onClick={handleDownloadDocx}
                      className="flex-1 flex items-center justify-center space-x-2 px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors"
                    >
                      <Download className="h-4 w-4" />
                      <span>Download DOCX</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Preview Section */}
          <div className="space-y-6">
            {generatedResume ? (
              <ResumePreview resume={generatedResume} />
            ) : (
              <div className="bg-white rounded-lg shadow-md p-8 text-center">
                <FileText className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Resume Preview</h3>
                <p className="text-gray-500">
                  Fill in the company details and job description, then click generate to see your tailored resume
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}