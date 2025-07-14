import React, { useState } from 'react'

interface GeneratedResume {
  professionalTitle: string
  professionalSummary: string
  workExperiences: Array<{
    company: string
    position: string
    startDate: string
    endDate: string
    isCurrent: boolean
    achievements: Array<string | {
      description: string
      details: string[]
    }>
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

interface ResumePreviewProps {
  resume: GeneratedResume

  onResumeUpdate?: (updatedResume: GeneratedResume) => void
  isEditable?: boolean
}

export function ResumePreview({ resume, onResumeUpdate, isEditable = false }: ResumePreviewProps) {
  const [editingField, setEditingField] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  const formatDate = (dateString: string) => {
    if (!dateString) return ''
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  }

  const handleEdit = (field: string, currentValue: string) => {
    if (!isEditable) return
    setEditingField(field)
    setEditValue(currentValue)
  }

  const handleSave = (field: string) => {
    if (!onResumeUpdate) return

    const updatedResume = { ...resume }
    
    if (field === 'professionalTitle') {
      updatedResume.professionalTitle = editValue
    } else if (field === 'professionalSummary') {
      updatedResume.professionalSummary = editValue
    } else if (field.startsWith('work-')) {
      const [, workIndex, achievementIndex, detailIndex] = field.split('-')
      const workIdx = parseInt(workIndex)
      const achIdx = parseInt(achievementIndex)
      
      if (detailIndex !== undefined) {
        // Editing detail of structured achievement
        const achievement = updatedResume.workExperiences[workIdx].achievements[achIdx]
        if (typeof achievement === 'object') {
          achievement.details[parseInt(detailIndex)] = editValue
        }
      } else if (field.includes('description')) {
        // Editing main description of structured achievement
        const achievement = updatedResume.workExperiences[workIdx].achievements[achIdx]
        if (typeof achievement === 'object') {
          achievement.description = editValue
        }
      } else {
        // Editing simple achievement
        updatedResume.workExperiences[workIdx].achievements[achIdx] = editValue
      }
    } else if (field.startsWith('skill-')) {
      const skillIndex = parseInt(field.split('-')[1])
      updatedResume.technicalSkills[skillIndex] = editValue
    }

    onResumeUpdate(updatedResume)
    setEditingField(null)
    setEditValue('')
  }

  const handleCancel = () => {
    setEditingField(null)
    setEditValue('')
  }

  const renderEditableText = (field: string, text: string, className: string = '') => {
    if (!isEditable) {
      return <span className={className}>{text}</span>
    }

    if (editingField === field) {
      return (
        <div className="relative">
          <textarea
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            className="w-full p-2 border border-blue-300 rounded resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={Math.max(2, Math.ceil(text.length / 80))}
            autoFocus
          />
          <div className="flex space-x-2 mt-1">
            <button
              onClick={() => handleSave(field)}
              className="px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700"
            >
              Save
            </button>
            <button
              onClick={handleCancel}
              className="px-2 py-1 bg-gray-600 text-white text-xs rounded hover:bg-gray-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )
    }

    return (
      <span
        className={`${className} ${isEditable ? 'cursor-pointer hover:bg-yellow-100 rounded px-1' : ''}`}
        onClick={() => handleEdit(field, text)}
        title={isEditable ? 'Click to edit' : ''}
      >
        {text}
      </span>
    )
  }

  const renderAchievement = (achievement: string | { description: string; details: string[] }, index: number) => {
    const workIndex = 0 // Assuming this is for the first work experience
    
    if (typeof achievement === 'string') {
      return (
        <li key={index} className="leading-relaxed mb-3">
          {renderEditableText(`work-${workIndex}-${index}`, achievement)}
        </li>
      )
    } else {
      return (
        <li key={index} className="leading-relaxed mb-4">
          <div className="mb-3">
            {renderEditableText(`work-${workIndex}-${index}-description`, achievement.description)}
          </div>
          <ul className="ml-4 space-y-2">
            {achievement.details.map((detail, detailIndex) => (
              <li key={detailIndex} className="flex items-start">
                <span className="inline-block w-2 h-2 bg-blue-600 rounded-full mt-2.5 mr-3 flex-shrink-0"></span>
                <span className="text-gray-700 leading-relaxed">
                  {renderEditableText(`work-${workIndex}-${index}-${detailIndex}`, detail)}
                </span>
              </li>
            ))}
          </ul>
        </li>
      )
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">Resume Preview</h2>
      </div>
      
      <div id="resume-content" className="resume-content p-8 max-h-[800px] overflow-y-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{resume.personalInfo.name}</h1>
          <div className="text-lg font-semibold text-blue-600 mb-3">
            {renderEditableText('professionalTitle', resume.professionalTitle)}
          </div>
          <div className="flex flex-wrap justify-center items-center gap-x-6 gap-y-2 text-sm text-gray-600">
            <span>{resume.personalInfo.email}</span>
            <span>{resume.personalInfo.phone}</span>
            <span>{resume.personalInfo.location}</span>
          </div>
        </div>

        {/* Professional Summary */}
        <section className="mb-8">
          <h2 className="text-xl font-bold text-gray-900 mb-3 border-b-2 border-blue-600 pb-1">
            PROFESSIONAL SUMMARY
          </h2>
          <p className="text-gray-700 leading-relaxed">
            {renderEditableText('professionalSummary', resume.professionalSummary)}
          </p>
        </section>

        {/* Professional Experience - Moved before Technical Skills */}
        <section className="mb-8">
          <h2 className="text-xl font-bold text-gray-900 mb-3 border-b-2 border-blue-600 pb-1">
            PROFESSIONAL EXPERIENCE
          </h2>
          {resume.workExperiences.map((work, index) => (
            <div key={index} className="mb-6">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{work.position}</h3>
                  <p className="text-blue-600 font-medium">{work.company}</p>
                </div>
                <div className="text-sm text-gray-600">
                  {formatDate(work.startDate)} - {work.isCurrent ? 'Present' : formatDate(work.endDate)}
                </div>
              </div>
              <ul className="list-disc list-inside space-y-2 text-gray-700">
                {work.achievements.map((achievement, achievementIndex) => {
                  const workIndex = index
                  
                  if (typeof achievement === 'string') {
                    return (
                      <li key={achievementIndex} className="leading-relaxed mb-3">
                        {renderEditableText(`work-${workIndex}-${achievementIndex}`, achievement)}
                      </li>
                    )
                  } else {
                    return (
                      <li key={achievementIndex} className="leading-relaxed mb-4">
                        <div className="mb-3">
                          {renderEditableText(`work-${workIndex}-${achievementIndex}-description`, achievement.description)}
                        </div>
                        <ul className="ml-4 space-y-2">
                          {achievement.details.map((detail, detailIndex) => (
                            <li key={detailIndex} className="flex items-start">
                              <span className="inline-block w-2 h-2 bg-blue-600 rounded-full mt-2.5 mr-3 flex-shrink-0"></span>
                              <span className="text-gray-700 leading-relaxed">
                                {renderEditableText(`work-${workIndex}-${achievementIndex}-${detailIndex}`, detail)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </li>
                    )
                  }
                })}
              </ul>
            </div>
          ))}
        </section>

        {/* Technical Skills - Moved after Professional Experience */}
        <section className="mb-8">
          <h2 className="text-xl font-bold text-gray-900 mb-3 border-b-2 border-blue-600 pb-1">
            TECHNICAL SKILLS
          </h2>
          <div className="grid grid-cols-2 gap-2">
            {resume.technicalSkills.map((skill, index) => (
              <div key={index} className="text-gray-700">
                • {renderEditableText(`skill-${index}`, skill)}
              </div>
            ))}
          </div>
        </section>

        {/* Education */}
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-3 border-b-2 border-blue-600 pb-1">
            EDUCATION
          </h2>
          {resume.educations.map((edu, index) => (
            <div key={index} className="mb-4">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{edu.degree}</h3>
                  <p className="text-blue-600 font-medium">{edu.university}</p>
                </div>
                <div className="text-sm text-gray-600">
                  {formatDate(edu.startDate)} - {formatDate(edu.endDate)}
                </div>
              </div>
            </div>
          ))}
        </section>
      </div>
    </div>
  )
}