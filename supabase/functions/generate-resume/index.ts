/*
  # Enhanced ATS Resume Generation with Comprehensive Keyword Matching

  This edge function creates ATS-optimized resumes by:
  1. Generating exactly 2 detailed real-world projects per work experience (80-120 words each)
  2. Adding 3 comprehensive strategic achievements (60-90 words each)
  3. Extensive keyword extraction and natural integration from job descriptions
  4. Longer, more detailed responses while staying within token limits
  5. Maintaining 95%+ ATS score through strategic keyword density
*/

import { createClient } from 'npm:@supabase/supabase-js@2'

interface UserProfile {
  name: string
  email: string
  phone: string
  location: string
}

interface WorkExperience {
  company: string
  position: string
  start_date: string
  end_date: string
  is_current: boolean
}

interface Education {
  university: string
  degree: string
  start_date: string
  end_date: string
}

interface UserSettings {
  openai_key?: string
  anthropic_key?: string
  preferred_ai: string
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    // Get the user from the request
    const {
      data: { user },
    } = await supabaseClient.auth.getUser()

    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Parse request body
    const { jobDescription } = await req.json()

    if (!jobDescription) {
      return new Response(
        JSON.stringify({ error: 'Job description is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Get user profile first
    const profileResponse = await supabaseClient.from('profiles').select('*').eq('user_id', user.id).single()
    
    if (!profileResponse.data) {
      return new Response(
        JSON.stringify({ error: 'Profile not found. Please complete your profile first.' }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const profile: UserProfile = profileResponse.data
    const profileId = profileResponse.data.id

    // Get work experiences, education, and settings
    const [workResponse, eduResponse, settingsResponse] = await Promise.all([
      supabaseClient.from('work_experiences').select('*').eq('profile_id', profileId).order('start_date', { ascending: false }),
      supabaseClient.from('educations').select('*').eq('profile_id', profileId).order('start_date', { ascending: false }),
      supabaseClient.from('user_settings').select('*').eq('user_id', user.id).maybeSingle()
    ])

    const workExperiences: WorkExperience[] = workResponse.data || []
    const educations: Education[] = eduResponse.data || []
    const settings: UserSettings | null = settingsResponse.data

    // Check if settings exist and have valid API keys
    if (!settings) {
      return new Response(
        JSON.stringify({ error: 'Settings not found. Please configure your AI settings first.' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    if (!settings.openai_key && !settings.anthropic_key) {
      return new Response(
        JSON.stringify({ error: 'No API key configured. Please add your OpenAI or Anthropic API key in settings.' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Validate that the preferred AI has a corresponding API key
    if (settings.preferred_ai === 'openai' && !settings.openai_key) {
      return new Response(
        JSON.stringify({ error: 'OpenAI is selected as preferred AI but no OpenAI API key is configured. Please add your OpenAI API key or switch to Anthropic.' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    if (settings.preferred_ai === 'anthropic' && !settings.anthropic_key) {
      return new Response(
        JSON.stringify({ error: 'Anthropic is selected as preferred AI but no Anthropic API key is configured. Please add your Anthropic API key or switch to OpenAI.' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Generate AI content with enhanced prompt
    const aiContent = await generateWithAI(jobDescription, profile, workExperiences, educations, settings)

    // Map work experiences with achievements
    const mappedWorkExperiences = workExperiences.map((work, index) => ({
      company: work.company,
      position: work.position,
      startDate: work.start_date,
      endDate: work.end_date,
      isCurrent: work.is_current,
      achievements: aiContent.workExperiences[index]?.achievements || []
    }))

    const result = {
      ...aiContent,
      personalInfo: profile,
      workExperiences: mappedWorkExperiences,
      educations: educations.map(edu => ({
        university: edu.university,
        degree: edu.degree,
        startDate: edu.start_date,
        endDate: edu.end_date
      }))
    }

    return new Response(
      JSON.stringify(result),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Error in generate-resume function:', error)
    
    // Provide more specific error messages based on the error type
    let errorMessage = 'Internal server error'
    let statusCode = 500

    if (error.message.includes('API key')) {
      errorMessage = 'Invalid API key. Please check your API key configuration in settings.'
      statusCode = 401
    } else if (error.message.includes('quota') || error.message.includes('rate limit')) {
      errorMessage = 'API quota exceeded or rate limit reached. Please try again later.'
      statusCode = 429
    } else if (error.message.includes('network') || error.message.includes('fetch')) {
      errorMessage = 'Network error occurred while connecting to AI service. Please try again.'
      statusCode = 503
    }

    return new Response(
      JSON.stringify({ error: errorMessage, details: error.message }),
      { 
        status: statusCode, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})

async function generateWithAI(
  jobDescription: string,
  profile: UserProfile,
  workExperiences: WorkExperience[],
  educations: Education[],
  settings: UserSettings
) {
  const prompt = createEnhancedPrompt(jobDescription, profile, workExperiences, educations)
  
  if (settings.preferred_ai === 'openai' && settings.openai_key) {
    return await generateWithOpenAI(prompt, settings.openai_key)
  } else if (settings.preferred_ai === 'anthropic' && settings.anthropic_key) {
    return await generateWithAnthropic(prompt, settings.anthropic_key)
  } else {
    // Fallback to available key
    if (settings.openai_key) {
      return await generateWithOpenAI(prompt, settings.openai_key)
    } else if (settings.anthropic_key) {
      return await generateWithAnthropic(prompt, settings.anthropic_key)
    }
  }
  
  throw new Error('No valid API key found')
}

function createEnhancedPrompt(
  jobDescription: string,
  profile: UserProfile,
  workExperiences: WorkExperience[],
  educations: Education[]
): string {
  return `Create comprehensive ATS-optimized resume achieving 95%+ score with extensive keyword matching.

JOB DESCRIPTION TO ANALYZE:
${jobDescription}

PROFILE: ${profile.name} | ${profile.email} | ${profile.phone} | ${profile.location}

WORK EXPERIENCE:
${workExperiences.map((work, i) => `${i + 1}. ${work.company} - ${work.position} (${work.start_date} to ${work.is_current ? 'Present' : work.end_date})`).join('\n')}

EDUCATION:
${educations.map(edu => `${edu.university} - ${edu.degree} (${edu.start_date} to ${edu.end_date})`).join('\n')}

COMPREHENSIVE REQUIREMENTS:

1. PROFESSIONAL TITLE & SUMMARY:
- Title: Use EXACT job title from posting + primary tech stack
- Summary: 5-6 comprehensive sentences, 160-200 words total
- Integrate 25-30 keywords naturally from job description
- Include experience level, domain expertise, technical specializations
- Highlight leadership experience and business impact
- End with value proposition using job posting language

2. DETAILED ACHIEVEMENT STRUCTURE (5 per work experience):

A) REAL-WORLD PROJECTS (2 achievements, 80-120 words each):
- Create realistic project names that align with job description requirements
- Detail your specific technical role and responsibilities
- Describe complex challenges that match job description context
- Explain comprehensive solutions using technologies from job posting
- Include quantified business impact and technical improvements
- Integrate 8-12 keywords naturally per project achievement

B) STRATEGIC ACHIEVEMENTS (3 achievements, 60-90 words each):
- Technical Excellence: Code quality, best practices, architecture, mentoring
- Collaboration & Leadership: Team management, cross-functional work, stakeholder communication
- Problem-Solving & Innovation: Process optimization, efficiency improvements, strategic initiatives

3. COMPREHENSIVE KEYWORD INTEGRATION:
- Extract ALL technical terms, frameworks, tools, methodologies from job description
- Use exact terminology and spelling from job posting
- Integrate keywords naturally with 4-6% density across all sections
- Include industry-specific language and business terminology
- Add complementary technologies that would be expected for this role

4. TECHNICAL SKILLS EXTRACTION:
- Carefully analyze job description for ALL technical requirements
- Group into 15 logical categories with comprehensive coverage
- Include programming languages, frameworks, tools, platforms, methodologies
- Add related technologies that complement job requirements
- Use EXACT terminology from job posting

CRITICAL SUCCESS FACTORS:
- Project achievements must be 80-120 words with comprehensive technical details
- Strategic achievements must be 60-90 words incorporating job description keywords
- Every technical term from job description should appear at least once
- Maintain natural language flow while achieving optimal keyword density
- Include specific metrics, percentages, and quantified outcomes
- Use industry-standard terminology and professional language

Return ONLY valid JSON:

{
  "professionalTitle": "[Exact job title from posting] | [Primary tech stack from job description]",
  "professionalSummary": "[5-6 comprehensive sentences, 160-200 words, incorporating 25-30 keywords naturally, highlighting experience level, technical expertise, leadership experience, domain knowledge, and value proposition using job posting language]",
  "workExperiences": [
    {
      "company": "${workExperiences[0]?.company || 'Company1'}",
      "achievements": [
        "[PROJECT 1: 80-120 words describing realistic project name aligned with job requirements, your specific technical role and responsibilities, complex challenges faced that match job context, comprehensive solution implementation using technologies from job posting, quantified business impact and technical improvements, naturally integrating 8-12 keywords from job description]",
        "[PROJECT 2: 80-120 words describing different realistic project relevant to job requirements, your technical leadership role and contributions, innovative challenges overcome, detailed solution architecture and implementation, measurable outcomes and business value, incorporating additional 8-12 keywords from job description naturally]",
        "[TECHNICAL EXCELLENCE: 60-90 words focusing on code quality, best practices, architecture decisions, technical mentoring, continuous learning, quality assurance, and technical leadership using terminology from job description]",
        "[COLLABORATION & LEADERSHIP: 60-90 words emphasizing team management, cross-functional collaboration, stakeholder communication, mentoring activities, project coordination, and relationship building using business language from job posting]",
        "[PROBLEM-SOLVING & INNOVATION: 60-90 words highlighting process optimization, efficiency improvements, innovative solutions, strategic thinking, automation initiatives, and continuous improvement using methodologies from job description]"
      ]
    }${workExperiences.length > 1 ? `,
    {
      "company": "${workExperiences[1]?.company || 'Company2'}",
      "achievements": [
        "[PROJECT 1: 80-120 words with comprehensive technical details and keyword integration]",
        "[PROJECT 2: 80-120 words with different project focus and extensive job description alignment]",
        "[TECHNICAL EXCELLENCE: 60-90 words with technical skills and quality focus]",
        "[COLLABORATION & LEADERSHIP: 60-90 words with teamwork and leadership emphasis]",
        "[PROBLEM-SOLVING & INNOVATION: 60-90 words with innovation and optimization focus]"
      ]
    }` : ''}${workExperiences.length > 2 ? workExperiences.slice(2).map((work) => `,
    {
      "company": "${work.company}",
      "achievements": [
        "[PROJECT 1: 80-120 words comprehensive]",
        "[PROJECT 2: 80-120 words detailed]",
        "[TECHNICAL EXCELLENCE: 60-90 words]",
        "[COLLABORATION & LEADERSHIP: 60-90 words]",
        "[PROBLEM-SOLVING & INNOVATION: 60-90 words]"
      ]
    }`).join('') : ''}
  ],
  "technicalSkills": [
    "Programming Languages: [Extract ALL programming languages from job description + complementary languages]",
    "Frontend Development: [Extract ALL frontend frameworks, libraries, and tools from job description + related technologies]",
    "Backend Technologies: [Extract ALL backend frameworks, servers, and architectures from job description + complementary systems]",
    "Database Systems: [Extract ALL database technologies, query languages, and data storage from job description + related solutions]",
    "Cloud Platforms: [Extract ALL cloud services, platforms, and infrastructure from job description + related cloud technologies]",
    "DevOps & Infrastructure: [Extract ALL DevOps tools, CI/CD, containerization from job description + automation tools]",
    "Development Tools: [Extract ALL IDEs, version control, project management tools from job description + productivity tools]",
    "Testing & Quality Assurance: [Extract ALL testing frameworks, QA tools, and quality practices from job description + related testing technologies]",
    "API Development: [Extract ALL API technologies, integration tools, and communication protocols from job description + related API solutions]",
    "Monitoring & Analytics: [Extract ALL monitoring, logging, and analytics tools from job description + observability platforms]",
    "Security & Compliance: [Extract ALL security frameworks, compliance standards, and security tools from job description + related security technologies]",
    "Data Science & Analytics: [Extract ALL data analysis, machine learning, and analytics tools from job description + related data technologies]",
    "Mobile Development: [Extract ALL mobile frameworks, platforms, and tools from job description + related mobile technologies]",
    "Emerging Technologies: [Extract ALL AI, blockchain, IoT, and emerging tech from job description + innovative tools]",
    "Methodologies & Practices: [Extract ALL development methodologies, project management, and best practices from job description + related frameworks]"
  ]
}`
}

function extractJsonFromContent(content: string): string {
  // Remove any markdown code blocks
  content = content.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '')
  
  // Find the JSON object
  const jsonStart = content.indexOf('{')
  const jsonEnd = content.lastIndexOf('}')
  
  if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
    return content.substring(jsonStart, jsonEnd + 1)
  }
  
  return content.trim()
}

async function generateWithOpenAI(prompt: string, apiKey: string) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: 'You are an expert ATS resume optimization specialist. Create comprehensive resumes with exactly 2 detailed project achievements (80-120 words each) and 3 strategic achievements (60-90 words each) per work experience. Extract ALL real technology names from job descriptions and integrate them naturally. Focus on extensive keyword matching while maintaining professional language flow. Return ONLY valid JSON without markdown formatting.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 3800 // Optimized for comprehensive responses
    })
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(`OpenAI API error: ${response.status} ${response.statusText} - ${errorData.error?.message || 'Unknown error'}`)
  }

  const data = await response.json()
  const content = data.choices[0].message.content
  
  try {
    const jsonContent = extractJsonFromContent(content)
    return JSON.parse(jsonContent)
  } catch (error) {
    console.error('Failed to parse OpenAI response:', content)
    throw new Error('Invalid response from AI service - unable to parse JSON')
  }
}

async function generateWithAnthropic(prompt: string, apiKey: string) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-3-haiku-20240307',
      max_tokens: 3800, // Optimized for comprehensive responses
      messages: [
        {
          role: 'user',
          content: `${prompt}

CRITICAL INSTRUCTIONS:
- Return ONLY valid JSON without markdown formatting or code blocks
- Extract ALL real technology names from job description - never use placeholder text
- Create exactly 2 comprehensive project achievements (80-120 words each) with realistic project names, detailed roles, challenges, solutions, and quantified impact
- Include 3 strategic achievements (60-90 words each) focusing on technical excellence, collaboration/leadership, and problem-solving
- Integrate 25-30 keywords naturally throughout all sections
- Achieve 95%+ ATS score through extensive keyword matching and professional language
- Response must start with { and end with }`
        }
      ]
    })
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(`Anthropic API error: ${response.status} ${response.statusText} - ${errorData.error?.message || 'Unknown error'}`)
  }

  const data = await response.json()
  const content = data.content[0].text
  
  try {
    const jsonContent = extractJsonFromContent(content)
    return JSON.parse(jsonContent)
  } catch (error) {
    console.error('Failed to parse Anthropic response:', content)
    throw new Error('Invalid response from AI service - unable to parse JSON')
  }
}