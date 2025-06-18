/*
  # Project-Focused ATS Resume Generation with Detailed Real-World Projects

  This edge function creates ATS-optimized resumes by:
  1. Generating 2-3 detailed real-world projects per work experience
  2. Creating longer, comprehensive sentences (60-80 words)
  3. Highlighting specific project names, roles, challenges, and solutions
  4. Maintaining 95%+ ATS score through strategic keyword integration
  5. Using natural language flow with detailed technical descriptions
  6. Including comprehensive project scope and business impact

  ## Key Features
  - 2-3 detailed project achievements per work experience
  - 3-4 additional strategic achievements for keyword optimization
  - Longer sentences with comprehensive technical details
  - Real project names that align with job description requirements
  - Detailed role descriptions, challenges faced, and solutions implemented
  - Business impact and measurable outcomes for each project
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

    // Generate AI content with detailed project focus
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
  const prompt = createProjectFocusedPrompt(jobDescription, profile, workExperiences, educations)
  
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

function createProjectFocusedPrompt(
  jobDescription: string,
  profile: UserProfile,
  workExperiences: WorkExperience[],
  educations: Education[]
): string {
  return `
You are an expert ATS optimization specialist and technical resume writer with 99.5% success rate. Create a comprehensive, project-focused resume that achieves 95%+ ATS score through detailed real-world project descriptions and strategic keyword integration.

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

COMPREHENSIVE PROJECT-FOCUSED RESUME STRATEGY:

1. PROFESSIONAL TITLE & SUMMARY:
   - Title: Use EXACT job title + primary tech stack from job description
   - Summary: 5-6 comprehensive sentences, 150-200 words total
   - Include 20-25 keywords naturally integrated
   - Start with experience level and exact role alignment
   - Highlight top 4-5 technical skills from job description
   - Include industry domain and specialization areas
   - End with value proposition using job posting language

2. DETAILED PROJECT-FOCUSED ACHIEVEMENTS:
   Generate exactly 7 achievements per work experience:
   
   A) REAL-WORLD PROJECTS (3 achievements, 70-90 words each):
   
   PROJECT STRUCTURE FOR EACH:
   - **Project Name**: Create realistic, industry-specific project names that directly align with job description requirements
   - **Your Role**: Specific technical role and responsibilities
   - **Challenge**: Technical or business challenge that matches job description context
   - **Solution**: Detailed technical implementation using technologies from job description
   - **Impact**: Quantified business outcomes and technical improvements
   
   PROJECT NAMING EXAMPLES BY INDUSTRY:
   - Software/Web: "CustomerEngagement Platform", "RealTimeAnalytics Dashboard", "MicroservicesArchitecture Migration"
   - E-commerce: "CheckoutOptimization Engine", "InventoryManagement System", "PersonalizationRecommendation Platform"
   - FinTech: "PaymentProcessing Gateway", "RiskAssessment Framework", "ComplianceAutomation Suite"
   - Healthcare: "PatientDataIntegration Platform", "TelehealthVideo System", "MedicalRecords Portal"
   - Enterprise: "WorkflowAutomation Platform", "DataVisualization Dashboard", "SecurityCompliance Framework"
   
   B) STRATEGIC KEYWORD ACHIEVEMENTS (4 achievements, 60-80 words each):
   - Leadership & Team Management (incorporating soft skills from job description)
   - Cross-functional Collaboration (using business language from posting)
   - Process Optimization & Innovation (methodologies from job description)
   - Technical Excellence & Mentoring (quality practices from posting)

3. TECHNICAL SKILLS EXTRACTION (CRITICAL):
   
   STEP-BY-STEP REAL TECHNOLOGY EXTRACTION:
   a) Carefully read job description and identify ALL technical terms
   b) Extract programming languages, frameworks, tools, platforms, methodologies
   c) Group into 12-15 logical categories
   d) Add complementary technologies that would be expected for this role
   e) Use EXACT terminology from job posting
   
   NEVER use placeholder text like "[Extract from JD]", "[List from job description]", or similar
   ALWAYS provide specific, real technology names and frameworks
   
   EXAMPLE EXTRACTION:
   If job mentions: "React, Node.js, AWS, Docker, PostgreSQL, REST APIs, Agile, TypeScript"
   Then create:
   - "Frontend Development: React.js, TypeScript, JavaScript ES6+, HTML5, CSS3, Redux, Material-UI"
   - "Backend Technologies: Node.js, Express.js, RESTful APIs, GraphQL, Microservices Architecture"
   - "Database Systems: PostgreSQL, MongoDB, Redis, Database Design, Query Optimization"
   - "Cloud Platforms: AWS (EC2, S3, Lambda, RDS), Docker, Kubernetes, CI/CD Pipelines"

4. ATS OPTIMIZATION REQUIREMENTS:
   - Primary keywords: 4-6 mentions across sections
   - Secondary keywords: 2-3 strategic placements
   - Maintain 3-5% keyword density for optimal parsing
   - Use exact job title matches and terminology
   - Include industry-specific language and methodologies
   - Integrate soft skills naturally throughout achievements

5. PROJECT ACHIEVEMENT EXAMPLES:

   TECHNICAL PROJECT ACHIEVEMENT (70-90 words):
   "Led the development of the CustomerEngagement Platform, a comprehensive React.js and Node.js application serving 50,000+ daily active users, where I architected the microservices backend using Docker containers and AWS Lambda functions, implemented real-time data synchronization with PostgreSQL and Redis caching, overcame scalability challenges by designing auto-scaling infrastructure that reduced response times by 60%, and delivered the project 2 weeks ahead of schedule while maintaining 99.9% uptime and achieving a 40% increase in user engagement metrics."

   LEADERSHIP ACHIEVEMENT (60-80 words):
   "Spearheaded cross-functional collaboration initiatives by leading a team of 8 developers and 3 QA engineers through Agile development cycles, where I facilitated daily standups and sprint planning sessions, mentored junior developers on React.js best practices and code review processes, coordinated with product managers and UX designers to align technical implementation with business requirements, and successfully delivered 12 major feature releases while maintaining team productivity at 95% and reducing bug reports by 35%."

CRITICAL SUCCESS FACTORS:
- Each project achievement must be 70-90 words with comprehensive technical details
- Project names must be realistic and align with job description requirements
- Include specific role, challenges, solutions, and quantified outcomes
- Strategic achievements must be 60-80 words incorporating job description keywords
- Technical skills must contain REAL technologies extracted from job posting
- Maintain natural language flow while achieving optimal keyword density
- Every technical term from job description should appear at least once

Generate exactly 7 achievements for ALL ${workExperiences.length} work experiences.

IMPORTANT: Return ONLY valid JSON without any markdown formatting, code blocks, or additional text. The response must start with { and end with }.

{
  "professionalTitle": "[Exact Job Title from Posting] | [Primary Tech Stack from Job Description]",
  "professionalSummary": "[5-6 comprehensive sentences, 150-200 words total, incorporating 20-25 keywords from job description naturally, starting with experience level and exact role alignment, highlighting top technical skills, including industry domain, and ending with value proposition using job posting language]",
  "workExperiences": [
    {
      "company": "${workExperiences[0]?.company || 'Company1'}",
      "achievements": [
        "[PROJECT ACHIEVEMENT 1: 70-90 words describing a realistic project name that aligns with job description, your specific technical role, the challenge faced, detailed solution using technologies from job posting, and quantified business impact]",
        "[PROJECT ACHIEVEMENT 2: 70-90 words describing a different realistic project name relevant to job requirements, your technical leadership role, complex challenges overcome, comprehensive solution implementation, and measurable outcomes]",
        "[PROJECT ACHIEVEMENT 3: 70-90 words describing another realistic project that matches job description context, your technical contributions, innovative solutions implemented, and significant business value delivered]",
        "[LEADERSHIP ACHIEVEMENT: 60-80 words incorporating team management and soft skills from job description, including team size, collaboration methods, mentoring activities, and leadership outcomes]",
        "[COLLABORATION ACHIEVEMENT: 60-80 words using business language from job posting, focusing on cross-functional work, stakeholder management, communication skills, and relationship building]",
        "[PROCESS OPTIMIZATION ACHIEVEMENT: 60-80 words highlighting methodologies from job description, process improvements, efficiency gains, and innovation initiatives]",
        "[TECHNICAL EXCELLENCE ACHIEVEMENT: 60-80 words emphasizing quality practices from job posting, code standards, best practices, continuous learning, and technical mentoring]"
      ]
    }${workExperiences.length > 1 ? `,
    {
      "company": "${workExperiences[1]?.company || 'Company2'}",
      "achievements": [
        "[PROJECT ACHIEVEMENT 1: 70-90 words describing a realistic project name that aligns with job description, your specific technical role, the challenge faced, detailed solution using technologies from job posting, and quantified business impact]",
        "[PROJECT ACHIEVEMENT 2: 70-90 words describing a different realistic project name relevant to job requirements, your technical leadership role, complex challenges overcome, comprehensive solution implementation, and measurable outcomes]",
        "[PROJECT ACHIEVEMENT 3: 70-90 words describing another realistic project that matches job description context, your technical contributions, innovative solutions implemented, and significant business value delivered]",
        "[LEADERSHIP ACHIEVEMENT: 60-80 words incorporating team management and soft skills from job description, including team size, collaboration methods, mentoring activities, and leadership outcomes]",
        "[COLLABORATION ACHIEVEMENT: 60-80 words using business language from job posting, focusing on cross-functional work, stakeholder management, communication skills, and relationship building]",
        "[PROCESS OPTIMIZATION ACHIEVEMENT: 60-80 words highlighting methodologies from job description, process improvements, efficiency gains, and innovation initiatives]",
        "[TECHNICAL EXCELLENCE ACHIEVEMENT: 60-80 words emphasizing quality practices from job posting, code standards, best practices, continuous learning, and technical mentoring]"
      ]
    }` : ''}${workExperiences.length > 2 ? workExperiences.slice(2).map((work) => `,
    {
      "company": "${work.company}",
      "achievements": [
        "[PROJECT ACHIEVEMENT 1: 70-90 words describing a realistic project name that aligns with job description, your specific technical role, the challenge faced, detailed solution using technologies from job posting, and quantified business impact]",
        "[PROJECT ACHIEVEMENT 2: 70-90 words describing a different realistic project name relevant to job requirements, your technical leadership role, complex challenges overcome, comprehensive solution implementation, and measurable outcomes]",
        "[PROJECT ACHIEVEMENT 3: 70-90 words describing another realistic project that matches job description context, your technical contributions, innovative solutions implemented, and significant business value delivered]",
        "[LEADERSHIP ACHIEVEMENT: 60-80 words incorporating team management and soft skills from job description, including team size, collaboration methods, mentoring activities, and leadership outcomes]",
        "[COLLABORATION ACHIEVEMENT: 60-80 words using business language from job posting, focusing on cross-functional work, stakeholder management, communication skills, and relationship building]",
        "[PROCESS OPTIMIZATION ACHIEVEMENT: 60-80 words highlighting methodologies from job description, process improvements, efficiency gains, and innovation initiatives]",
        "[TECHNICAL EXCELLENCE ACHIEVEMENT: 60-80 words emphasizing quality practices from job posting, code standards, best practices, continuous learning, and technical mentoring]"
      ]
    }`).join('') : ''}
  ],
  "technicalSkills": [
    "Programming Languages: [Extract and list ACTUAL programming languages mentioned in job description + relevant complementary languages]",
    "Frontend Development: [Extract and list ACTUAL frontend frameworks and tools from job description + related technologies]",
    "Backend Technologies: [Extract and list ACTUAL backend frameworks and tools from job description + complementary systems]",
    "Database Systems: [Extract and list ACTUAL database technologies from job description + related data storage solutions]",
    "Cloud Platforms: [Extract and list ACTUAL cloud services and platforms from job description + related cloud technologies]",
    "DevOps & Infrastructure: [Extract and list ACTUAL DevOps tools and practices from job description + related automation tools]",
    "Development Tools: [Extract and list ACTUAL development tools and IDEs from job description + related productivity tools]",
    "Testing & Quality Assurance: [Extract and list ACTUAL testing frameworks and QA tools from job description + related testing technologies]",
    "API Development: [Extract and list ACTUAL API technologies and integration tools from job description + related communication protocols]",
    "Monitoring & Analytics: [Extract and list ACTUAL monitoring and analytics tools from job description + related observability platforms]",
    "Security & Compliance: [Extract and list ACTUAL security frameworks and compliance tools from job description + related security technologies]",
    "Data Science & Analytics: [Extract and list ACTUAL data analysis tools and frameworks from job description + related data technologies]",
    "Mobile Development: [Extract and list ACTUAL mobile development frameworks from job description + related mobile technologies]",
    "Emerging Technologies: [Extract and list ACTUAL emerging technologies mentioned in job description + related innovative tools]",
    "Methodologies & Practices: [Extract and list ACTUAL development methodologies and practices from job description + related process frameworks]"
  ]
}

CRITICAL REQUIREMENTS:
- 3 detailed project achievements (70-90 words each) with realistic project names, specific roles, challenges, solutions, and impact
- 4 strategic achievements (60-80 words each) incorporating keywords and soft skills from job description
- Technical skills must contain REAL technologies extracted from job posting - NO placeholder text
- Achieve 95%+ ATS score through comprehensive keyword integration and natural language flow
- Every sentence must be detailed, comprehensive, and professionally written
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
          content: 'You are an expert ATS optimization specialist and technical resume writer with 99.5% success rate. Create comprehensive, project-focused resumes that achieve 95%+ ATS scores through detailed real-world project descriptions (70-90 words each) and strategic keyword integration. CRITICAL: Always extract REAL technology names from job descriptions - never use placeholder text. Focus on creating longer, detailed sentences with comprehensive technical descriptions, specific project names, roles, challenges, and solutions. Each project achievement should be a complete story with quantified outcomes. Return ONLY valid JSON without any markdown formatting.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.4, // Slightly higher for more creative project descriptions
      max_tokens: 4500 // Increased for longer content
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
      max_tokens: 4500, // Increased for longer content
      messages: [
        {
          role: 'user',
          content: `${prompt}

CRITICAL INSTRUCTIONS:
- Return ONLY valid JSON without any markdown formatting, code blocks, or additional text
- Extract REAL technology names from the job description - never use placeholder text
- Create detailed project achievements (70-90 words each) with comprehensive technical descriptions
- Include realistic project names, specific roles, challenges, solutions, and quantified outcomes
- Strategic achievements should be 60-80 words with natural keyword integration
- Achieve 95%+ ATS score through comprehensive keyword placement and detailed content
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