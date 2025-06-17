import React from 'react'

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

interface ResumePreviewProps {
  resume: GeneratedResume
}

export function ResumePreview({ resume }: ResumePreviewProps) {
  const formatDate = (dateString: string) => {
    if (!dateString) return ''
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
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
          <div className="text-lg font-semibold text-blue-600 mb-3">{resume.professionalTitle}</div>
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
          <p className="text-gray-700 leading-relaxed">{resume.professionalSummary}</p>
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
              <ul className="list-disc list-inside space-y-1 text-gray-700">
                {work.achievements.map((achievement, achievementIndex) => (
                  <li key={achievementIndex} className="leading-relaxed">{achievement}</li>
                ))}
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
              <div key={index} className="text-gray-700">• {skill}</div>
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