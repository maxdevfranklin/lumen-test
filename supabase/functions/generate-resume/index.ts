/*
  # Comprehensive Keyword-Rich Resume Generation

  This edge function creates detailed, keyword-optimized resumes by:
  1. Generating 2 comprehensive real-world projects (80-120 words each)
  2. Adding 3 strategic achievements covering collaboration, problem-solving (60-80 words each)
  3. Maximum keyword integration from job descriptions
  4. Comprehensive technical skills extraction with similar technologies
  5. Optimized for GPT-3.5 and Anthropic token limits
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

    // Generate AI content with comprehensive keyword-rich prompt
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
  const prompt = createComprehensivePrompt(jobDescription, profile, workExperiences, educations)
  
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

function createComprehensivePrompt(
  jobDescription: string,
  profile: UserProfile,
  workExperiences: WorkExperience[],
  educations: Education[]
): string {
  return `You are an expert ATS resume writer creating comprehensive, keyword-rich content. Write detailed, professional sentences that maximize keyword integration from the job description.

JOB DESCRIPTION TO ANALYZE:
${jobDescription}

CANDIDATE INFO:
Name: ${profile.name}
Contact: ${profile.email} | ${profile.phone} | ${profile.location}

WORK HISTORY:
${workExperiences.map((work, i) => `${i + 1}. ${work.company} - ${work.position} (${work.start_date} to ${work.is_current ? 'Present' : work.end_date})`).join('\n')}

EDUCATION:
${educations.map(edu => `${edu.university} - ${edu.degree} (${edu.start_date} to ${edu.end_date})`).join('\n')}

REQUIREMENTS:
1. PROFESSIONAL TITLE: Use exact job title + primary technologies from job description
2. PROFESSIONAL SUMMARY: 5-6 comprehensive sentences (150-200 words) with maximum keyword density
3. WORK ACHIEVEMENTS: For each company, create exactly 5 achievements:
   - Achievement 1: Real-world project (80-120 words) - detailed project with specific technologies, challenges, solutions, and quantified results
   - Achievement 2: Another real-world project (80-120 words) - different project with comprehensive technical details and business impact
   - Achievement 3: Technical excellence/problem-solving (60-80 words) - architecture, code quality, innovation, technical leadership
   - Achievement 4: Collaboration/team management (60-80 words) - cross-functional work, leadership, mentoring, stakeholder management
   - Achievement 5: Process improvement/strategic initiatives (60-80 words) - methodologies, efficiency, optimization, strategic contributions

4. TECHNICAL SKILLS: Extract ALL technologies from job description + add related/similar technologies. Organize into 12-15 comprehensive categories.

CRITICAL INSTRUCTIONS:
- Write natural, professional sentences (NO placeholder text, NO brackets)
- Pack maximum keywords from job description into each sentence
- Create realistic project names that align with job requirements
- Include specific technologies, frameworks, and methodologies from job posting
- Generate achievements for ALL ${workExperiences.length} companies
- Use quantified results and business impact metrics
- Maintain professional tone while maximizing keyword density

EXAMPLE PROJECT ACHIEVEMENT (80-120 words):
"Architected and led the development of the CustomerEngagement Platform using React.js, Node.js, and PostgreSQL, serving over 50,000 daily active users across multiple geographic regions, where I implemented microservices architecture with Docker containers and Kubernetes orchestration, integrated real-time data synchronization using Redis caching and WebSocket connections, collaborated with cross-functional teams including product managers, UX designers, and QA engineers through Agile development methodologies, overcame scalability challenges by designing auto-scaling infrastructure on AWS EC2 with load balancing, and delivered the project 2 weeks ahead of schedule while achieving 99.9% uptime, 40% increase in user engagement metrics, and 60% reduction in page load times."

Return ONLY this JSON structure:

{
  "professionalTitle": "Exact job title from posting with key technologies",
  "professionalSummary": "5-6 comprehensive sentences (150-200 words) integrating maximum keywords from job description naturally while highlighting experience, technical expertise, industry knowledge, and value proposition",
  "workExperiences": [
    {
      "company": "${workExperiences[0]?.company || 'Company1'}",
      "achievements": [
        "Comprehensive 80-120 word sentence describing a specific real-world project you architected/led, including project name, technologies used from job description, team collaboration, challenges overcome, technical solutions implemented, and quantified business results achieved",
        "Detailed 80-120 word sentence about another significant project highlighting different technologies from job posting, your technical leadership role, complex problem-solving, innovative solutions, cross-functional collaboration, and measurable impact on business metrics",
        "Professional 60-80 word sentence emphasizing technical excellence, code quality, architecture decisions, innovation, best practices, technical mentoring, or advanced problem-solving skills that align with job requirements",
        "Comprehensive 60-80 word sentence showcasing collaboration, team leadership, stakeholder management, cross-functional coordination, communication skills, or project management abilities mentioned in job description",
        "Detailed 60-80 word sentence highlighting process improvements, strategic initiatives, methodology implementation, efficiency optimization, or innovation that demonstrates value-add capabilities from job posting"
      ]
    }${workExperiences.length > 1 ? `,
    {
      "company": "${workExperiences[1]?.company || 'Company2'}",
      "achievements": [
        "Comprehensive 80-120 word sentence describing a specific real-world project you architected/led, including project name, technologies used from job description, team collaboration, challenges overcome, technical solutions implemented, and quantified business results achieved",
        "Detailed 80-120 word sentence about another significant project highlighting different technologies from job posting, your technical leadership role, complex problem-solving, innovative solutions, cross-functional collaboration, and measurable impact on business metrics",
        "Professional 60-80 word sentence emphasizing technical excellence, code quality, architecture decisions, innovation, best practices, technical mentoring, or advanced problem-solving skills that align with job requirements",
        "Comprehensive 60-80 word sentence showcasing collaboration, team leadership, stakeholder management, cross-functional coordination, communication skills, or project management abilities mentioned in job description",
        "Detailed 60-80 word sentence highlighting process improvements, strategic initiatives, methodology implementation, efficiency optimization, or innovation that demonstrates value-add capabilities from job posting"
      ]
    }` : ''}${workExperiences.length > 2 ? workExperiences.slice(2).map((work) => `,
    {
      "company": "${work.company}",
      "achievements": [
        "Comprehensive 80-120 word sentence describing a specific real-world project you architected/led, including project name, technologies used from job description, team collaboration, challenges overcome, technical solutions implemented, and quantified business results achieved",
        "Detailed 80-120 word sentence about another significant project highlighting different technologies from job posting, your technical leadership role, complex problem-solving, innovative solutions, cross-functional collaboration, and measurable impact on business metrics",
        "Professional 60-80 word sentence emphasizing technical excellence, code quality, architecture decisions, innovation, best practices, technical mentoring, or advanced problem-solving skills that align with job requirements",
        "Comprehensive 60-80 word sentence showcasing collaboration, team leadership, stakeholder management, cross-functional coordination, communication skills, or project management abilities mentioned in job description",
        "Detailed 60-80 word sentence highlighting process improvements, strategic initiatives, methodology implementation, efficiency optimization, or innovation that demonstrates value-add capabilities from job posting"
      ]
    }`).join('') : ''}
  ],
  "technicalSkills": [
    "Programming Languages: Extract ALL programming languages from job description + add related languages (e.g., if JavaScript mentioned, add TypeScript, ES6+)",
    "Frontend Development: Extract ALL frontend technologies + add related frameworks and libraries",
    "Backend Technologies: Extract ALL backend frameworks + add related server technologies and APIs",
    "Database Systems: Extract ALL database technologies + add related data storage and management tools",
    "Cloud Platforms: Extract ALL cloud services + add related cloud technologies and services",
    "DevOps & Infrastructure: Extract ALL DevOps tools + add related automation and deployment technologies",
    "Development Tools: Extract ALL development tools + add related IDEs, version control, and productivity tools",
    "Testing & Quality Assurance: Extract ALL testing frameworks + add related QA tools and methodologies",
    "API Development: Extract ALL API technologies + add related integration and communication protocols",
    "Monitoring & Analytics: Extract ALL monitoring tools + add related observability and analytics platforms",
    "Security & Compliance: Extract ALL security frameworks + add related security tools and practices",
    "Data Science & Analytics: Extract ALL data tools + add related analytics and visualization technologies",
    "Mobile Development: Extract ALL mobile technologies + add related mobile frameworks and tools",
    "Emerging Technologies: Extract ALL emerging tech + add related innovative tools and platforms",
    "Methodologies & Practices: Extract ALL methodologies + add related development practices and frameworks"
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
          content: 'You are an expert ATS resume writer specializing in comprehensive, keyword-rich content. Create detailed professional achievements (80-120 words for projects, 60-80 words for strategic achievements) that maximize keyword integration from job descriptions. Write natural, compelling sentences with specific technologies, quantified results, and business impact. NO placeholder text, NO brackets, NO instructions in output.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.6,
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

CRITICAL: Write comprehensive, detailed sentences that pack maximum keywords from job description. First 2 achievements per company must be 80-120 words describing real projects. Next 3 achievements must be 60-80 words covering collaboration, problem-solving, and technical excellence. Extract ALL technologies from job description and add similar/related technologies to technical skills. Return ONLY valid JSON with natural, professional content.`
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