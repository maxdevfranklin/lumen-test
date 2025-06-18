/*
  # Enhanced Keyword-Rich Resume Generation

  This edge function creates detailed, keyword-optimized resumes by:
  1. Generating 2 comprehensive real-world projects (90-130 words each)
  2. Adding 3 strategic achievements covering collaboration, problem-solving (70-90 words each)
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

    // Generate AI content with enhanced keyword-rich prompt
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
  return `Expert ATS resume writer: Create comprehensive, keyword-rich content with longer sentences that maximize job description keyword integration.

JOB DESCRIPTION:
${jobDescription}

CANDIDATE:
${profile.name} | ${profile.email} | ${profile.phone} | ${profile.location}

WORK HISTORY:
${workExperiences.map((work, i) => `${i + 1}. ${work.company} - ${work.position} (${work.start_date} to ${work.is_current ? 'Present' : work.end_date})`).join('\n')}

EDUCATION:
${educations.map(edu => `${edu.university} - ${edu.degree} (${edu.start_date} to ${edu.end_date})`).join('\n')}

INSTRUCTIONS:
1. PROFESSIONAL TITLE: Exact job title + key technologies from job description
2. PROFESSIONAL SUMMARY: 6-7 comprehensive sentences (180-220 words) with maximum keyword density
3. WORK ACHIEVEMENTS: For each company, create exactly 5 achievements:
   - Achievement 1: Real-world project (90-130 words) - specific project name, scope, challenges, solutions, technologies from job description, quantified results
   - Achievement 2: Another real-world project (90-130 words) - different project with comprehensive technical details, team collaboration, business impact
   - Achievement 3: Technical excellence (70-90 words) - architecture, innovation, code quality, technical leadership, mentoring
   - Achievement 4: Collaboration/leadership (70-90 words) - cross-functional work, team management, stakeholder engagement, communication
   - Achievement 5: Process improvement (70-90 words) - methodologies, optimization, strategic initiatives, efficiency gains

4. TECHNICAL SKILLS: Extract ALL technologies from job description + add related/complementary technologies. Create 15 comprehensive categories.

CRITICAL REQUIREMENTS:
- Write natural, professional sentences (NO placeholder text)
- Pack maximum keywords from job description into every sentence
- Create realistic project names that align with job requirements
- Include specific technologies, frameworks, methodologies from job posting
- Generate achievements for ALL ${workExperiences.length} companies
- Use quantified results and business impact metrics
- Maintain professional tone while maximizing keyword density
- Ensure sentences are longer and more comprehensive than typical resume content

EXAMPLE PROJECT ACHIEVEMENT (90-130 words):
"Architected and led the development of the CustomerEngagement Platform, a comprehensive React.js and Node.js application serving over 50,000 daily active users across multiple geographic regions, where I implemented microservices architecture using Docker containers and Kubernetes orchestration on AWS infrastructure, integrated real-time data synchronization capabilities through Redis caching and WebSocket connections, collaborated extensively with cross-functional teams including product managers, UX designers, and QA engineers through Agile development methodologies and sprint planning sessions, overcame complex scalability challenges by designing auto-scaling infrastructure with load balancing and database optimization, and successfully delivered the project 2 weeks ahead of schedule while achieving 99.9% uptime, 40% increase in user engagement metrics, 60% reduction in page load times, and $2M annual revenue impact."

Return ONLY this JSON:

{
  "professionalTitle": "Exact job title from posting with primary technologies",
  "professionalSummary": "6-7 comprehensive sentences (180-220 words) integrating maximum keywords from job description naturally while highlighting years of experience, technical expertise, industry knowledge, leadership capabilities, and unique value proposition",
  "workExperiences": [
    {
      "company": "${workExperiences[0]?.company || 'Company1'}",
      "achievements": [
        "Comprehensive 90-130 word sentence describing a specific real-world project you architected and led, including exact project name that aligns with job requirements, detailed scope and user base, specific technologies used from job description, team collaboration methods, complex challenges overcome, innovative technical solutions implemented, cross-functional coordination, and quantified business results with metrics and revenue impact",
        "Detailed 90-130 word sentence about another significant project highlighting different technologies from job posting, your technical leadership role in system design and implementation, complex problem-solving approaches, innovative solutions and methodologies, extensive cross-functional collaboration with stakeholders, measurable impact on business metrics, performance improvements, and strategic value delivered to the organization",
        "Professional 70-90 word sentence emphasizing technical excellence, advanced architecture decisions, code quality standards, innovation initiatives, best practices implementation, technical mentoring and knowledge sharing, continuous learning, or advanced problem-solving skills that directly align with technical requirements mentioned in job description",
        "Comprehensive 70-90 word sentence showcasing collaboration excellence, team leadership capabilities, stakeholder management skills, cross-functional coordination, effective communication, project management abilities, conflict resolution, or relationship building that demonstrates soft skills and leadership qualities mentioned in job description",
        "Detailed 70-90 word sentence highlighting process improvements, strategic initiatives, methodology implementation, efficiency optimization, innovation projects, or transformational changes that demonstrate value-add capabilities, strategic thinking, and business impact mentioned in job posting requirements"
      ]
    }${workExperiences.length > 1 ? `,
    {
      "company": "${workExperiences[1]?.company || 'Company2'}",
      "achievements": [
        "Comprehensive 90-130 word sentence describing a specific real-world project you architected and led, including exact project name that aligns with job requirements, detailed scope and user base, specific technologies used from job description, team collaboration methods, complex challenges overcome, innovative technical solutions implemented, cross-functional coordination, and quantified business results with metrics and revenue impact",
        "Detailed 90-130 word sentence about another significant project highlighting different technologies from job posting, your technical leadership role in system design and implementation, complex problem-solving approaches, innovative solutions and methodologies, extensive cross-functional collaboration with stakeholders, measurable impact on business metrics, performance improvements, and strategic value delivered to the organization",
        "Professional 70-90 word sentence emphasizing technical excellence, advanced architecture decisions, code quality standards, innovation initiatives, best practices implementation, technical mentoring and knowledge sharing, continuous learning, or advanced problem-solving skills that directly align with technical requirements mentioned in job description",
        "Comprehensive 70-90 word sentence showcasing collaboration excellence, team leadership capabilities, stakeholder management skills, cross-functional coordination, effective communication, project management abilities, conflict resolution, or relationship building that demonstrates soft skills and leadership qualities mentioned in job description",
        "Detailed 70-90 word sentence highlighting process improvements, strategic initiatives, methodology implementation, efficiency optimization, innovation projects, or transformational changes that demonstrate value-add capabilities, strategic thinking, and business impact mentioned in job posting requirements"
      ]
    }` : ''}${workExperiences.length > 2 ? workExperiences.slice(2).map((work) => `,
    {
      "company": "${work.company}",
      "achievements": [
        "Comprehensive 90-130 word sentence describing a specific real-world project you architected and led, including exact project name that aligns with job requirements, detailed scope and user base, specific technologies used from job description, team collaboration methods, complex challenges overcome, innovative technical solutions implemented, cross-functional coordination, and quantified business results with metrics and revenue impact",
        "Detailed 90-130 word sentence about another significant project highlighting different technologies from job posting, your technical leadership role in system design and implementation, complex problem-solving approaches, innovative solutions and methodologies, extensive cross-functional collaboration with stakeholders, measurable impact on business metrics, performance improvements, and strategic value delivered to the organization",
        "Professional 70-90 word sentence emphasizing technical excellence, advanced architecture decisions, code quality standards, innovation initiatives, best practices implementation, technical mentoring and knowledge sharing, continuous learning, or advanced problem-solving skills that directly align with technical requirements mentioned in job description",
        "Comprehensive 70-90 word sentence showcasing collaboration excellence, team leadership capabilities, stakeholder management skills, cross-functional coordination, effective communication, project management abilities, conflict resolution, or relationship building that demonstrates soft skills and leadership qualities mentioned in job description",
        "Detailed 70-90 word sentence highlighting process improvements, strategic initiatives, methodology implementation, efficiency optimization, innovation projects, or transformational changes that demonstrate value-add capabilities, strategic thinking, and business impact mentioned in job posting requirements"
      ]
    }`).join('') : ''}
  ],
  "technicalSkills": [
    "Programming Languages: Extract ALL programming languages from job description and add related languages",
    "Frontend Development: Extract ALL frontend technologies and add related frameworks",
    "Backend Technologies: Extract ALL backend frameworks and add related server technologies",
    "Database Systems: Extract ALL database technologies and add related data management tools",
    "Cloud Platforms: Extract ALL cloud services and add related cloud technologies",
    "DevOps & Infrastructure: Extract ALL DevOps tools and add related automation technologies",
    "Development Tools: Extract ALL development tools and add related productivity tools",
    "Testing & Quality Assurance: Extract ALL testing frameworks and add related QA tools",
    "API Development: Extract ALL API technologies and add related integration protocols",
    "Monitoring & Analytics: Extract ALL monitoring tools and add related observability platforms",
    "Security & Compliance: Extract ALL security frameworks and add related security tools",
    "Data Science & Analytics: Extract ALL data tools and add related analytics technologies",
    "Mobile Development: Extract ALL mobile technologies and add related mobile frameworks",
    "Emerging Technologies: Extract ALL emerging tech and add related innovative tools",
    "Methodologies & Practices: Extract ALL methodologies and add related development practices"
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
          content: 'You are an expert ATS resume writer creating comprehensive, keyword-rich content. Write longer, detailed professional achievements (90-130 words for projects, 70-90 words for strategic achievements) that maximize keyword integration from job descriptions. Create natural, compelling sentences with specific technologies, quantified results, and business impact. Focus on comprehensive project descriptions with exact project names, scope, challenges, solutions, and measurable outcomes. NO placeholder text, NO brackets, NO instructions in output.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 3400
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
      max_tokens: 3400,
      messages: [
        {
          role: 'user',
          content: `${prompt}

CRITICAL: Write comprehensive, detailed sentences that pack maximum keywords from job description. First 2 achievements per company must be 90-130 words describing real projects with exact project names, scope, challenges, solutions, and quantified results. Next 3 achievements must be 70-90 words covering technical excellence, collaboration, and process improvement. Extract ALL technologies from job description and add similar/related technologies to technical skills. Return ONLY valid JSON with natural, professional content that maximizes keyword density.`
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