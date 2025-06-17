import React, { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { Plus, Trash2, Save } from 'lucide-react'

interface Profile {
  id?: string
  name: string
  email: string
  phone: string
  location: string
}

interface WorkExperience {
  id?: string
  company: string
  position: string
  start_date: string
  end_date: string
  is_current: boolean
}

interface Education {
  id?: string
  university: string
  degree: string
  start_date: string
  end_date: string
}

export function Profile() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [profile, setProfile] = useState<Profile>({
    name: '',
    email: user?.email || '',
    phone: '',
    location: ''
  })
  const [workExperiences, setWorkExperiences] = useState<WorkExperience[]>([])
  const [educations, setEducations] = useState<Education[]>([])

  useEffect(() => {
    if (user) {
      loadProfile()
    }
  }, [user])

  const loadProfile = async () => {
    if (!user) {
      setError('User not authenticated')
      setLoading(false)
      return
    }

    try {
      setError(null)
      
      // Test Supabase connection first
      const { data: testData, error: testError } = await supabase
        .from('profiles')
        .select('count')
        .limit(1)

      if (testError) {
        console.error('Supabase connection test failed:', testError)
        setError(`Database connection failed: ${testError.message}`)
        setLoading(false)
        return
      }

      // Load profile
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle()

      if (profileError) {
        console.error('Error loading profile:', profileError)
        setError(`Failed to load profile: ${profileError.message}`)
        setLoading(false)
        return
      }

      if (profileData) {
        setProfile(profileData)
        
        // Load work experiences
        const { data: workData, error: workError } = await supabase
          .from('work_experiences')
          .select('*')
          .eq('profile_id', profileData.id)
          .order('start_date', { ascending: false })

        if (workError) {
          console.error('Error loading work experiences:', workError)
          setError(`Failed to load work experiences: ${workError.message}`)
        } else if (workData) {
          setWorkExperiences(workData)
        }

        // Load educations
        const { data: eduData, error: eduError } = await supabase
          .from('educations')
          .select('*')
          .eq('profile_id', profileData.id)
          .order('start_date', { ascending: false })

        if (eduError) {
          console.error('Error loading educations:', eduError)
          setError(`Failed to load educations: ${eduError.message}`)
        } else if (eduData) {
          setEducations(eduData)
        }
      }
    } catch (error) {
      console.error('Unexpected error loading profile:', error)
      if (error instanceof Error) {
        setError(`Unexpected error: ${error.message}`)
      } else {
        setError('An unexpected error occurred while loading your profile')
      }
    } finally {
      setLoading(false)
    }
  }

  const saveProfile = async () => {
    if (!user) {
      setError('User not authenticated')
      return
    }
    
    setSaving(true)
    setError(null)
    
    try {
      // Save or update profile
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .upsert({
          ...profile,
          user_id: user.id,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id'
        })
        .select()
        .single()

      if (profileError) {
        console.error('Error saving profile:', profileError)
        setError(`Failed to save profile: ${profileError.message}`)
        return
      }

      const profileId = profileData.id

      // Save work experiences
      for (const work of workExperiences) {
        try {
          if (work.id) {
            const { error: updateError } = await supabase
              .from('work_experiences')
              .update(work)
              .eq('id', work.id)
            
            if (updateError) {
              console.error('Error updating work experience:', updateError)
              setError(`Failed to update work experience: ${updateError.message}`)
              return
            }
          } else {
            const { error: insertError } = await supabase
              .from('work_experiences')
              .insert({
                ...work,
                profile_id: profileId
              })
            
            if (insertError) {
              console.error('Error inserting work experience:', insertError)
              setError(`Failed to add work experience: ${insertError.message}`)
              return
            }
          }
        } catch (error) {
          console.error('Unexpected error saving work experience:', error)
          setError('Failed to save work experience')
          return
        }
      }

      // Save educations
      for (const edu of educations) {
        try {
          if (edu.id) {
            const { error: updateError } = await supabase
              .from('educations')
              .update(edu)
              .eq('id', edu.id)
            
            if (updateError) {
              console.error('Error updating education:', updateError)
              setError(`Failed to update education: ${updateError.message}`)
              return
            }
          } else {
            const { error: insertError } = await supabase
              .from('educations')
              .insert({
                ...edu,
                profile_id: profileId
              })
            
            if (insertError) {
              console.error('Error inserting education:', insertError)
              setError(`Failed to add education: ${insertError.message}`)
              return
            }
          }
        } catch (error) {
          console.error('Unexpected error saving education:', error)
          setError('Failed to save education')
          return
        }
      }

      alert('Profile saved successfully!')
    } catch (error) {
      console.error('Unexpected error saving profile:', error)
      if (error instanceof Error) {
        setError(`Unexpected error: ${error.message}`)
      } else {
        setError('An unexpected error occurred while saving your profile')
      }
    } finally {
      setSaving(false)
    }
  }

  const addWorkExperience = () => {
    setWorkExperiences([...workExperiences, {
      company: '',
      position: '',
      start_date: '',
      end_date: '',
      is_current: false
    }])
  }

  const removeWorkExperience = async (index: number) => {
    const work = workExperiences[index]
    if (work.id) {
      try {
        const { error } = await supabase.from('work_experiences').delete().eq('id', work.id)
        if (error) {
          console.error('Error deleting work experience:', error)
          setError(`Failed to delete work experience: ${error.message}`)
          return
        }
      } catch (error) {
        console.error('Unexpected error deleting work experience:', error)
        setError('Failed to delete work experience')
        return
      }
    }
    setWorkExperiences(workExperiences.filter((_, i) => i !== index))
  }

  const addEducation = () => {
    setEducations([...educations, {
      university: '',
      degree: '',
      start_date: '',
      end_date: ''
    }])
  }

  const removeEducation = async (index: number) => {
    const edu = educations[index]
    if (edu.id) {
      try {
        const { error } = await supabase.from('educations').delete().eq('id', edu.id)
        if (error) {
          console.error('Error deleting education:', error)
          setError(`Failed to delete education: ${error.message}`)
          return
        }
      } catch (error) {
        console.error('Unexpected error deleting education:', error)
        setError('Failed to delete education')
        return
      }
    }
    setEducations(educations.filter((_, i) => i !== index))
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md mx-auto bg-white rounded-lg shadow-md p-6">
          <div className="text-center">
            <div className="text-red-600 text-6xl mb-4">⚠️</div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Connection Error</h2>
            <p className="text-gray-600 mb-4">{error}</p>
            <button
              onClick={() => {
                setError(null)
                setLoading(true)
                loadProfile()
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-lg shadow-md">
          <div className="px-6 py-4 border-b border-gray-200">
            <h1 className="text-2xl font-bold text-gray-900">Profile Setup</h1>
            <p className="text-gray-600 mt-1">Complete your profile to generate tailored resumes</p>
          </div>

          <div className="p-6 space-y-8">
            {/* Personal Information */}
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Personal Information</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={profile.name}
                    onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Your full name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={profile.email}
                    onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="your.email@example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    value={profile.phone}
                    onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="+1 (555) 123-4567"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Location
                  </label>
                  <input
                    type="text"
                    value={profile.location}
                    onChange={(e) => setProfile({ ...profile, location: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    placeholder="City, State, Country"
                  />
                </div>
              </div>
            </section>

            {/* Work Experience */}
            <section>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-gray-900">Work Experience</h2>
                <button
                  onClick={addWorkExperience}
                  className="flex items-center space-x-1 px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  <span>Add Experience</span>
                </button>
              </div>
              
              {workExperiences.map((work, index) => (
                <div key={index} className="border border-gray-200 rounded-md p-4 mb-4">
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-lg font-medium text-gray-900">Experience {index + 1}</h3>
                    <button
                      onClick={() => removeWorkExperience(index)}
                      className="text-red-600 hover:text-red-800 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Company
                      </label>
                      <input
                        type="text"
                        value={work.company}
                        onChange={(e) => {
                          const updated = [...workExperiences]
                          updated[index].company = e.target.value
                          setWorkExperiences(updated)
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Company name"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Position
                      </label>
                      <input
                        type="text"
                        value={work.position}
                        onChange={(e) => {
                          const updated = [...workExperiences]
                          updated[index].position = e.target.value
                          setWorkExperiences(updated)
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Job title"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Start Date
                      </label>
                      <input
                        type="date"
                        value={work.start_date}
                        onChange={(e) => {
                          const updated = [...workExperiences]
                          updated[index].start_date = e.target.value
                          setWorkExperiences(updated)
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        End Date
                      </label>
                      <input
                        type="date"
                        value={work.end_date}
                        onChange={(e) => {
                          const updated = [...workExperiences]
                          updated[index].end_date = e.target.value
                          setWorkExperiences(updated)
                        }}
                        disabled={work.is_current}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                      />
                    </div>
                  </div>
                  
                  <div className="mt-4">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={work.is_current}
                        onChange={(e) => {
                          const updated = [...workExperiences]
                          updated[index].is_current = e.target.checked
                          if (e.target.checked) {
                            updated[index].end_date = ''
                          }
                          setWorkExperiences(updated)
                        }}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      <span className="ml-2 text-sm text-gray-700">I currently work here</span>
                    </label>
                  </div>
                </div>
              ))}
            </section>

            {/* Education */}
            <section>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-gray-900">Education</h2>
                <button
                  onClick={addEducation}
                  className="flex items-center space-x-1 px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  <span>Add Education</span>
                </button>
              </div>
              
              {educations.map((edu, index) => (
                <div key={index} className="border border-gray-200 rounded-md p-4 mb-4">
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-lg font-medium text-gray-900">Education {index + 1}</h3>
                    <button
                      onClick={() => removeEducation(index)}
                      className="text-red-600 hover:text-red-800 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        University
                      </label>
                      <input
                        type="text"
                        value={edu.university}
                        onChange={(e) => {
                          const updated = [...educations]
                          updated[index].university = e.target.value
                          setEducations(updated)
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        placeholder="University name"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Degree
                      </label>
                      <input
                        type="text"
                        value={edu.degree}
                        onChange={(e) => {
                          const updated = [...educations]
                          updated[index].degree = e.target.value
                          setEducations(updated)
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Degree and major"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Start Date
                      </label>
                      <input
                        type="date"
                        value={edu.start_date}
                        onChange={(e) => {
                          const updated = [...educations]
                          updated[index].start_date = e.target.value
                          setEducations(updated)
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        End Date
                      </label>
                      <input
                        type="date"
                        value={edu.end_date}
                        onChange={(e) => {
                          const updated = [...educations]
                          updated[index].end_date = e.target.value
                          setEducations(updated)
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </section>

            {/* Save Button */}
            <div className="flex justify-end">
              <button
                onClick={saveProfile}
                disabled={saving}
                className="flex items-center space-x-2 px-6 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Save className="h-4 w-4" />
                <span>{saving ? 'Saving...' : 'Save Profile'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}