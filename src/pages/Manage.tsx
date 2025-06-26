import React, { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { 
  Users, 
  Search, 
  Download, 
  Calendar, 
  Building, 
  Briefcase, 
  FileText, 
  User,
  GraduationCap,
  MapPin,
  Mail,
  Phone,
  Shield,
  AlertCircle,
  Eye,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  DollarSign,
  Clock
} from 'lucide-react'
import { downloadPDF, downloadDocx } from '../services/fileGenerator'

interface UserProfile {
  id: string
  user_id: string
  name: string
  email: string
  phone: string
  location: string
  created_at: string
  work_experience_count: number
  education_count: number
  job_application_count: number
  resume_count: number
}

interface WorkExperience {
  id: string
  company: string
  position: string
  start_date: string
  end_date: string
  is_current: boolean
  created_at: string
}

interface Education {
  id: string
  university: string
  degree: string
  start_date: string
  end_date: string
  created_at: string
}

interface JobHistory {
  id: string
  company_name: string
  role: string
  job_description: string
  note: string | null
  created_at: string
  resume_history: {
    id: string
    resume_data: any
    generation_cost: number | null
    ai_provider: string
    created_at: string
  }[]
}

interface UserSettings {
  openai_key: string | null
  anthropic_key: string | null
  preferred_ai: string
  created_at: string
  updated_at: string
}

export function Manage() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<UserProfile[]>([])
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null)
  const [userDetails, setUserDetails] = useState<{
    workExperiences: WorkExperience[]
    educations: Education[]
    jobHistory: JobHistory[]
    settings: UserSettings | null
  } | null>(null)
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set())

  // Check if current user is admin
  const isAdmin = user?.email === 'max.franklin.tech@gmail.com'

  useEffect(() => {
    if (user && isAdmin) {
      loadUsers()
    } else {
      setLoading(false)
    }
  }, [user, isAdmin])

  const loadUsers = async () => {
    try {
      setError(null)
      
      // Get all profiles
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })

      if (profilesError) {
        throw profilesError
      }

      if (!profiles || profiles.length === 0) {
        setUsers([])
        setLoading(false)
        return
      }

      // Get counts for each user
      const profileIds = profiles.map(p => p.id)
      const userIds = profiles.map(p => p.user_id)

      const [workData, eduData, jobData, resumeData] = await Promise.all([
        supabase.from('work_experiences').select('profile_id').in('profile_id', profileIds),
        supabase.from('educations').select('profile_id').in('profile_id', profileIds),
        supabase.from('job_history').select('user_id').in('user_id', userIds),
        supabase.from('resume_history').select('job_history_id, job_history!inner(user_id)').in('job_history.user_id', userIds)
      ])

      // Count occurrences
      const workCounts = new Map<string, number>()
      const eduCounts = new Map<string, number>()
      const jobCounts = new Map<string, number>()
      const resumeCounts = new Map<string, number>()

      workData.data?.forEach(item => {
        workCounts.set(item.profile_id, (workCounts.get(item.profile_id) || 0) + 1)
      })

      eduData.data?.forEach(item => {
        eduCounts.set(item.profile_id, (eduCounts.get(item.profile_id) || 0) + 1)
      })

      jobData.data?.forEach(item => {
        jobCounts.set(item.user_id, (jobCounts.get(item.user_id) || 0) + 1)
      })

      resumeData.data?.forEach(item => {
        const userId = (item.job_history as any).user_id
        resumeCounts.set(userId, (resumeCounts.get(userId) || 0) + 1)
      })

      // Combine data
      const usersWithCounts: UserProfile[] = profiles.map(profile => ({
        ...profile,
        work_experience_count: workCounts.get(profile.id) || 0,
        education_count: eduCounts.get(profile.id) || 0,
        job_application_count: jobCounts.get(profile.user_id) || 0,
        resume_count: resumeCounts.get(profile.user_id) || 0
      }))

      setUsers(usersWithCounts)
    } catch (error) {
      console.error('Error loading users:', error)
      setError('Failed to load users')
    } finally {
      setLoading(false)
    }
  }

  const loadUserDetails = async (selectedUser: UserProfile) => {
    setLoadingDetails(true)
    try {
      const [workResponse, eduResponse, jobResponse, settingsResponse] = await Promise.all([
        supabase
          .from('work_experiences')
          .select('*')
          .eq('profile_id', selectedUser.id)
          .order('start_date', { ascending: false }),
        supabase
          .from('educations')
          .select('*')
          .eq('profile_id', selectedUser.id)
          .order('start_date', { ascending: false }),
        supabase
          .from('job_history')
          .select(`
            *,
            resume_history(*)
          `)
          .eq('user_id', selectedUser.user_id)
          .order('created_at', { ascending: false }),
        supabase
          .from('user_settings')
          .select('*')
          .eq('user_id', selectedUser.user_id)
          .maybeSingle()
      ])

      setUserDetails({
        workExperiences: workResponse.data || [],
        educations: eduResponse.data || [],
        jobHistory: jobResponse.data || [],
        settings: settingsResponse.data
      })
    } catch (error) {
      console.error('Error loading user details:', error)
      setError('Failed to load user details')
    } finally {
      setLoadingDetails(false)
    }
  }

  const handleUserSelect = (user: UserProfile) => {
    setSelectedUser(user)
    setExpandedJobs(new Set()) // Reset expanded jobs when selecting new user
    loadUserDetails(user)
  }

  const handleDownloadResume = async (resumeData: any, format: 'pdf' | 'docx', companyName: string, role: string) => {
    try {
      if (format === 'pdf') {
        await downloadPDF(resumeData)
      } else {
        await downloadDocx(resumeData)
      }
    } catch (error) {
      console.error('Error downloading resume:', error)
      alert('Error downloading resume. Please try again.')
    }
  }

  const toggleJobExpansion = (jobId: string) => {
    const newExpanded = new Set(expandedJobs)
    if (newExpanded.has(jobId)) {
      newExpanded.delete(jobId)
    } else {
      newExpanded.add(jobId)
    }
    setExpandedJobs(newExpanded)
  }

  const filteredUsers = users.filter(user =>
    user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const calculateTotalCost = (jobHistory: JobHistory[]) => {
    return jobHistory.reduce((total, job) => {
      return total + job.resume_history.reduce((jobTotal, resume) => {
        return jobTotal + (resume.generation_cost || 0)
      }, 0)
    }, 0)
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Shield className="h-12 w-12 text-red-600 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Authentication Required</h2>
          <p className="text-gray-600">Please sign in to access this page.</p>
        </div>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-6 text-center">
          <Shield className="h-12 w-12 text-red-600 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Access Denied</h2>
          <p className="text-gray-600 mb-4">
            This page is restricted to administrators only.
          </p>
          <p className="text-sm text-gray-500">
            Contact your administrator if you believe this is an error.
          </p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading users...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Users List */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-md">
              <div className="px-4 py-3 border-b border-gray-200">
                <div className="flex items-center justify-between mb-3">
                  <h1 className="text-lg font-bold text-gray-900 flex items-center">
                    <Users className="h-5 w-5 mr-2" />
                    User Management
                  </h1>
                  <span className="text-sm text-gray-500">
                    {filteredUsers.length} users
                  </span>
                </div>
                
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Search users..."
                  />
                </div>
              </div>

              <div className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
                {error && (
                  <div className="p-4 bg-red-50 border-l-4 border-red-400">
                    <div className="flex">
                      <AlertCircle className="h-5 w-5 text-red-400" />
                      <div className="ml-3">
                        <p className="text-sm text-red-700">{error}</p>
                      </div>
                    </div>
                  </div>
                )}

                {filteredUsers.length === 0 ? (
                  <div className="p-8 text-center">
                    <Users className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                    <h3 className="text-sm font-medium text-gray-900 mb-2">No Users Found</h3>
                    <p className="text-sm text-gray-500">
                      {searchTerm ? 'Try adjusting your search criteria' : 'No users have registered yet'}
                    </p>
                  </div>
                ) : (
                  filteredUsers.map((user) => (
                    <div
                      key={user.id}
                      onClick={() => handleUserSelect(user)}
                      className={`p-4 cursor-pointer hover:bg-gray-50 transition-colors ${
                        selectedUser?.id === user.id ? 'bg-blue-50 border-r-2 border-blue-500' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2 mb-1">
                            <User className="h-4 w-4 text-gray-400" />
                            <span className="font-medium text-gray-900 truncate">{user.name}</span>
                          </div>
                          <p className="text-sm text-gray-600 truncate">{user.email}</p>
                          <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
                            <span>{user.work_experience_count} jobs</span>
                            <span>{user.education_count} edu</span>
                            <span className="font-medium text-blue-600">{user.resume_count} resumes</span>
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-gray-400" />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* User Details */}
          <div className="lg:col-span-2">
            {selectedUser ? (
              <div className="space-y-6">
                {/* User Profile Card */}
                <div className="bg-white rounded-lg shadow-md p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h2 className="text-xl font-bold text-gray-900">{selectedUser.name}</h2>
                      <p className="text-gray-600">{selectedUser.email}</p>
                    </div>
                    <span className="text-sm text-gray-500">
                      Joined {formatDate(selectedUser.created_at)}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div className="text-center p-3 bg-blue-50 rounded-lg">
                      <Briefcase className="h-6 w-6 text-blue-600 mx-auto mb-1" />
                      <div className="text-lg font-semibold text-blue-900">{selectedUser.work_experience_count}</div>
                      <div className="text-xs text-blue-700">Work Experience</div>
                    </div>
                    <div className="text-center p-3 bg-green-50 rounded-lg">
                      <GraduationCap className="h-6 w-6 text-green-600 mx-auto mb-1" />
                      <div className="text-lg font-semibold text-green-900">{selectedUser.education_count}</div>
                      <div className="text-xs text-green-700">Education</div>
                    </div>
                    <div className="text-center p-3 bg-purple-50 rounded-lg">
                      <Building className="h-6 w-6 text-purple-600 mx-auto mb-1" />
                      <div className="text-lg font-semibold text-purple-900">{selectedUser.job_application_count}</div>
                      <div className="text-xs text-purple-700">Applications</div>
                    </div>
                    <div className="text-center p-3 bg-orange-50 rounded-lg">
                      <FileText className="h-6 w-6 text-orange-600 mx-auto mb-1" />
                      <div className="text-lg font-semibold text-orange-900">{selectedUser.resume_count}</div>
                      <div className="text-xs text-orange-700">Resumes</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div className="flex items-center space-x-2">
                      <Phone className="h-4 w-4 text-gray-400" />
                      <span>{selectedUser.phone}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <MapPin className="h-4 w-4 text-gray-400" />
                      <span>{selectedUser.location}</span>
                    </div>
                  </div>
                </div>

                {loadingDetails ? (
                  <div className="bg-white rounded-lg shadow-md p-8 text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3"></div>
                    <p className="text-gray-600">Loading user details...</p>
                  </div>
                ) : userDetails ? (
                  <>
                    {/* Job Applications & Resume History - MAIN FOCUS */}
                    <div className="bg-white rounded-lg shadow-md p-6">
                      <div className="flex items-center justify-between mb-6">
                        <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                          <FileText className="h-5 w-5 mr-2" />
                          Job Applications & Resume History
                        </h3>
                        {userDetails.jobHistory.length > 0 && (
                          <div className="flex items-center space-x-4 text-sm">
                            <div className="flex items-center space-x-1">
                              <DollarSign className="h-4 w-4 text-green-600" />
                              <span className="text-green-700 font-medium">
                                ${calculateTotalCost(userDetails.jobHistory).toFixed(2)} total cost
                              </span>
                            </div>
                            <div className="flex items-center space-x-1">
                              <Clock className="h-4 w-4 text-blue-600" />
                              <span className="text-blue-700 font-medium">
                                {userDetails.jobHistory.length} applications
                              </span>
                            </div>
                          </div>
                        )}
                      </div>

                      {userDetails.jobHistory.length === 0 ? (
                        <div className="text-center py-8">
                          <Building className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                          <h4 className="text-lg font-medium text-gray-900 mb-2">No Job Applications</h4>
                          <p className="text-gray-500">This user hasn't applied to any jobs yet.</p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {userDetails.jobHistory.map((job) => (
                            <div key={job.id} className="border border-gray-200 rounded-lg overflow-hidden">
                              {/* Job Header */}
                              <div 
                                className="p-4 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors"
                                onClick={() => toggleJobExpansion(job.id)}
                              >
                                <div className="flex justify-between items-start">
                                  <div className="flex-1">
                                    <div className="flex items-center space-x-3 mb-2">
                                      <h4 className="font-semibold text-gray-900">{job.role}</h4>
                                      <span className="text-sm bg-blue-100 text-blue-800 px-2 py-1 rounded">
                                        {job.company_name}
                                      </span>
                                      {job.resume_history.length > 0 && (
                                        <span className="text-sm bg-green-100 text-green-800 px-2 py-1 rounded">
                                          {job.resume_history.length} resume{job.resume_history.length !== 1 ? 's' : ''}
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center space-x-4 text-sm text-gray-600">
                                      <span className="flex items-center space-x-1">
                                        <Calendar className="h-4 w-4" />
                                        <span>{formatDateTime(job.created_at)}</span>
                                      </span>
                                      {job.resume_history.length > 0 && (
                                        <span className="flex items-center space-x-1">
                                          <DollarSign className="h-4 w-4" />
                                          <span>
                                            ${job.resume_history.reduce((sum, r) => sum + (r.generation_cost || 0), 0).toFixed(2)}
                                          </span>
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex items-center space-x-2">
                                    {job.resume_history.length > 0 && (
                                      <div className="flex space-x-1">
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            handleDownloadResume(job.resume_history[0].resume_data, 'pdf', job.company_name, job.role)
                                          }}
                                          className="flex items-center space-x-1 px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700 transition-colors"
                                        >
                                          <Download className="h-3 w-3" />
                                          <span>PDF</span>
                                        </button>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            handleDownloadResume(job.resume_history[0].resume_data, 'docx', job.company_name, job.role)
                                          }}
                                          className="flex items-center space-x-1 px-2 py-1 bg-purple-600 text-white text-xs rounded hover:bg-purple-700 transition-colors"
                                        >
                                          <Download className="h-3 w-3" />
                                          <span>DOCX</span>
                                        </button>
                                      </div>
                                    )}
                                    {expandedJobs.has(job.id) ? (
                                      <ChevronUp className="h-5 w-5 text-gray-400" />
                                    ) : (
                                      <ChevronDown className="h-5 w-5 text-gray-400" />
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Expanded Job Details */}
                              {expandedJobs.has(job.id) && (
                                <div className="p-4 border-t border-gray-200">
                                  {/* Note */}
                                  {job.note && (
                                    <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
                                      <p className="text-sm text-yellow-800">
                                        <strong>Personal Note:</strong> {job.note}
                                      </p>
                                    </div>
                                  )}

                                  {/* Job Description */}
                                  <div className="mb-4">
                                    <h5 className="text-sm font-medium text-gray-700 mb-2">Job Description</h5>
                                    <div className="max-h-32 overflow-y-auto bg-gray-50 border border-gray-200 rounded p-3">
                                      <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                                        {job.job_description}
                                      </p>
                                    </div>
                                  </div>

                                  {/* Resume History */}
                                  {job.resume_history.length > 0 && (
                                    <div>
                                      <h5 className="text-sm font-medium text-gray-700 mb-3">
                                        Generated Resumes ({job.resume_history.length})
                                      </h5>
                                      <div className="space-y-3">
                                        {job.resume_history.map((resume, index) => (
                                          <div key={resume.id} className="flex items-center justify-between bg-white border border-gray-200 rounded p-3">
                                            <div className="flex items-center space-x-3">
                                              <span className="text-sm font-medium text-gray-600">
                                                #{index + 1}
                                              </span>
                                              <span className="text-xs font-medium text-blue-900 bg-blue-100 px-2 py-1 rounded">
                                                {resume.ai_provider === 'openai' ? 'OpenAI' : 'Anthropic'}
                                              </span>
                                              {resume.generation_cost && (
                                                <span className="text-xs text-green-700 bg-green-100 px-2 py-1 rounded">
                                                  ${resume.generation_cost.toFixed(3)}
                                                </span>
                                              )}
                                              <span className="text-xs text-gray-500">
                                                {formatDateTime(resume.created_at)}
                                              </span>
                                            </div>
                                            <div className="flex space-x-2">
                                              <button
                                                onClick={() => handleDownloadResume(resume.resume_data, 'pdf', job.company_name, job.role)}
                                                className="flex items-center space-x-1 px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700 transition-colors"
                                              >
                                                <Download className="h-3 w-3" />
                                                <span>PDF</span>
                                              </button>
                                              <button
                                                onClick={() => handleDownloadResume(resume.resume_data, 'docx', job.company_name, job.role)}
                                                className="flex items-center space-x-1 px-3 py-1 bg-purple-600 text-white text-sm rounded hover:bg-purple-700 transition-colors"
                                              >
                                                <Download className="h-3 w-3" />
                                                <span>DOCX</span>
                                              </button>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Work Experience */}
                    {userDetails.workExperiences.length > 0 && (
                      <div className="bg-white rounded-lg shadow-md p-6">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                          <Briefcase className="h-5 w-5 mr-2" />
                          Work Experience
                        </h3>
                        <div className="space-y-4">
                          {userDetails.workExperiences.map((work) => (
                            <div key={work.id} className="border-l-2 border-blue-200 pl-4">
                              <div className="flex justify-between items-start">
                                <div>
                                  <h4 className="font-medium text-gray-900">{work.position}</h4>
                                  <p className="text-blue-600">{work.company}</p>
                                </div>
                                <span className="text-sm text-gray-500">
                                  {formatDate(work.start_date)} - {work.is_current ? 'Present' : formatDate(work.end_date)}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Education */}
                    {userDetails.educations.length > 0 && (
                      <div className="bg-white rounded-lg shadow-md p-6">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                          <GraduationCap className="h-5 w-5 mr-2" />
                          Education
                        </h3>
                        <div className="space-y-4">
                          {userDetails.educations.map((edu) => (
                            <div key={edu.id} className="border-l-2 border-green-200 pl-4">
                              <div className="flex justify-between items-start">
                                <div>
                                  <h4 className="font-medium text-gray-900">{edu.degree}</h4>
                                  <p className="text-green-600">{edu.university}</p>
                                </div>
                                <span className="text-sm text-gray-500">
                                  {formatDate(edu.start_date)} - {formatDate(edu.end_date)}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* User Settings */}
                    {userDetails.settings && (
                      <div className="bg-white rounded-lg shadow-md p-6">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                          <Shield className="h-5 w-5 mr-2" />
                          AI Settings
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="text-sm font-medium text-gray-700">Preferred AI</label>
                            <p className="text-sm text-gray-900 capitalize">{userDetails.settings.preferred_ai}</p>
                          </div>
                          <div>
                            <label className="text-sm font-medium text-gray-700">API Keys Configured</label>
                            <div className="flex space-x-2 mt-1">
                              {userDetails.settings.openai_key && (
                                <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">OpenAI</span>
                              )}
                              {userDetails.settings.anthropic_key && (
                                <span className="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded">Anthropic</span>
                              )}
                              {!userDetails.settings.openai_key && !userDetails.settings.anthropic_key && (
                                <span className="text-xs bg-gray-100 text-gray-800 px-2 py-1 rounded">None</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                ) : null}
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow-md p-8 text-center">
                <Eye className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Select a User</h3>
                <p className="text-gray-500">
                  Choose a user from the list to view their detailed information and history
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}