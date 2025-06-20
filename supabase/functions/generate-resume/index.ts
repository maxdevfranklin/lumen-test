/*
  # Enhanced Job-Focused Resume Generation with Longer Sentences

  This edge function creates highly targeted, keyword-optimized resumes by:
  1. Generating longer, comprehensive sentences (120-180 words for projects, 90-120 words for other achievements)
  2. Maximum keyword integration with 100% job description matching
  3. Domain-specific project names that align perfectly with job requirements
  4. First achievement of first company gets priority focus with maximum keyword density
  5. Natural language flow while maximizing ATS optimization
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

    // Generate AI content with enhanced longer sentences
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
  const prompt = createLongerSentencePrompt(jobDescription, profile, workExperiences, educations)
  
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

function createLongerSentencePrompt(
  jobDescription: string,
  profile: UserProfile,
  workExperiences: WorkExperience[],
  educations: Education[]
): string {
  return `Expert ATS resume writer: Create comprehensive, keyword-rich content with longer sentences that maximize job description keyword integration.

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

3. WORK ACHIEVEMENTS - LONGER SENTENCES REQUIRED:

For ${workExperiences[0]?.company || 'First Company'} (MOST IMPORTANT):
Achievement 1 (120-180 words): PRIORITY ACHIEVEMENT - Must include maximum keywords from job description
- Create specific project name that perfectly aligns with job domain and requirements
- Include ALL major technologies, frameworks, and methodologies mentioned in job posting
- Describe comprehensive scope, complex challenges, innovative solutions, and quantified business impact
- Use exact terminology and language patterns from the job description
- This is the MOST IMPORTANT achievement - pack maximum keywords naturally

Achievement 2 (120-180 words): Second major project with different focus
- Different project name but still domain-aligned with job requirements
- Highlight different technologies and skills from the job posting
- Include extensive team collaboration, technical leadership, and cross-functional coordination
- Quantified results, performance improvements, and strategic business value

Achievement 3 (90-120 words): Technical excellence and innovation
- Advanced technical skills and architecture decisions mentioned in job description
- Code quality, best practices, technical mentoring, and knowledge sharing
- Innovation initiatives and problem-solving approaches

Achievement 4 (90-120 words): Collaboration and leadership excellence
- Cross-functional teamwork, stakeholder management, and communication skills
- Project management, team leadership, and relationship building
- Conflict resolution and delivery excellence

Achievement 5 (90-120 words): Process improvement and strategic impact
- Methodologies, frameworks, and strategic initiatives from job posting
- Efficiency optimization, innovation projects, and transformational changes
- Business impact and value-add capabilities

For Additional Companies (if any):
- Follow same pattern but with 100-150 words for projects, 80-100 words for other achievements
- Maintain high keyword density while ensuring natural language flow

4. TECHNICAL SKILLS: Extract ALL technologies from job description + add comprehensive related technologies. Create 15 detailed categories with maximum keyword coverage.

DOMAIN ADAPTATION:
- Analyze job description to determine domain (frontend, backend, fullstack, data, DevOps, mobile, security, etc.)
- Create project names that perfectly match the job domain and requirements
- Use industry-specific terminology and technical language from the posting
- Ensure all achievements align with the specific role requirements

KEYWORD STRATEGY:
- Use exact phrases and terminology from job description
- Include ALL technologies, frameworks, methodologies, and tools mentioned
- Add related and similar technologies for broader keyword coverage
- Repeat important keywords across different sections naturally
- Maintain professional tone while maximizing keyword density

EXAMPLE FIRST ACHIEVEMENT (120-180 words):
"Architected and led the development of the CustomerEngagement Analytics Platform, a comprehensive React.js, Node.js, and Python-based enterprise application serving over 100,000 daily active users across multiple geographic regions and business units, where I implemented advanced microservices architecture using Docker containers, Kubernetes orchestration, and AWS cloud infrastructure including EC2, RDS, and Lambda services, integrated real-time data synchronization capabilities through Redis caching, WebSocket connections, and Apache Kafka message streaming, collaborated extensively with cross-functional teams including product managers, UX/UI designers, data scientists, and QA engineers through Agile development methodologies, Scrum ceremonies, and continuous integration/continuous deployment (CI/CD) pipelines using Jenkins and GitLab, overcame complex scalability challenges by designing auto-scaling infrastructure with load balancing, database optimization, and performance monitoring using New Relic and DataDog, implemented comprehensive testing strategies including unit testing with Jest, integration testing, and end-to-end testing with Cypress, and successfully delivered the project 3 weeks ahead of schedule while achieving 99.9% uptime, 45% increase in user engagement metrics, 65% reduction in page load times, and $3.2M annual revenue impact through improved customer retention and conversion rates."

Return ONLY this JSON:

{
  "professionalTitle": "Exact job title from posting with primary technologies",
  "professionalSummary": "6-7 comprehensive sentences (200-250 words) integrating maximum keywords from job description naturally while highlighting years of experience, technical expertise, industry knowledge, leadership capabilities, and unique value proposition that directly matches job requirements",
  "workExperiences": [
    {
      "company": "${workExperiences[0]?.company || 'Company1'}",
      "achievements": [
        "PRIORITY: 120-180 word comprehensive sentence describing the most important project that perfectly aligns with job requirements, including specific project name that matches job domain, ALL major technologies and frameworks from job description, detailed scope and user base, complex challenges and innovative solutions, extensive team collaboration and cross-functional coordination, advanced technical implementation details, and quantified business results with specific metrics and revenue impact",
        "120-180 word detailed sentence about another significant project highlighting different technologies and skills from job posting, your technical leadership role in system design and implementation, comprehensive problem-solving approaches, innovative solutions and methodologies, extensive cross-functional collaboration with various stakeholders, measurable impact on business metrics and performance improvements, strategic value delivered to the organization, and long-term business benefits",
        "90-120 word professional sentence emphasizing technical excellence, advanced architecture decisions, code quality standards, innovation initiatives, best practices implementation, technical mentoring and knowledge sharing, continuous learning and skill development, advanced problem-solving skills, and technical leadership that directly aligns with technical requirements mentioned in job description",
        "90-120 word comprehensive sentence showcasing collaboration excellence, team leadership capabilities, stakeholder management skills, cross-functional coordination and communication, effective project management and delivery, conflict resolution and relationship building, mentoring and team development, and leadership qualities that demonstrate soft skills and management abilities mentioned in job description",
        "90-120 word detailed sentence highlighting process improvements, strategic initiatives, methodology implementation and optimization, efficiency improvements and innovation projects, transformational changes and business impact, strategic thinking and planning, value-add capabilities and business acumen, and organizational impact that demonstrates strategic value mentioned in job posting requirements"
      ]
    }${workExperiences.length > 1 ? `,
    {
      "company": "${workExperiences[1]?.company || 'Company2'}",
      "achievements": [
        "100-150 word comprehensive sentence describing domain-specific project with exact project name, technologies from job description, detailed scope, challenges, solutions, and quantified results",
        "100-150 word detailed sentence about different project using other technologies from posting, technical leadership, collaboration, and business impact",
        "80-100 word sentence highlighting technical excellence and specific skills mentioned in job description",
        "80-100 word sentence showcasing collaboration, leadership, and communication skills from job requirements",
        "80-100 word sentence emphasizing process improvement and strategic impact using methodologies from posting"
      ]
    }` : ''}${workExperiences.length > 2 ? workExperiences.slice(2).map((work) => `,
    {
      "company": "${work.company}",
      "achievements": [
        "100-150 word comprehensive sentence describing domain-specific project with exact project name, technologies from job description, detailed scope, challenges, solutions, and quantified results",
        "100-150 word detailed sentence about different project using other technologies from posting, technical leadership, collaboration, and business impact",
        "80-100 word sentence highlighting technical excellence and specific skills mentioned in job description",
        "80-100 word sentence showcasing collaboration, leadership, and communication skills from job requirements",
        "80-100 word sentence emphasizing process improvement and strategic impact using methodologies from posting"
      ]
    }`).join('') : ''}
  ],
  "technicalSkills": [
    "Programming Languages: Extract ALL programming languages from job description and add comprehensive related languages and frameworks",
    "Frontend Development: Extract ALL frontend technologies from posting and add extensive related frameworks, libraries, and tools",
    "Backend Technologies: Extract ALL backend frameworks from posting and add comprehensive related server technologies and architectures",
    "Database Systems: Extract ALL database technologies from posting and add extensive related data management tools and platforms",
    "Cloud Platforms: Extract ALL cloud services from posting and add comprehensive related cloud technologies and services",
    "DevOps & Infrastructure: Extract ALL DevOps tools from posting and add extensive related automation and infrastructure technologies",
    "Development Tools: Extract ALL development tools from posting and add comprehensive related productivity and collaboration tools",
    "Testing & Quality Assurance: Extract ALL testing frameworks from posting and add extensive related QA tools and methodologies",
    "API Development: Extract ALL API technologies from posting and add comprehensive related integration protocols and tools",
    "Monitoring & Analytics: Extract ALL monitoring tools from posting and add extensive related observability and analytics platforms",
    "Security & Compliance: Extract ALL security frameworks from posting and add comprehensive related security tools and practices",
    "Data Science & Analytics: Extract ALL data tools from posting and add extensive related analytics and machine learning technologies",
    "Mobile Development: Extract ALL mobile technologies from posting and add comprehensive related mobile frameworks and tools",
    "Emerging Technologies: Extract ALL emerging tech from posting and add extensive related innovative tools and platforms",
    "Methodologies & Practices: Extract ALL methodologies from posting and add comprehensive related development practices and frameworks"
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
          content: 'You are an expert ATS resume writer creating comprehensive, keyword-rich content with longer sentences. Write detailed professional achievements (120-180 words for priority projects, 90-120 words for other achievements) that maximize keyword integration from job descriptions. The first achievement of the first company is MOST IMPORTANT and must include maximum keywords. Create natural, compelling sentences with specific technologies, quantified results, and business impact. Focus on comprehensive project descriptions with exact project names, scope, challenges, solutions, and measurable outcomes. Extract ALL technologies from job descriptions and add related technologies for maximum keyword coverage.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 3800
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
      max_tokens: 3800,
      messages: [
        {
          role: 'user',
          content: `${prompt}

CRITICAL REQUIREMENTS:
- Write longer, comprehensive sentences: 120-180 words for first two achievements, 90-120 words for others
- First achievement of first company is MOST IMPORTANT - pack maximum keywords from job description
- Analyze job description domain and create perfectly aligned project names
- Use exact keywords and phrases from job description throughout all content
- Extract ALL technologies from job description and add comprehensive related technologies
- Maintain natural language flow while maximizing keyword density for ATS optimization
- Create realistic, domain-specific project names that align with job requirements
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