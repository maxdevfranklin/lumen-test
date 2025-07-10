import { supabase } from '../lib/supabase'

export async function generateResume(jobDescription: string, userId: string, customRoles?: { [key: string]: string }) {
  // Call the Supabase Edge Function instead of making direct API calls
  const { data, error } = await supabase.functions.invoke('generate-resume', {
    body: { jobDescription, customRoles }
  })

  if (error) {
    console.error('Edge function error:', error)
    throw new Error(error.message || 'Failed to generate resume')
  }

  if (!data) {
    throw new Error('No data returned from resume generation')
  }

  return data
}