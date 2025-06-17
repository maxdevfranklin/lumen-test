/*
  # Enhanced Resume Generation with Real Technical Skills Extraction

  This edge function creates ATS-optimized resumes by:
  1. Using GPT-3.5-turbo (cheapest model) for cost efficiency
  2. Including exactly 2 realistic project names per work experience
  3. Extracting REAL technical skills from job descriptions (no placeholders)
  4. Creating comprehensive technical and soft skill integration
  5. Maximizing ATS score through strategic keyword placement
  6. Balancing project details with keyword-rich achievements

  ## Features
  - Cost-optimized using GPT-3.5-turbo model
  - Exactly 2 real-world projects per work experience
  - 6 additional achievements focused on soft skills and ATS keywords
  - REAL technical skills extraction (no placeholder text)
  - Strategic keyword distribution for maximum ATS compatibility
  - Industry-specific realistic project implementations
  - Comprehensive soft skill integration
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

    // Generate AI content with balanced project and keyword focus
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
  const prompt = createBalancedPrompt(jobDescription, profile, workExperiences, educations)
  
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

function createBalancedPrompt(
  jobDescription: string,
  profile: UserProfile,
  workExperiences: WorkExperience[],
  educations: Education[]
): string {
  return `
You are an expert ATS optimization specialist. Create a resume with 99%+ ATS score by strategically balancing 2 realistic projects with keyword-rich achievements.

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

CRITICAL ATS OPTIMIZATION STRATEGY:

1. PROFESSIONAL TITLE: Exact job title match + 2-3 primary keywords from job description

2. PROFESSIONAL SUMMARY: 6 sentences (25-35 words each) incorporating 40+ technical AND soft skill keywords naturally

3. WORK EXPERIENCE ACHIEVEMENTS: Generate exactly 8 achievements per job position

   ACHIEVEMENT DISTRIBUTION:
   
   A) 2 PROJECT-BASED ACHIEVEMENTS (50-70 words each):
   - Include realistic project names with comprehensive technical details
   - Detail project scope, your role, challenges, and solutions
   - Focus on technical implementation and measurable outcomes
   
   B) 6 KEYWORD-OPTIMIZED ACHIEVEMENTS (40-60 words each):
   - Integrate soft skills from job description (leadership, communication, collaboration, problem-solving, etc.)
   - Include industry-specific terminology and methodologies
   - Incorporate technical keywords not covered in project achievements
   - Focus on team dynamics, process improvements, and business impact
   - Include certifications, training, and professional development mentioned in job description

   REALISTIC PROJECT NAME EXAMPLES BY INDUSTRY:
   - Software: "UserDashboard Modernization", "APIGateway Implementation", "DataPipeline Optimization"
   - Healthcare: "PatientPortal Enhancement", "EHRIntegration Project", "TelehealthPlatform Development"
   - Finance: "RiskAnalytics Engine", "PaymentProcessing Upgrade", "ComplianceAutomation Suite"
   - E-commerce: "CheckoutFlow Redesign", "InventoryManagement System", "RecommendationEngine Build"
   - Enterprise: "WorkflowAutomation Platform", "SecurityFramework Implementation", "PerformanceMonitoring Suite"

4. SOFT SKILLS INTEGRATION: Extract and incorporate ALL soft skills from job description:
   - Leadership and team management
   - Communication and presentation skills
   - Problem-solving and analytical thinking
   - Collaboration and cross-functional teamwork
   - Adaptability and continuous learning
   - Customer focus and stakeholder management
   - Innovation and creative thinking
   - Time management and prioritization
   - Mentoring and knowledge sharing
   - Strategic planning and execution

5. TECHNICAL SKILLS: CRITICAL - Extract REAL technical skills from the job description. DO NOT use placeholder text like "[List from JD]" or "[ALL from job description]". 

   STEP-BY-STEP TECHNICAL SKILLS EXTRACTION:
   
   a) Read the job description carefully and identify ACTUAL technical terms mentioned
   b) Group them into logical categories
   c) Add relevant complementary skills that would be expected for this role
   d) List specific technologies, frameworks, languages, tools, and platforms
   
   EXAMPLE EXTRACTION PROCESS:
   If job description mentions: "React, Node.js, AWS, Docker, PostgreSQL, REST APIs, Agile"
   Then create categories like:
   - "Programming Languages: JavaScript, TypeScript, Python, HTML5, CSS3"
   - "Frontend Frameworks: React.js, Redux, Material-UI, Bootstrap"
   - "Backend Technologies: Node.js, Express.js, RESTful APIs, GraphQL"
   - "Databases: PostgreSQL, MongoDB, Redis"
   - "Cloud Platforms: AWS (EC2, S3, Lambda), Docker, Kubernetes"
   - "Development Methodologies: Agile, Scrum, CI/CD, Git"

6. KEYWORD DENSITY: Each keyword appears 3-4 times across different sections

CRITICAL: Generate exactly 8 achievements for ALL ${workExperiences.length} work experiences. 2 must be project-focused, 6 must be keyword/soft-skill optimized.

IMPORTANT: Return ONLY valid JSON without any markdown formatting, code blocks, or additional text. The response must start with { and end with }.

CRITICAL FOR TECHNICAL SKILLS: You MUST extract real technical terms from the job description. Never use placeholder text like "[List from JD]", "[ALL from job description]", or similar. Always provide specific, actual technology names.

Return valid JSON:
{
  "professionalTitle": "[Exact Job Title] | [Primary Tech Stack] | [Key Soft Skill from Job Description]",
  "professionalSummary": "[6 sentences incorporating 40+ technical and soft skill keywords, each 25-35 words, naturally flowing and professionally written]",
  "workExperiences": [
    {
      "company": "${workExperiences[0]?.company || 'Company1'}",
      "achievements": [
        "[50-70 word PROJECT achievement with realistic project name, scope, technical role, challenges, solutions, and measurable outcomes]",
        "[50-70 word PROJECT achievement with different realistic project name, technical implementation focus, and business impact]",
        "[40-60 word LEADERSHIP achievement incorporating soft skills like team management, communication, and strategic planning from job description]",
        "[40-60 word COLLABORATION achievement focusing on cross-functional teamwork, stakeholder management, and relationship building from job description]",
        "[40-60 word PROCESS IMPROVEMENT achievement highlighting problem-solving, analytical thinking, and innovation from job description]",
        "[40-60 word MENTORING achievement emphasizing knowledge sharing, training, and professional development from job description]",
        "[40-60 word CUSTOMER FOCUS achievement incorporating customer service, user experience, and business value from job description]",
        "[40-60 word TECHNICAL EXCELLENCE achievement highlighting quality, best practices, and continuous learning from job description]"
      ]
    }${workExperiences.length > 1 ? `,
    {
      "company": "${workExperiences[1]?.company || 'Company2'}",
      "achievements": [
        "[50-70 word PROJECT achievement with realistic project name, scope, technical role, challenges, solutions, and measurable outcomes]",
        "[50-70 word PROJECT achievement with different realistic project name, technical implementation focus, and business impact]",
        "[40-60 word LEADERSHIP achievement incorporating soft skills like team management, communication, and strategic planning from job description]",
        "[40-60 word COLLABORATION achievement focusing on cross-functional teamwork, stakeholder management, and relationship building from job description]",
        "[40-60 word PROCESS IMPROVEMENT achievement highlighting problem-solving, analytical thinking, and innovation from job description]",
        "[40-60 word MENTORING achievement emphasizing knowledge sharing, training, and professional development from job description]",
        "[40-60 word CUSTOMER FOCUS achievement incorporating customer service, user experience, and business value from job description]",
        "[40-60 word TECHNICAL EXCELLENCE achievement highlighting quality, best practices, and continuous learning from job description]"
      ]
    }` : ''}${workExperiences.length > 2 ? workExperiences.slice(2).map((work) => `,
    {
      "company": "${work.company}",
      "achievements": [
        "[50-70 word PROJECT achievement with realistic project name, scope, technical role, challenges, solutions, and measurable outcomes]",
        "[50-70 word PROJECT achievement with different realistic project name, technical implementation focus, and business impact]",
        "[40-60 word LEADERSHIP achievement incorporating soft skills like team management, communication, and strategic planning from job description]",
        "[40-60 word COLLABORATION achievement focusing on cross-functional teamwork, stakeholder management, and relationship building from job description]",
        "[40-60 word PROCESS IMPROVEMENT achievement highlighting problem-solving, analytical thinking, and innovation from job description]",
        "[40-60 word MENTORING achievement emphasizing knowledge sharing, training, and professional development from job description]",
        "[40-60 word CUSTOMER FOCUS achievement incorporating customer service, user experience, and business value from job description]",
        "[40-60 word TECHNICAL EXCELLENCE achievement highlighting quality, best practices, and continuous learning from job description]"
      ]
    }`).join('') : ''}
  ],
  "technicalSkills": [
    "Programming Languages: [Extract ACTUAL programming languages mentioned in job description + relevant ones like JavaScript, Python, Java, etc.]",
    "Frontend Technologies: [Extract ACTUAL frontend frameworks mentioned + relevant ones like React, Angular, Vue, etc.]",
    "Backend Technologies: [Extract ACTUAL backend technologies mentioned + relevant ones like Node.js, Express, Django, etc.]",
    "Databases & Data Storage: [Extract ACTUAL database systems mentioned + relevant ones like PostgreSQL, MongoDB, MySQL, etc.]",
    "Cloud Platforms & Services: [Extract ACTUAL cloud services mentioned + relevant ones like AWS, Azure, GCP, etc.]",
    "DevOps & Infrastructure: [Extract ACTUAL DevOps tools mentioned + relevant ones like Docker, Kubernetes, Jenkins, etc.]",
    "Development Tools & IDEs: [Extract ACTUAL development tools mentioned + relevant ones like Git, VS Code, IntelliJ, etc.]",
    "Testing & Quality Assurance: [Extract ACTUAL testing frameworks mentioned + relevant ones like Jest, Cypress, Selenium, etc.]",
    "APIs & Integration: [Extract ACTUAL API technologies mentioned + relevant ones like REST, GraphQL, WebSocket, etc.]",
    "Monitoring & Analytics: [Extract ACTUAL monitoring tools mentioned + relevant ones like New Relic, DataDog, Google Analytics, etc.]",
    "Security & Compliance: [Extract ACTUAL security frameworks mentioned + relevant ones like OAuth, JWT, HTTPS, etc.]",
    "Data Science & Analytics: [Extract ACTUAL data tools mentioned + relevant ones like Pandas, NumPy, Tableau, etc.]",
    "Mobile & Cross-Platform: [Extract ACTUAL mobile technologies mentioned + relevant ones like React Native, Flutter, iOS, Android, etc.]",
    "Emerging Technologies: [Extract ACTUAL emerging tech mentioned + relevant ones like AI/ML, Blockchain, IoT, etc.]",
    "Methodologies & Practices: [Extract ACTUAL methodologies mentioned + relevant ones like Agile, Scrum, TDD, CI/CD, etc.]"
  ]
}

FOCUS: Perfect balance between 2 detailed project examples and 6 keyword-rich achievements that incorporate every soft skill and technical term from the job description for maximum ATS compatibility. NEVER use placeholder text in technical skills - always extract and list real technologies.
`
}

function extractJsonFromContent(content: string): string {
  // First, try to find JSON within markdown code blocks
  const codeBlockRegex = /```(?:json)?\s*(\{[\s\S]*?\})\s*```/i
  const codeBlockMatch = content.match(codeBlockRegex)
  
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim()
  }
  
  // If no code blocks, try to find JSON object in the content
  const jsonRegex = /\{[\s\S]*\}/
  const jsonMatch = content.match(jsonRegex)
  
  if (jsonMatch) {
    return jsonMatch[0].trim()
  }
  
  // If no JSON found, return the original content
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
          content: 'You are an expert ATS optimization specialist and resume writer. Create resumes with 99%+ ATS scores by perfectly balancing 2 realistic project examples with 6 keyword-rich achievements per work experience. Focus on incorporating ALL technical keywords AND soft skills from job descriptions while maintaining natural language flow. Generate detailed project examples (50-70 words) with authentic names, scope, and technical challenges, plus strategic keyword-optimized achievements (40-60 words) that cover leadership, collaboration, problem-solving, and other soft skills mentioned in the job description. CRITICAL: For technical skills, you MUST extract real technology names from the job description - NEVER use placeholder text like "[List from JD]" or "[ALL from job description]". Always provide specific, actual technology names and frameworks. Return ONLY valid JSON without any markdown formatting, code blocks, or additional text.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
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
    // Extract JSON from the content, handling markdown code blocks
    const jsonContent = extractJsonFromContent(content)
    return JSON.parse(jsonContent)
  } catch (error) {
    console.error('Failed to parse OpenAI response:', content)
    console.error('Extraction attempt:', extractJsonFromContent(content))
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

CRITICAL: Return ONLY valid JSON without any markdown formatting, code blocks, or additional text. The response must start with { and end with }. For technical skills, you MUST extract real technology names from the job description - NEVER use placeholder text like "[List from JD]" or "[ALL from job description]". Always provide specific, actual technology names and frameworks.`
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
    // Extract JSON from the content, handling markdown code blocks
    const jsonContent = extractJsonFromContent(content)
    return JSON.parse(jsonContent)
  } catch (error) {
    console.error('Failed to parse Anthropic response:', content)
    console.error('Extraction attempt:', extractJsonFromContent(content))
    throw new Error('Invalid response from AI service - unable to parse JSON')
  }
}