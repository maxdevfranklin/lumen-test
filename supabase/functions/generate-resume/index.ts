/*
  # ATS-Optimized Resume Generation with 95%+ Score

  This edge function creates ATS-optimized resumes by:
  1. Using strategic keyword density (2-4% for primary keywords)
  2. Extracting REAL technical skills from job descriptions
  3. Creating natural language flow that passes ATS parsing
  4. Balancing keyword optimization with readability
  5. Using industry-standard formatting and terminology
  6. Implementing semantic keyword matching

  ## Key ATS Improvements
  - Primary keywords appear 3-5 times across sections
  - Technical skills extracted directly from job posting
  - Natural language integration prevents keyword stuffing
  - Industry-specific terminology and context
  - Proper section headers and formatting
  - Quantified achievements with relevant metrics
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

    // Generate AI content with ATS optimization
    const aiContent = await generateWithAI(jobDescription, profile, workExperiences, educations, settings)

    // Map work experiences with achievements - ensure each work experience gets its achievements
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
  const prompt = createATSOptimizedPrompt(jobDescription, profile, workExperiences, educations)
  
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

function createATSOptimizedPrompt(
  jobDescription: string,
  profile: UserProfile,
  workExperiences: WorkExperience[],
  educations: Education[]
): string {
  return `
You are an expert ATS optimization specialist with 99.2% success rate. Create a resume that achieves 95%+ ATS score through strategic keyword integration and natural language flow.

JOB DESCRIPTION TO ANALYZE:
${jobDescription}

USER PROFILE:
Name: ${profile.name}
Email: ${profile.email}
Phone: ${profile.phone}
Location: ${profile.location}

WORK EXPERIENCES:
${workExperiences.map((work, index) => `
${index + 1}. ${work.company} - ${work.position}
   Duration: ${work.start_date} to ${work.is_current ? 'Present' : work.end_date}
`).join('\n')}

EDUCATION:
${educations.map(edu => `
- ${edu.university} - ${edu.degree} (${edu.start_date} to ${edu.end_date})
`).join('\n')}

ATS OPTIMIZATION STRATEGY (95%+ Score Target):

1. KEYWORD EXTRACTION & DENSITY:
   - Extract ALL technical skills, tools, frameworks, languages from job description
   - Primary keywords: 3-5 mentions across sections
   - Secondary keywords: 2-3 mentions
   - Long-tail keywords: 1-2 strategic placements
   - Maintain 2-4% keyword density for optimal ATS parsing

2. PROFESSIONAL TITLE:
   - Use EXACT job title from posting
   - Add 1-2 primary technical keywords
   - Format: "[Exact Job Title] | [Primary Tech Stack]"

3. PROFESSIONAL SUMMARY (ATS Critical Section):
   - 4-5 sentences, 120-150 words total
   - Include 15-20 keywords naturally
   - Start with years of experience + exact job title
   - Include top 3 technical skills from job description
   - Mention industry/domain from job posting
   - End with value proposition using job description language

4. WORK EXPERIENCE ACHIEVEMENTS:
   Generate exactly 6 achievements per position:
   
   ACHIEVEMENT TYPES:
   A) Technical Implementation (2 achievements):
   - Focus on specific technologies mentioned in job description
   - Include metrics and technical details
   - Use action verbs from job posting
   
   B) Leadership & Collaboration (2 achievements):
   - Incorporate soft skills from job description
   - Include team size, stakeholder management
   - Use business impact language from posting
   
   C) Process & Innovation (2 achievements):
   - Focus on methodologies mentioned in job description
   - Include efficiency gains and improvements
   - Use industry-specific terminology

5. TECHNICAL SKILLS EXTRACTION:
   CRITICAL: Extract REAL technologies from job description
   
   STEP-BY-STEP PROCESS:
   a) Scan job description for technical terms
   b) Identify programming languages, frameworks, tools, platforms
   c) Group into logical categories
   d) Add complementary skills for each category
   e) Use exact terminology from job posting
   
   NEVER use placeholder text like "[Extract from JD]"
   ALWAYS provide specific technology names

6. ATS PARSING OPTIMIZATION:
   - Use standard section headers: "PROFESSIONAL EXPERIENCE", "TECHNICAL SKILLS", "EDUCATION"
   - Include exact job title matches
   - Use consistent date formatting
   - Include location information
   - Use bullet points for achievements
   - Maintain clean, parseable structure

7. SEMANTIC KEYWORD MATCHING:
   - Include synonyms and related terms
   - Use industry-standard terminology
   - Include certification names if mentioned
   - Add methodology keywords (Agile, Scrum, etc.)
   - Include soft skill variations

CRITICAL SUCCESS FACTORS:
- Every keyword from job description appears at least once
- Primary keywords appear 3-5 times naturally
- Technical skills section contains REAL technologies
- Achievements use action verbs from job posting
- Language matches job description tone and terminology
- No keyword stuffing - natural integration only

Generate exactly 6 achievements for ALL ${workExperiences.length} work experiences.

Return ONLY valid JSON without markdown formatting:

{
  "professionalTitle": "[Exact Job Title from Posting] | [Primary Tech Stack from JD]",
  "professionalSummary": "[4-5 sentences, 120-150 words, incorporating 15-20 keywords from job description naturally, starting with experience level and exact job title, including top technical skills, industry domain, and value proposition using job posting language]",
  "workExperiences": [
    {
      "company": "${workExperiences[0]?.company || 'Company1'}",
      "achievements": [
        "[Technical achievement using specific technologies from job description, including metrics and implementation details, 45-60 words]",
        "[Technical achievement focusing on different technologies from job description, with measurable outcomes, 45-60 words]",
        "[Leadership achievement incorporating soft skills from job description, including team size and stakeholder impact, 45-60 words]",
        "[Collaboration achievement using business language from job posting, focusing on cross-functional work, 45-60 words]",
        "[Process improvement achievement using methodologies from job description, with efficiency metrics, 45-60 words]",
        "[Innovation achievement incorporating industry terminology from job posting, with business value, 45-60 words]"
      ]
    }${workExperiences.length > 1 ? `,
    {
      "company": "${workExperiences[1]?.company || 'Company2'}",
      "achievements": [
        "[Technical achievement using specific technologies from job description, including metrics and implementation details, 45-60 words]",
        "[Technical achievement focusing on different technologies from job description, with measurable outcomes, 45-60 words]",
        "[Leadership achievement incorporating soft skills from job description, including team size and stakeholder impact, 45-60 words]",
        "[Collaboration achievement using business language from job posting, focusing on cross-functional work, 45-60 words]",
        "[Process improvement achievement using methodologies from job description, with efficiency metrics, 45-60 words]",
        "[Innovation achievement incorporating industry terminology from job posting, with business value, 45-60 words]"
      ]
    }` : ''}${workExperiences.length > 2 ? workExperiences.slice(2).map((work) => `,
    {
      "company": "${work.company}",
      "achievements": [
        "[Technical achievement using specific technologies from job description, including metrics and implementation details, 45-60 words]",
        "[Technical achievement focusing on different technologies from job description, with measurable outcomes, 45-60 words]",
        "[Leadership achievement incorporating soft skills from job description, including team size and stakeholder impact, 45-60 words]",
        "[Collaboration achievement using business language from job posting, focusing on cross-functional work, 45-60 words]",
        "[Process improvement achievement using methodologies from job description, with efficiency metrics, 45-60 words]",
        "[Innovation achievement incorporating industry terminology from job posting, with business value, 45-60 words]"
      ]
    }`).join('') : ''}
  ],
  "technicalSkills": [
    "Programming Languages: [List ACTUAL languages from job description like JavaScript, Python, Java, etc.]",
    "Frontend Technologies: [List ACTUAL frontend tools from job description like React, Angular, Vue, etc.]",
    "Backend Technologies: [List ACTUAL backend tools from job description like Node.js, Django, Spring, etc.]",
    "Databases: [List ACTUAL database systems from job description like PostgreSQL, MongoDB, MySQL, etc.]",
    "Cloud Platforms: [List ACTUAL cloud services from job description like AWS, Azure, GCP, etc.]",
    "DevOps Tools: [List ACTUAL DevOps tools from job description like Docker, Kubernetes, Jenkins, etc.]",
    "Development Tools: [List ACTUAL development tools from job description like Git, VS Code, IntelliJ, etc.]",
    "Testing Frameworks: [List ACTUAL testing tools from job description like Jest, Cypress, Selenium, etc.]",
    "APIs & Integration: [List ACTUAL API technologies from job description like REST, GraphQL, WebSocket, etc.]",
    "Monitoring & Analytics: [List ACTUAL monitoring tools from job description like New Relic, DataDog, etc.]",
    "Security Tools: [List ACTUAL security frameworks from job description like OAuth, JWT, HTTPS, etc.]",
    "Data Technologies: [List ACTUAL data tools from job description like Pandas, NumPy, Tableau, etc.]",
    "Mobile Technologies: [List ACTUAL mobile tools from job description like React Native, Flutter, etc.]",
    "Emerging Technologies: [List ACTUAL emerging tech from job description like AI/ML, Blockchain, etc.]",
    "Methodologies: [List ACTUAL methodologies from job description like Agile, Scrum, TDD, CI/CD, etc.]"
  ]
}

CRITICAL: Extract REAL technology names from the job description. Never use placeholder text. Achieve 95%+ ATS score through strategic keyword placement and natural language integration.
`
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
          content: 'You are an expert ATS optimization specialist with 99.2% success rate. Create resumes that achieve 95%+ ATS scores through strategic keyword integration, natural language flow, and proper technical skill extraction. CRITICAL: Always extract REAL technology names from job descriptions - never use placeholder text like "[Extract from JD]" or "[List from job description]". Focus on achieving optimal keyword density (2-4%) while maintaining readability. Return ONLY valid JSON without any markdown formatting.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3, // Lower temperature for more consistent, focused output
      max_tokens: 4000
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
      max_tokens: 4000,
      messages: [
        {
          role: 'user',
          content: `${prompt}

CRITICAL INSTRUCTIONS:
- Return ONLY valid JSON without any markdown formatting, code blocks, or additional text
- Extract REAL technology names from the job description - never use placeholder text
- Achieve 95%+ ATS score through strategic keyword placement
- Maintain 2-4% keyword density for optimal parsing
- Use natural language integration to avoid keyword stuffing
- The response must start with { and end with }`
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