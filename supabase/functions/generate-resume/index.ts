/*
  # Enhanced Job-Focused Resume Generation

  This edge function creates highly targeted, keyword-optimized resumes by:
  1. Analyzing job description for domain, role, and key requirements
  2. Generating domain-specific project names and technical content
  3. Maximum keyword integration while maintaining natural language
  4. Adaptive content based on job type (frontend, backend, fullstack, data, etc.)
  5. Optimized for token limits while maximizing content quality
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

    // Generate AI content with enhanced job-focused prompt
    const aiContent = await generateWithAI(jobDescription, profile, workExperiences, educations, settings)

    // Map work experiences with achievements - ensure ALL companies get achievements
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
  const prompt = createJobFocusedPrompt(jobDescription, profile, workExperiences, educations)
  
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

function createJobFocusedPrompt(
  jobDescription: string,
  profile: UserProfile,
  workExperiences: WorkExperience[],
  educations: Education[]
): string {
  return `You are an expert ATS resume writer. Create a highly targeted resume that maximizes keyword matching with the job description while maintaining natural, professional language.

JOB DESCRIPTION:
${jobDescription}

CANDIDATE PROFILE:
Name: ${profile.name}
Contact: ${profile.email} | ${profile.phone} | ${profile.location}

WORK HISTORY:
${workExperiences.map((work, i) => `${i + 1}. ${work.company} - ${work.position} (${work.start_date} to ${work.is_current ? 'Present' : work.end_date})`).join('\n')}

EDUCATION:
${educations.map(edu => `${edu.university} - ${edu.degree} (${edu.start_date} to ${edu.end_date})`).join('\n')}

CRITICAL REQUIREMENTS:

1. PROFESSIONAL TITLE: Use the exact job title from the posting + 2-3 key technologies mentioned

2. PROFESSIONAL SUMMARY: Write 6-7 comprehensive sentences (180-220 words) that:
   - Mirror the job description's language and requirements
   - Include ALL major keywords and technologies mentioned
   - Highlight relevant experience years and domain expertise
   - Mention specific methodologies, frameworks, and tools from the posting
   - Sound natural while maximizing keyword density

3. WORK ACHIEVEMENTS: For each company, create exactly 5 achievements:
   
   Achievement 1 (90-130 words): Real-world project that directly aligns with job requirements
   - Create a specific project name that matches the job domain (e.g., "CustomerAnalytics Platform" for data roles, "E-commerce Checkout System" for frontend roles)
   - Include exact technologies, frameworks, and tools mentioned in job description
   - Describe scope, challenges, solutions, and quantified business impact
   - Use terminology and language patterns from the job posting
   
   Achievement 2 (90-130 words): Another domain-specific project
   - Different project name but still aligned with job requirements
   - Focus on different technologies/skills mentioned in the posting
   - Include team collaboration, methodologies, and technical leadership
   - Quantified results and business value
   
   Achievement 3 (70-90 words): Technical excellence and problem-solving
   - Highlight specific technical skills mentioned in job description
   - Architecture, code quality, innovation, best practices
   - Technical mentoring and knowledge sharing
   
   Achievement 4 (70-90 words): Collaboration and leadership
   - Cross-functional work, stakeholder management
   - Communication skills, team leadership
   - Project management and delivery excellence
   
   Achievement 5 (70-90 words): Process improvement and strategic impact
   - Methodologies and frameworks mentioned in job posting
   - Efficiency improvements, innovation initiatives
   - Strategic thinking and business impact

4. TECHNICAL SKILLS: Extract ALL technologies from job description and organize into 15 comprehensive categories. Add related/similar technologies to maximize keyword coverage.

DOMAIN ADAPTATION RULES:
- Frontend roles: Focus on UI/UX, responsive design, user experience projects
- Backend roles: Emphasize APIs, databases, system architecture, scalability
- Full-stack roles: Balance frontend and backend projects with integration focus
- Data roles: Highlight analytics platforms, data pipelines, ML/AI projects
- DevOps roles: Focus on infrastructure, automation, deployment projects
- Mobile roles: Emphasize mobile apps, cross-platform development
- Security roles: Highlight security frameworks, compliance, threat analysis

KEYWORD INTEGRATION STRATEGY:
- Use exact phrases from job description when possible
- Include synonyms and related terms for broader coverage
- Maintain natural sentence flow while maximizing keyword density
- Repeat important keywords across different sections
- Use industry-standard terminology that matches the posting

Return ONLY this JSON structure:

{
  "professionalTitle": "Exact job title + key technologies from posting",
  "professionalSummary": "6-7 comprehensive sentences (180-220 words) with maximum keyword integration from job description",
  "workExperiences": [
    {
      "company": "${workExperiences[0]?.company || 'Company1'}",
      "achievements": [
        "90-130 word sentence describing domain-specific project with exact project name, technologies from job description, scope, challenges, solutions, and quantified results",
        "90-130 word sentence about different project using other technologies from posting, team collaboration, technical leadership, and business impact",
        "70-90 word sentence highlighting technical excellence and specific skills mentioned in job description",
        "70-90 word sentence showcasing collaboration, leadership, and communication skills from job requirements",
        "70-90 word sentence emphasizing process improvement and strategic impact using methodologies from posting"
      ]
    }${workExperiences.length > 1 ? `,
    {
      "company": "${workExperiences[1]?.company || 'Company2'}",
      "achievements": [
        "90-130 word sentence describing domain-specific project with exact project name, technologies from job description, scope, challenges, solutions, and quantified results",
        "90-130 word sentence about different project using other technologies from posting, team collaboration, technical leadership, and business impact",
        "70-90 word sentence highlighting technical excellence and specific skills mentioned in job description",
        "70-90 word sentence showcasing collaboration, leadership, and communication skills from job requirements",
        "70-90 word sentence emphasizing process improvement and strategic impact using methodologies from posting"
      ]
    }` : ''}${workExperiences.length > 2 ? workExperiences.slice(2).map((work) => `,
    {
      "company": "${work.company}",
      "achievements": [
        "90-130 word sentence describing domain-specific project with exact project name, technologies from job description, scope, challenges, solutions, and quantified results",
        "90-130 word sentence about different project using other technologies from posting, team collaboration, technical leadership, and business impact",
        "70-90 word sentence highlighting technical excellence and specific skills mentioned in job description",
        "70-90 word sentence showcasing collaboration, leadership, and communication skills from job requirements",
        "70-90 word sentence emphasizing process improvement and strategic impact using methodologies from posting"
      ]
    }`).join('') : ''}
  ],
  "technicalSkills": [
    "Programming Languages: ALL languages from job description + related languages",
    "Frontend Technologies: ALL frontend tech from posting + related frameworks",
    "Backend Technologies: ALL backend tech from posting + related frameworks",
    "Database Systems: ALL databases from posting + related data technologies",
    "Cloud Platforms: ALL cloud services from posting + related cloud tech",
    "DevOps & Infrastructure: ALL DevOps tools from posting + related automation",
    "Development Tools: ALL dev tools from posting + related productivity tools",
    "Testing & Quality: ALL testing frameworks from posting + related QA tools",
    "API & Integration: ALL API tech from posting + related protocols",
    "Monitoring & Analytics: ALL monitoring tools from posting + related platforms",
    "Security & Compliance: ALL security frameworks from posting + related tools",
    "Data & Analytics: ALL data tools from posting + related analytics tech",
    "Mobile Development: ALL mobile tech from posting + related frameworks",
    "Emerging Technologies: ALL emerging tech from posting + related innovations",
    "Methodologies: ALL methodologies from posting + related practices"
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
          content: 'You are an expert ATS resume writer specializing in keyword optimization. Create natural, professional content that maximizes job description keyword matching. Focus on domain-specific projects with exact project names, comprehensive technical details, and quantified business results. Maintain current sentence lengths (90-130 words for projects, 70-90 words for other achievements). Extract ALL technologies from job descriptions and add related technologies for comprehensive keyword coverage.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 3200
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
      max_tokens: 3200,
      messages: [
        {
          role: 'user',
          content: `${prompt}

CRITICAL INSTRUCTIONS:
- Analyze job description domain and adapt project names accordingly
- Use exact keywords and phrases from job description throughout content
- Create realistic, domain-specific project names that align with job requirements
- Maintain current sentence lengths: 90-130 words for projects, 70-90 words for other achievements
- Extract ALL technologies from job description and add comprehensive related technologies
- Ensure natural language flow while maximizing keyword density
- Return ONLY valid JSON with no additional text or formatting`
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