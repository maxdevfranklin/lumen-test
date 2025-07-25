import jsPDF from 'jspdf'
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle, TabStopPosition, TabStopType } from 'docx'
import { saveAs } from 'file-saver'

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

export async function downloadPDF(resume: GeneratedResume) {
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  })

  const pageWidth = pdf.internal.pageSize.getWidth()
  const margin = 20
  const contentWidth = pageWidth - (margin * 2)
  let yPosition = margin

  // Helper function to format date
  const formatDate = (dateString: string) => {
    if (!dateString) return ''
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  }

  // Helper function to render achievements
  const renderAchievement = (achievement: string | { description: string; details: string[] }) => {
    if (typeof achievement === 'string') {
      const achievementLines = pdf.splitTextToSize(`• ${achievement}`, contentWidth - 5)
      pdf.text(achievementLines, margin + 2, yPosition)
      yPosition += achievementLines.length * 4 + 1
    } else {
      // Main description
      const descriptionLines = pdf.splitTextToSize(`• ${achievement.description}`, contentWidth - 5)
      pdf.text(descriptionLines, margin + 2, yPosition)
      yPosition += descriptionLines.length * 4 + 2
      
      // Detailed bullet points
      achievement.details.forEach(detail => {
        const detailLines = pdf.splitTextToSize(`  ○ ${detail}`, contentWidth - 10)
        pdf.text(detailLines, margin + 5, yPosition)
        yPosition += detailLines.length * 4 + 1
      })
    }
  }
  // Header
  pdf.setFontSize(24)
  pdf.setFont(undefined, 'bold')
  pdf.text(resume.personalInfo.name, pageWidth / 2, yPosition, { align: 'center' })
  yPosition += 8

  pdf.setFontSize(16)
  pdf.setTextColor(0, 100, 200)
  pdf.text(resume.professionalTitle, pageWidth / 2, yPosition, { align: 'center' })
  yPosition += 8

  pdf.setFontSize(10)
  pdf.setTextColor(100, 100, 100)
  const contactInfo = `${resume.personalInfo.email} | ${resume.personalInfo.phone} | ${resume.personalInfo.location}`
  pdf.text(contactInfo, pageWidth / 2, yPosition, { align: 'center' })
  yPosition += 12

  // Professional Summary
  pdf.setTextColor(0, 0, 0)
  pdf.setFontSize(14)
  pdf.setFont(undefined, 'bold')
  pdf.text('PROFESSIONAL SUMMARY', margin, yPosition)
  yPosition += 2
  
  // Add underline
  pdf.setDrawColor(0, 100, 200)
  pdf.setLineWidth(0.5)
  pdf.line(margin, yPosition, margin + 60, yPosition)
  yPosition += 6

  pdf.setFontSize(10)
  pdf.setFont(undefined, 'normal')
  const summaryLines = pdf.splitTextToSize(resume.professionalSummary, contentWidth)
  pdf.text(summaryLines, margin, yPosition)
  yPosition += summaryLines.length * 4 + 8

  // Professional Experience (moved before Technical Skills)
  pdf.setFontSize(14)
  pdf.setFont(undefined, 'bold')
  pdf.text('PROFESSIONAL EXPERIENCE', margin, yPosition)
  yPosition += 2
  
  pdf.setDrawColor(0, 100, 200)
  pdf.line(margin, yPosition, margin + 65, yPosition)
  yPosition += 6

  resume.workExperiences.forEach(work => {
    // Check if we need a new page
    if (yPosition > 250) {
      pdf.addPage()
      yPosition = margin
    }

    // Company Name (More prominent)
    pdf.setFontSize(12)
    pdf.setFont(undefined, 'bold')
    pdf.setTextColor(0, 0, 0)
    pdf.text(`  ${work.company.toUpperCase()}`, margin, yPosition)
    yPosition += 6

    // Position and Date
    pdf.setFontSize(11)
    pdf.text(`    ${work.position}`, margin, yPosition)
    
    const dateRange = `${formatDate(work.startDate)} - ${work.isCurrent ? 'Present' : formatDate(work.endDate)}`
    pdf.setFont(undefined, 'italic')
    pdf.text(dateRange, pageWidth - margin - 2, yPosition, { align: 'right' })
    pdf.setFont(undefined, 'normal')
    yPosition += 6

    // Achievements
    pdf.setFontSize(10)
    pdf.setTextColor(0, 0, 0)
    pdf.setFont(undefined, 'normal')
    work.achievements.forEach(achievement => {
      renderAchievement(achievement)
    })
    yPosition += 8
  })

  // Technical Skills (moved after Professional Experience)
  if (yPosition > 230) {
    pdf.addPage()
    yPosition = margin
  }

  pdf.setFontSize(14)
  pdf.setFont(undefined, 'bold')
  pdf.text('TECHNICAL SKILLS', margin, yPosition)
  yPosition += 2
  
  pdf.setDrawColor(0, 100, 200)
  pdf.line(margin, yPosition, margin + 50, yPosition)
  yPosition += 6

  pdf.setFontSize(10)
  pdf.setFont(undefined, 'normal')
  const skillsPerRow = 2
  const skillsChunks = []
  for (let i = 0; i < resume.technicalSkills.length; i += skillsPerRow) {
    skillsChunks.push(resume.technicalSkills.slice(i, i + skillsPerRow))
  }
  
  skillsChunks.forEach(chunk => {
    const skillText = chunk.map(skill => `• ${skill}`).join('    ')
    pdf.text(skillText, margin, yPosition)
    yPosition += 4
  })
  yPosition += 8

  // Education
  if (yPosition > 230) {
    pdf.addPage()
    yPosition = margin
  }

  pdf.setFontSize(14)
  pdf.setFont(undefined, 'bold')
  pdf.text('EDUCATION', margin, yPosition)
  yPosition += 2
  
  pdf.setDrawColor(0, 100, 200)
  pdf.line(margin, yPosition, margin + 35, yPosition)
  yPosition += 6

  resume.educations.forEach(edu => {
    pdf.setFontSize(12)
    pdf.setFont(undefined, 'bold')
    pdf.setTextColor(0, 0, 0)
    pdf.text(edu.degree, margin, yPosition)
    
    const eduDateRange = `${formatDate(edu.startDate)} - ${formatDate(edu.endDate)}`
    pdf.text(eduDateRange, pageWidth - margin, yPosition, { align: 'right' })
    yPosition += 5

    pdf.setFontSize(10)
    pdf.setTextColor(0, 100, 200)
    pdf.setFont(undefined, 'bold')
    pdf.text(edu.university, margin, yPosition)
    yPosition += 8
  })

  pdf.save(`${resume.personalInfo.name}_Resume.pdf`)
}

export async function downloadDocx(resume: GeneratedResume) {
  const formatDate = (dateString: string) => {
    if (!dateString) return ''
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  }

  // Helper function to create achievement paragraphs
  const createAchievementParagraphs = (achievement: string | { description: string; details: string[] }) => {
    if (typeof achievement === 'string') {
      return [
        new Paragraph({
          children: [
            new TextRun({
              text: `• ${achievement}`,
              size: 22, // 11pt
              font: 'Calibri',
            }),
          ],
          spacing: {
            line: 276, // 1.15 line spacing
            after: 120, // 6pt after
          },
          indent: {
            left: 360, // 0.25 inch left indent
            hanging: 180, // 0.125 inch hanging indent for bullet
          },
        })
      ]
    } else {
      const paragraphs = [
        // Main description
        new Paragraph({
          children: [
            new TextRun({
              text: `• ${achievement.description}`,
              size: 22, // 11pt
              color: '000000',
            }),
          ],
          spacing: {
            line: 276, // 1.15 line spacing
            after: 60, // 3pt after
          },
          indent: {
            left: 360, // 0.25 inch left indent
            hanging: 180, // 0.125 inch hanging indent for bullet
          },
        })
      ]
      
      // Add detailed bullet points
      achievement.details.forEach(detail => {
        paragraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `○ ${detail}`,
                size: 20, // 10pt
                font: 'Calibri',
                color: '000000',
              }),
            ],
            spacing: {
              line: 276, // 1.15 line spacing
              after: 80, // 4pt after
            },
            indent: {
              left: 720, // 0.5 inch left indent
              hanging: 180, // 0.125 inch hanging indent for bullet
            },
          })
        )
      })
      
      return paragraphs
    }
  }

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: {
            top: 720,    // 0.5 inch
            right: 720,  // 0.5 inch
            bottom: 720, // 0.5 inch
            left: 720,   // 0.5 inch
          },
        },
      },
      children: [
        // Header - Name
        new Paragraph({
          children: [
            new TextRun({
              text: resume.personalInfo.name,
              bold: true,
              size: 36, // 18pt
              font: 'Calibri',
            }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: {
            after: 120, // 6pt spacing after
          },
        }),
        
        // Professional Title
        new Paragraph({
          children: [
            new TextRun({
              text: resume.professionalTitle,
              bold: true,
              size: 28, // 14pt
              color: '0066CC',
              font: 'Calibri',
            }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: {
            after: 120, // 6pt spacing after
          },
        }),
        
        // Contact Information
        new Paragraph({
          children: [
            new TextRun({
              text: `${resume.personalInfo.email} | ${resume.personalInfo.phone} | ${resume.personalInfo.location}`,
              size: 22, // 11pt
              color: '666666',
              font: 'Calibri',
            }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: {
            after: 240, // 12pt spacing after
          },
        }),
        
        // Professional Summary Section
        new Paragraph({
          children: [
            new TextRun({
              text: 'PROFESSIONAL SUMMARY',
              bold: true,
              size: 28, // 14pt
              font: 'Calibri',
            }),
          ],
          border: {
            bottom: {
              color: '0066CC',
              space: 1,
              style: BorderStyle.SINGLE,
              size: 8,
            },
          },
          spacing: {
            before: 120, // 6pt before
            after: 180,  // 9pt after
          },
        }),
        
        new Paragraph({
          children: [
            new TextRun({
              text: resume.professionalSummary,
              size: 22, // 11pt
              font: 'Calibri',
            }),
          ],
          spacing: {
            line: 276, // 1.15 line spacing
            after: 240, // 12pt after
          },
        }),
        
        // Professional Experience Section
        new Paragraph({
          children: [
            new TextRun({
              text: 'PROFESSIONAL EXPERIENCE',
              bold: true,
              size: 28, // 14pt
              font: 'Calibri',
            }),
          ],
          border: {
            bottom: {
              color: '0066CC',
              space: 1,
              style: BorderStyle.SINGLE,
              size: 8,
            },
          },
          spacing: {
            before: 120, // 6pt before
            after: 180,  // 9pt after
          },
        }),
        
        ...resume.workExperiences.flatMap(work => [
          // Company Name (More prominent)
          new Paragraph({
            children: [
              new TextRun({
                text: `    ${work.company}`,
                bold: true,
                size: 24, // 12pt
                color: '000000',
                font: 'Calibri',
              }),
            ],
            spacing: {
              before: 240, // 12pt before
              after: 60,   // 3pt after
            },
          }),
          
          // Job Title and Date (with right-aligned date)
          new Paragraph({
            children: [
              new TextRun({
                text: `    ${work.position}`,
                bold: true,
                size: 24, // 12pt
                font: 'Calibri',
              }),
              new TextRun({
                text: `\t${formatDate(work.startDate)} - ${work.isCurrent ? 'Present' : formatDate(work.endDate)}`,
                size: 22, // 11pt
                font: 'Calibri',
                italics: true,
              }),
            ],
            tabStops: [
              {
                type: TabStopType.RIGHT,
                position: 9360, // Right align at page margin
              },
            ],
            spacing: {
              after: 120, // 6pt after
            },
          }),
          
          // Achievements with improved formatting
          ...work.achievements.flatMap(achievement => createAchievementParagraphs(achievement)),
        ]),
        
        // Technical Skills Section
        new Paragraph({
          children: [
            new TextRun({
              text: 'TECHNICAL SKILLS',
              bold: true,
              size: 28, // 14pt
              font: 'Calibri',
            }),
          ],
          border: {
            bottom: {
              color: '0066CC',
              space: 1,
              style: BorderStyle.SINGLE,
              size: 8,
            },
          },
          spacing: {
            before: 240, // 12pt before
            after: 180,  // 9pt after
          },
        }),
        
        ...resume.technicalSkills.map(skill => 
          new Paragraph({
            children: [
              new TextRun({
                text: `• ${skill}`,
                size: 22, // 11pt
                font: 'Calibri',
              }),
            ],
            spacing: {
              line: 276, // 1.15 line spacing
              after: 120, // 6pt after
            },
            indent: {
              left: 360, // 0.25 inch left indent
              hanging: 180, // 0.125 inch hanging indent for bullet
            },
          })
        ),
        
        // Education Section
        new Paragraph({
          children: [
            new TextRun({
              text: 'EDUCATION',
              bold: true,
              size: 28, // 14pt
              font: 'Calibri',
            }),
          ],
          border: {
            bottom: {
              color: '0066CC',
              space: 1,
              style: BorderStyle.SINGLE,
              size: 8,
            },
          },
          spacing: {
            before: 240, // 12pt before
            after: 180,  // 9pt after
          },
        }),
        
        ...resume.educations.flatMap(edu => [
          // University Name (More prominent)
          new Paragraph({
            children: [
              new TextRun({
                text: edu.university.toUpperCase(),
                bold: true,
                size: 24, // 12pt
                color: '000000',
                font: 'Calibri',
              }),
            ],
            spacing: {
              before: 120, // 6pt before
              after: 60,   // 3pt after
            },
          }),
          
          // Degree and Date (with right-aligned date)
          new Paragraph({
            children: [
              new TextRun({
                text: edu.degree,
                bold: true,
                size: 24, // 12pt
                font: 'Calibri',
              }),
              new TextRun({
                text: `\t${formatDate(edu.startDate)} - ${formatDate(edu.endDate)}`,
                size: 22, // 11pt
                font: 'Calibri',
                italics: true,
              }),
            ],
            tabStops: [
              {
                type: TabStopType.RIGHT,
                position: 9360, // Right align at page margin
              },
            ],
            spacing: {
              after: 180, // 9pt after
            },
          }),
        ]),
      ],
    }],
  })

  const blob = await Packer.toBlob(doc)
  saveAs(blob, `${resume.personalInfo.name}_Resume.docx`)
}