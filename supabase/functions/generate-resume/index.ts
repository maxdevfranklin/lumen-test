/*
  # Enhanced ATS Resume Generation for ALL Work Experiences

  This edge function creates ATS-optimized resumes by:
  1. Generating exactly 2 detailed real-world projects per ALL work experiences (80-120 words each)
  2. Adding 3 comprehensive strategic achievements for ALL companies (60-90 words each)
  3. Extensive keyword extraction and natural integration from job descriptions
  4. Comprehensive technical skills with ALL keywords from job description
  5. Optimized token usage to stay within GPT-3.5 and Anthropic limits
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
  const prompt = createOptimizedPrompt(jobDescription, profile, workExperiences, educations)
  
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

function createOptimizedPrompt(
  jobDescription: string,
  profile: UserProfile,
  workExperiences: WorkExperience[],
  educations: Education[]
): string {
  // Create dynamic work experience sections for ALL companies
  const workExperiencePrompt = workExperiences.map((work, index) => `
    {
      "company": "${work.company}",
      "achievements": [
        "[PROJECT 1: 80-120 words describing realistic project name aligned with job requirements, your specific technical role, complex challenges, comprehensive solution using job description technologies, quantified impact, naturally integrating 8-12 keywords]",
        "[PROJECT 2: 80-120 words describing different realistic project relevant to job requirements, your technical leadership role, innovative challenges, detailed solution architecture, measurable outcomes, incorporating additional 8-12 keywords naturally]",
        "[TECHNICAL EXCELLENCE: 60-90 words focusing on code quality, best practices, architecture, technical mentoring, continuous learning, quality assurance using job description terminology]",
        "[COLLABORATION & LEADERSHIP: 60-90 words emphasizing team management, cross-functional collaboration, stakeholder communication, mentoring, project coordination using business language from job posting]",
        "[PROBLEM-SOLVING & INNOVATION: 60-90 words highlighting process optimization, efficiency improvements, innovative solutions, strategic thinking, automation using methodologies from job description]"
      ]
    }${index < workExperiences.length - 1 ? ',' : ''}`).join('')

  return `Create comprehensive ATS-optimized resume achieving 95%+ score with extensive keyword matching for ALL work experiences.

JOB DESCRIPTION TO ANALYZE:
${jobDescription}

PROFILE: ${profile.name} | ${profile.email} | ${profile.phone} | ${profile.location}

WORK EXPERIENCES (Generate for ALL ${workExperiences.length} companies):
${workExperiences.map((work, i) => `${i + 1}. ${work.company} - ${work.position} (${work.start_date} to ${work.is_current ? 'Present' : work.end_date})`).join('\n')}

EDUCATION:
${educations.map(edu => `${edu.university} - ${edu.degree} (${edu.start_date} to ${edu.end_date})`).join('\n')}

REQUIREMENTS:

1. PROFESSIONAL TITLE & SUMMARY:
- Title: Use EXACT job title + primary tech stack from job description
- Summary: 5-6 sentences, 160-200 words, integrate 25-30 keywords naturally
- Include experience level, domain expertise, leadership experience, value proposition

2. ACHIEVEMENT STRUCTURE (5 per ALL work experiences):
- 2 REAL-WORLD PROJECTS (80-120 words each): Realistic project names, technical roles, challenges, solutions, quantified impact, 8-12 keywords each
- 3 STRATEGIC ACHIEVEMENTS (60-90 words each): Technical Excellence, Collaboration & Leadership, Problem-Solving & Innovation

3. COMPREHENSIVE TECHNICAL SKILLS:
- Extract ALL technical terms, frameworks, tools, methodologies from job description
- Use EXACT terminology and spelling from job posting
- Group into 12 logical categories with comprehensive coverage
- Include complementary technologies expected for this role
- NO placeholder text - only real technology names

CRITICAL: Generate achievements for ALL ${workExperiences.length} work experiences. Each company must have exactly 5 achievements.

Return ONLY valid JSON:

{
  "professionalTitle": "[Exact job title from posting] | [Primary tech stack from job description]",
  "professionalSummary": "[5-6 comprehensive sentences, 160-200 words, incorporating 25-30 keywords naturally from job description, highlighting experience level, technical expertise, leadership experience, domain knowledge, and value proposition using job posting language]",
  "workExperiences": [${workExperiencePrompt}
  ],
  "technicalSkills": [
    "Programming Languages: [Extract ALL programming languages from job description + complementary languages like JavaScript, Python, Java, TypeScript, C#, Go, Rust, etc.]",
    "Frontend Development: [Extract ALL frontend frameworks and tools from job description + related technologies like React, Vue.js, Angular, HTML5, CSS3, SASS, Bootstrap, Material-UI, etc.]",
    "Backend Technologies: [Extract ALL backend frameworks and architectures from job description + complementary systems like Node.js, Express.js, Django, Spring Boot, .NET Core, FastAPI, etc.]",
    "Database Systems: [Extract ALL database technologies from job description + related solutions like PostgreSQL, MongoDB, MySQL, Redis, Elasticsearch, DynamoDB, etc.]",
    "Cloud Platforms: [Extract ALL cloud services from job description + related technologies like AWS, Azure, Google Cloud, Docker, Kubernetes, Terraform, etc.]",
    "DevOps & Infrastructure: [Extract ALL DevOps tools from job description + automation tools like Jenkins, GitLab CI, GitHub Actions, Ansible, Chef, Puppet, etc.]",
    "Development Tools: [Extract ALL development tools from job description + productivity tools like Git, VS Code, IntelliJ, Jira, Confluence, Slack, etc.]",
    "Testing & Quality Assurance: [Extract ALL testing frameworks from job description + related testing technologies like Jest, Cypress, Selenium, JUnit, PyTest, etc.]",
    "API Development: [Extract ALL API technologies from job description + related solutions like REST, GraphQL, gRPC, OpenAPI, Postman, Swagger, etc.]",
    "Monitoring & Analytics: [Extract ALL monitoring tools from job description + observability platforms like Prometheus, Grafana, New Relic, DataDog, Splunk, etc.]",
    "Security & Compliance: [Extract ALL security frameworks from job description + related security technologies like OAuth, JWT, SSL/TLS, OWASP, SOC2, etc.]",
    "Methodologies & Practices: [Extract ALL development methodologies from job description + related frameworks like Agile, Scrum, Kanban, DevOps, TDD, CI/CD, etc.]"
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
          content: 'You are an expert ATS resume optimization specialist. Create comprehensive resumes with exactly 2 detailed project achievements (80-120 words each) and 3 strategic achievements (60-90 words each) for ALL work experiences. Extract ALL real technology names from job descriptions and integrate them naturally. Generate achievements for every single company in work history. Return ONLY valid JSON without markdown formatting.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 3500 // Optimized to stay within GPT-3.5 limits
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
      max_tokens: 3500, // Optimized to stay within Anthropic limits
      messages: [
        {
          role: 'user',
          content: `${prompt}

CRITICAL INSTRUCTIONS:
- Return ONLY valid JSON without markdown formatting or code blocks
- Extract ALL real technology names from job description - never use placeholder text
- Generate exactly 5 achievements for EVERY work experience (2 projects + 3 strategic)
- Create comprehensive project achievements (80-120 words each) with realistic project names
- Include strategic achievements (60-90 words each) for technical excellence, collaboration, and innovation
- Integrate 25-30 keywords naturally throughout all sections
- Technical skills must contain ALL technologies from job description
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