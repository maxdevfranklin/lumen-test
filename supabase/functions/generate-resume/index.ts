/*
  # Enhanced Job-Focused Resume Generation with Proper Seniority Matching

  This edge function creates highly targeted, keyword-optimized resumes by:
  1. Creating strong achievements for ALL companies, not just the first one
  2. Matching seniority level exactly to job requirements
  3. Avoiding over-inflated senior language for mid-level positions
  4. Maintaining natural language flow across all experiences
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

    // Generate AI content with enhanced achievements for all companies
    const aiContent = await generateWithAI(jobDescription, profile, workExperiences, educations, settings)

    // Map work experiences with achievements - ensure ALL companies get achievements
    const mappedWorkExperiences = workExperiences.map((work, index) => ({
        company: work.company,
      position: aiContent.workExperiences[index]?.position || work.position,
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
  return `Expert ATS resume writer: Create strong, compelling achievements for ALL companies that match the exact seniority level required by the job.

⚠️ CRITICAL SENIORITY MATCHING RULES:
- ANALYZE the job description to determine the exact seniority level required (Junior, Mid-level, Senior, Staff, Principal, etc.)
- MATCH the language and responsibilities to that exact level - DO NOT inflate or deflate
- For Junior roles: Focus on learning, contributing, implementing, supporting, assisting
- For Mid-level roles: Focus on developing, building, improving, collaborating, solving problems
- For Senior roles: Focus on leading, architecting, mentoring, driving initiatives, strategic impact
- NEVER use senior-level language (mentoring, leading teams, vast projects) for mid-level positions
- NEVER use junior language (learning, assisting) for senior positions

⚠️ CRITICAL ANTI-AI-DETECTION RULES:
- NEVER copy company names, team names, product names, or specific organizational details from the job description
- INSTEAD, create project names using the companies where the candidate ACTUALLY WORKED
- Use format like "[Company Name] [Project Type]" - e.g., "BaileyTech Customer Portal", "StayAI Analytics Platform"
- Make achievements sound like authentic work experience from their actual previous companies
- This ensures realistic, believable project names that sound like real work history

JOB DESCRIPTION:
${jobDescription}

CANDIDATE:
${profile.name} | ${profile.email} | ${profile.phone} | ${profile.location}

WORK HISTORY:
${workExperiences.map((work, i) => `${i + 1}. ${work.company} - ${work.position} (${work.start_date} to ${work.is_current ? 'Present' : work.end_date})`).join('\n')}

EDUCATION:
${educations.map(edu => `${edu.university} - ${edu.degree} (${edu.start_date} to ${edu.end_date})`).join('\n')}

CRITICAL INSTRUCTIONS:

1. SENIORITY LEVEL ANALYSIS: 
   - Carefully analyze the job description to determine the exact seniority level required
   - Look for keywords like "Junior", "Mid-level", "Senior", "Staff", "Principal", "Lead", years of experience required
   - Match ALL achievements to this exact level - no exceptions

2. PROFESSIONAL TITLE: Create a concise, simple title that perfectly matches the job description requirements and seniority level

3. ROLE OPTIMIZATION: For each work experience, create role titles that match the job's seniority level:
   - ANALYZE the job title in the job description and create RELEVANT titles for each work experience
   - If target job is "Product Manager", create titles like "Product Manager", "Associate Product Manager", "Business Analyst"
   - If target job is "Frontend Engineer", create titles like "Frontend Engineer", "UI Developer", "JavaScript Developer"
   - If target job is "Machine Learning Engineer", create titles like "ML Engineer", "Data Scientist", "Software Engineer"
   - If target job is "DevOps Engineer", create titles like "DevOps Engineer", "Cloud Engineer", "Site Reliability Engineer"
   - MATCH the domain, technology stack, and career progression that leads to the target role
   - Most recent role should be very similar to the target job title
   - If job posting is for "Data Scientist", create titles like "Data Scientist", "Machine Learning Engineer", "Data Analyst"
   - Match the domain and technology focus, not just seniority level
   - Most recent role should closely match the target job title

4. ACHIEVEMENT STRENGTH FOR ALL COMPANIES:
   - Company 1 (Most Recent): 5 strong achievements with detailed structured format
   - Company 2: 5 strong achievements (not weak!) with good detail and impact
   - Company 3+: 5 strong achievements each, maintaining quality and relevance

5. ACHIEVEMENT GUIDELINES BY SENIORITY:

FOR JUNIOR LEVEL POSITIONS:
- Focus on: Contributing to projects, implementing features, learning technologies, supporting team goals
- Avoid: Leading teams, mentoring, architecting systems, strategic decisions
- Language: "Contributed to", "Implemented", "Developed", "Supported", "Collaborated on"

FOR MID-LEVEL POSITIONS:
- Focus on: Building systems, solving complex problems, improving processes, cross-team collaboration
- Avoid: Mentoring junior developers, leading large teams, strategic architecture decisions
- Language: "Built", "Developed", "Improved", "Optimized", "Collaborated with", "Solved"

FOR SENIOR LEVEL POSITIONS:
- Focus on: Leading initiatives, mentoring, architectural decisions, strategic impact, team leadership
- Include: "Led", "Architected", "Mentored", "Drove", "Established", "Strategized"

6. TECHNICAL SKILLS: Extract ALL technologies from job description + add comprehensive related technologies. Create 15 detailed categories with at least 4 skills each.

ENHANCED ACHIEVEMENT STRUCTURE FOR ALL COMPANIES:

Company 1 (${workExperiences[0]?.company || 'First Company'}):
- Achievement 1: Structured format with description + 2 detailed bullet points (70-90 words total)
- Achievements 2-5: Strong individual achievements (60-80 words each)

Company 2 (${workExperiences[1]?.company || 'Second Company'}):
- ALL 5 achievements should be strong and detailed (60-80 words each)
- Focus on different aspects: technical implementation, problem-solving, collaboration, process improvement, innovation
- Use technologies and methodologies from the job description
- Match the seniority level exactly

Company 3+ (${workExperiences.slice(2).map(w => w.company).join(', ')}):
- ALL 5 achievements should be substantial and relevant (50-70 words each)
- Maintain quality and avoid generic or weak statements
- Show progression and growth appropriate to the seniority level
- Include specific technologies and measurable impact

DOMAIN ADAPTATION STRATEGY:
1. Analyze the job description to identify the primary domain and exact seniority level needed
2. Create project names using the candidate's ACTUAL company names in format "[Company Name] [Project Type]"
3. Use technical terminology and methodologies from the job posting, but NEVER copy company/product names from the job description
4. Focus on the most important 5-7 keywords rather than trying to fit everything
5. Make project names sound realistic for what could be built at their actual previous companies
6. Include impressive but believable metrics that match the seniority level
7. Ensure achievements sound authentic to their actual work history and seniority level

Return ONLY this JSON:

{
  "professionalTitle": "Exact job title matching seniority level and primary technologies",
  "professionalSummary": "6-7 comprehensive sentences (60-80 words) integrating maximum keywords from job description naturally while highlighting appropriate years of experience for the seniority level, technical expertise, industry knowledge, and capabilities that directly match job requirements without over-inflating or under-selling",
  "workExperiences": [
    {
      "company": "${workExperiences[0]?.company || 'Company1'}",
      "position": "Role title matching exact seniority level from job description (2-4 words max)",
      "achievements": [
        {
          "description": "PERFECT FIRST ACHIEVEMENT: 50-60 word sentence describing a specific project using the format '${workExperiences[0]?.company || 'CompanyName'} [Project Type]' that perfectly aligns with job requirements and seniority level, incorporating the TOP 5-7 most important keywords and technologies from the job description, including specific scope and metrics appropriate for the seniority level",
          "details": [
            "Technical Implementation: 40-50 word detailed explanation of exactly what you did at the appropriate seniority level, the technical approach taken, specific technologies and methodologies used, architecture decisions made (if senior), and key technical solutions implemented to deliver the project successfully",
            "Challenges & Solutions: 40-50 word detailed explanation of the main challenges faced during the project, specific problems encountered, innovative solutions developed appropriate to seniority level, obstacles overcome, and how your problem-solving skills led to successful project completion"
          ]
        },
        "STRONG Achievement 2: 60-80 word detailed sentence about another significant project at ${workExperiences[0]?.company || 'Company1'} highlighting different technologies and skills from job posting, your technical role appropriate to seniority level in system design and implementation, comprehensive problem-solving approaches, collaboration with stakeholders, measurable impact on business metrics and performance improvements, and value delivered to the organization",
        "STRONG Achievement 3: 60-80 word professional sentence emphasizing technical excellence appropriate to seniority level, architecture decisions (if applicable), code quality standards, innovation initiatives, best practices implementation, technical knowledge sharing, continuous learning and skill development, advanced problem-solving skills, and technical contributions that directly align with technical requirements mentioned in job description",
        "STRONG Achievement 4: 60-80 word comprehensive sentence showcasing collaboration excellence, teamwork capabilities appropriate to seniority level, stakeholder management skills, cross-functional coordination and communication, effective project delivery, relationship building, and collaboration qualities that demonstrate soft skills mentioned in job description",
        "STRONG Achievement 5: 60-80 word detailed sentence highlighting process improvements, initiatives appropriate to seniority level, methodology implementation and optimization, efficiency improvements and innovation projects, business impact, strategic thinking (if senior), value-add capabilities, and organizational impact that demonstrates value mentioned in job posting requirements"
      ]
    }${workExperiences.length > 1 ? `,
    {
      "company": "${workExperiences[1]?.company || 'Company2'}",
      "position": "Role title matching exact seniority level from job description (2-4 words max)",
      "achievements": [
        "STRONG Achievement 1: 60-80 word comprehensive sentence describing domain-specific project using '${workExperiences[1]?.company || 'CompanyName'} [Project Type]' format, technologies from job description, detailed scope appropriate to seniority level, challenges, solutions, and quantified results that demonstrate impact",
        "STRONG Achievement 2: 60-80 word detailed sentence about different ${workExperiences[1]?.company || 'company'} project using other technologies from posting, technical contributions appropriate to seniority level, collaboration, problem-solving, and measurable business impact with specific metrics",
        "STRONG Achievement 3: 60-80 word sentence highlighting technical excellence and specific skills mentioned in job description, showcasing expertise appropriate to seniority level, innovation, quality standards, and technical contributions that align with job requirements",
        "STRONG Achievement 4: 60-80 word sentence showcasing collaboration, communication, and teamwork skills from job requirements, demonstrating ability to work effectively with teams, stakeholders, and cross-functional groups at the appropriate seniority level",
        "STRONG Achievement 5: 60-80 word sentence emphasizing process improvement and impact using methodologies from posting, showing initiative, efficiency improvements, and organizational value appropriate to the seniority level required by the job"
      ]
    }` : ''}${workExperiences.length > 2 ? workExperiences.slice(2).map((work, originalIndex) => {
      return `,
    {
      "company": "${work.company}",
      "position": "Role title matching exact seniority level from job description (2-4 words max)",
      "achievements": [
        "STRONG Achievement 1: 50-70 word comprehensive sentence describing domain-specific project using '${work.company} [Project Type]' format, technologies from job description, detailed scope appropriate to seniority level, challenges, solutions, and quantified results",
        "STRONG Achievement 2: 50-70 word detailed sentence about different ${work.company} project using other technologies from posting, technical contributions appropriate to seniority level, collaboration, and business impact",
        "STRONG Achievement 3: 50-70 word sentence highlighting technical excellence and specific skills mentioned in job description, showcasing expertise appropriate to seniority level and technical contributions",
        "STRONG Achievement 4: 50-70 word sentence showcasing collaboration, communication, and teamwork skills from job requirements, demonstrating effective work at the appropriate seniority level",
        "STRONG Achievement 5: 50-70 word sentence emphasizing process improvement and strategic impact using methodologies from posting, showing value appropriate to the seniority level"
      ]
    }`}).join('') : ''}
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
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are an expert ATS resume writer specializing in creating strong achievements for ALL companies and matching exact seniority levels. CRITICAL: 1) Analyze job description to determine exact seniority level (Junior/Mid/Senior) and match language accordingly - NEVER use senior language for mid-level roles. 2) Create strong, detailed achievements for ALL companies, not just the first one. 3) NEVER use company names from job description - only use candidate\'s actual company names. 4) Focus on appropriate responsibilities and impact for the seniority level required.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 8000
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
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 8000,
      messages: [
        {
          role: 'user',
          content: `${prompt}

CRITICAL FOCUS FOR ALL ACHIEVEMENTS:

1. SENIORITY LEVEL MATCHING:
- First, analyze the job description to determine the EXACT seniority level required
- Match ALL language, responsibilities, and impact statements to that level
- Junior: Focus on contributing, implementing, learning, supporting
- Mid-level: Focus on developing, building, improving, solving, collaborating
- Senior: Focus on leading, architecting, mentoring, driving, strategizing
- NEVER mix seniority levels - be consistent throughout

2. STRONG ACHIEVEMENTS FOR ALL COMPANIES:
- Company 1: 5 strong achievements (first one structured, others 60-80 words each)
- Company 2: 5 strong achievements (ALL should be 60-80 words, detailed and impactful)
- Company 3+: 5 strong achievements each (50-70 words, substantial and relevant)
- NO weak or generic achievements for any company
- Each achievement should include specific technologies, measurable impact, and clear value

3. ANTI-AI-DETECTION:
- Use only candidate's actual company names for project names
- Make achievements sound authentic and realistic for their work history
- Include believable metrics appropriate to the seniority level
- Ensure natural language flow without keyword stuffing

4. TECHNICAL ALIGNMENT:
- Include TOP 5-7 keywords from job description in each company's achievements
- Use different technologies and skills across achievements to show breadth
- Maintain consistency with the required seniority level throughout

The goal is to create a resume where EVERY achievement is strong, relevant, and perfectly matched to the job's seniority requirements.

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