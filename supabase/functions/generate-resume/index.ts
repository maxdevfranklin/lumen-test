/*
  # Enhanced Job-Focused Resume Generation with Perfect First Achievement

  This edge function creates highly targeted, keyword-optimized resumes by:
  1. Creating a perfect first achievement that 100% matches job description
  2. Making it unique and attractive to recruiters
  3. Maintaining natural language flow
  4. Keeping other achievements unchanged
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
        JSON.stringify({ error: 'Anthropic is selected as preferred AI but no Anthropic API key is configured. Please add your Anthropic API key or switch to Anthropic.' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Generate AI content with perfect first achievement focus
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
  const prompt = createPerfectFirstAchievementPrompt(jobDescription, profile, workExperiences, educations)
  
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

function createPerfectFirstAchievementPrompt(
  jobDescription: string,
  profile: UserProfile,
  workExperiences: WorkExperience[],
  educations: Education[]
): string {
  return `Expert ATS resume writer: Create a perfect first achievement that 100% matches the job description and attracts recruiters.

JOB DESCRIPTION:
${jobDescription}

CANDIDATE:
${profile.name} | ${profile.email} | ${profile.phone} | ${profile.location}

WORK HISTORY:
${workExperiences.map((work, i) => `${i + 1}. ${work.company} - ${work.position} (${work.start_date} to ${work.is_current ? 'Present' : work.end_date})`).join('\n')}

EDUCATION:
${educations.map(edu => `${edu.university} - ${edu.degree} (${edu.start_date} to ${edu.end_date})`).join('\n')}

CRITICAL INSTRUCTIONS:

1. PROFESSIONAL TITLE: Exact job title from posting + 2-3 primary technologies mentioned

2. PROFESSIONAL SUMMARY: 6-7 comprehensive sentences (200-250 words) with maximum keyword density from job description

3. FIRST ACHIEVEMENT FOCUS (MOST IMPORTANT):
For ${workExperiences[0]?.company || 'First Company'} - Achievement 1:
- Create a PERFECT project name that directly aligns with the job description domain
- Write 90-110 words (not too long, not too short)
- Include the TOP 5-7 most important keywords/technologies from the job description
- Make it sound realistic and impressive to recruiters
- Include specific metrics and business impact
- Use natural, professional language that flows well
- Focus on the exact skills and technologies the job requires
- Make it unique and memorable

4. OTHER ACHIEVEMENTS (Keep current structure):
- Achievement 2: 90-120 words - Different project focus
- Achievement 3: 70-90 words - Technical excellence
- Achievement 4: 70-90 words - Collaboration/leadership
- Achievement 5: 70-90 words - Process improvement

5. TECHNICAL SKILLS: Extract ALL technologies from job description + add comprehensive related technologies. Create 15 detailed categories and don't make N/A or blink ones. Make at least 4 skills in each items.

DOMAIN ADAPTATION STRATEGY:
1. Analyze the job description to identify the primary domain and key technologies
2. Create a project name that perfectly fits the job requirements
3. Use the exact terminology and language from the job posting
4. Focus on the most important 5-7 keywords rather than trying to fit everything
5. Make it sound realistic and achievable
6. Include impressive but believable metrics

FIRST ACHIEVEMENT REQUIREMENTS:
- 90-110 words (perfect length)
- Include TOP 5-7 keywords from job description
- Realistic project name that matches job domain
- Specific metrics and business impact
- Natural, professional language
- Unique and memorable content
- 100% alignment with job requirements

Return ONLY this JSON:

{
  "professionalTitle": "Exact job title from posting with primary technologies",
  "professionalSummary": "6-7 comprehensive sentences (200-250 words) integrating maximum keywords from job description naturally while highlighting years of experience, technical expertise, industry knowledge, leadership capabilities, and unique value proposition that directly matches job requirements",
  "workExperiences": [
    {
      "company": "${workExperiences[0]?.company || 'Company1'}",
      "achievements": [
        "PERFECT FIRST ACHIEVEMENT: 90-110 word sentence describing a specific project that perfectly aligns with job requirements, using a realistic project name that matches the job domain, incorporating the TOP 5-7 most important keywords and technologies from the job description, including specific scope and user metrics, highlighting key technical implementations and solutions, demonstrating team collaboration and leadership, and showcasing quantified business results with impressive but believable metrics that directly relate to the value this role would bring to the hiring company",
        "90-120 word detailed sentence about another significant project highlighting different technologies and skills from job posting, your technical leadership role in system design and implementation, comprehensive problem-solving approaches, innovative solutions and methodologies, extensive cross-functional collaboration with various stakeholders, measurable impact on business metrics and performance improvements, strategic value delivered to the organization, and long-term business benefits",
        "70-90 word professional sentence emphasizing technical excellence, advanced architecture decisions, code quality standards, innovation initiatives, best practices implementation, technical mentoring and knowledge sharing, continuous learning and skill development, advanced problem-solving skills, and technical leadership that directly aligns with technical requirements mentioned in job description",
        "70-90 word comprehensive sentence showcasing collaboration excellence, team leadership capabilities, stakeholder management skills, cross-functional coordination and communication, effective project management and delivery, conflict resolution and relationship building, mentoring and team development, and leadership qualities that demonstrate soft skills and management abilities mentioned in job description",
        "70-90 word detailed sentence highlighting process improvements, strategic initiatives, methodology implementation and optimization, efficiency improvements and innovation projects, transformational changes and business impact, strategic thinking and planning, value-add capabilities and business acumen, and organizational impact that demonstrates strategic value mentioned in job posting requirements"
      ]
    }${workExperiences.length > 1 ? `,
    {
      "company": "${workExperiences[1]?.company || 'Company2'}",
      "achievements": [
        "90-120 word comprehensive sentence describing domain-specific project with exact project name, technologies from job description, detailed scope, challenges, solutions, and quantified results",
        "90-120 word detailed sentence about different project using other technologies from posting, technical leadership, collaboration, and business impact",
        "70-90 word sentence highlighting technical excellence and specific skills mentioned in job description",
        "70-90 word sentence showcasing collaboration, leadership, and communication skills from job requirements",
        "70-90 word sentence emphasizing process improvement and strategic impact using methodologies from posting"
      ]
    }` : ''}${workExperiences.length > 2 ? workExperiences.slice(2).map((work) => `,
    {
      "company": "${work.company}",
      "achievements": [
        "90-120 word comprehensive sentence describing domain-specific project with exact project name, technologies from job description, detailed scope, challenges, solutions, and quantified results",
        "90-120 word detailed sentence about different project using other technologies from posting, technical leadership, collaboration, and business impact",
        "70-90 word sentence highlighting technical excellence and specific skills mentioned in job description",
        "70-90 word sentence showcasing collaboration, leadership, and communication skills from job requirements",
        "70-90 word sentence emphasizing process improvement and strategic impact using methodologies from posting"
      ]
    }`).join('') : ''}
  ],
  "technicalSkills": [
    "Programming Languages: Extract ALL programming languages from job description and add at least 4 comprehensive related languages and frameworks",
    "Frontend Development: Extract ALL frontend technologies from posting and add at least 4 extensive related frameworks, libraries, and tools",
    "Backend Technologies: Extract ALL backend frameworks from posting and add at least 4 comprehensive related server technologies and architectures",
    "Database Systems: Extract ALL database technologies from posting and add at least 4 extensive related data management tools and platforms",
    "Cloud Platforms: Extract ALL cloud services from posting and add at least 4 comprehensive related cloud technologies and services",
    "DevOps & Infrastructure: Extract ALL DevOps tools from posting and add at least 4 extensive related automation and infrastructure technologies",
    "Development Tools: Extract ALL development tools from posting and add at least 4 comprehensive related productivity and collaboration tools",
    "Testing & Quality Assurance: Extract ALL testing frameworks from posting and add at least 4 extensive related QA tools and methodologies",
    "API Development: Extract ALL API technologies from posting and add at least 4 comprehensive related integration protocols and tools",
    "Monitoring & Analytics: Extract ALL monitoring tools from posting and add at least 4 extensive related observability and analytics platforms",
    "Security & Compliance: Extract ALL security frameworks from posting and add at least 4 comprehensive related security tools and practices",
    "Data Science & Analytics: Extract ALL data tools from posting and add at least 4 extensive related analytics and machine learning technologies",
    "Mobile Development: Extract ALL mobile technologies from posting and add at least 4 comprehensive related mobile frameworks and tools",
    "Emerging Technologies: Extract ALL emerging tech from posting and add at least 4 extensive related innovative tools and platforms",
    "Methodologies & Practices: Extract ALL methodologies from posting and add at least 4 comprehensive related development practices and frameworks"
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
          content: 'You are an expert ATS resume writer. Your specialty is creating the PERFECT first achievement that 100% matches job descriptions and attracts recruiters. Focus on creating a realistic, impressive project (90-110 words) that uses the TOP 5-7 keywords from the job description naturally. Make it unique, memorable, and professionally compelling. The first achievement is the MOST IMPORTANT - it must perfectly align with what the job requires while sounding natural and achievable.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 3500
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
      max_tokens: 3500,
      messages: [
        {
          role: 'user',
          content: `${prompt}

CRITICAL FOCUS FOR FIRST ACHIEVEMENT:
- Write exactly 90-110 words (perfect length for readability)
- Use only the TOP 5-7 most important keywords from job description
- Create a realistic project name that perfectly matches the job domain
- Include specific, believable metrics and business impact
- Make it sound natural and professional, not keyword-stuffed
- Focus on what makes this candidate perfect for THIS specific job
- Make it unique and memorable to stand out to recruiters

The first achievement is the MOST IMPORTANT part of the entire resume. It must be perfect.

Return ONLY valid JSON with no additional text or formatting.`
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