/*
  # Create job history and resume history tables

  1. New Tables
    - `job_history`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `company_name` (text)
      - `role` (text)
      - `job_description` (text)
      - `note` (text, nullable)
      - `created_at` (timestamp)

    - `resume_history`
      - `id` (uuid, primary key)
      - `job_history_id` (uuid, references job_history)
      - `resume_data` (jsonb) - stores the complete generated resume
      - `generation_cost` (decimal, nullable)
      - `ai_provider` (text)
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on both tables
    - Add policies for users to manage their own history data
*/

CREATE TABLE IF NOT EXISTS job_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  company_name text NOT NULL,
  role text NOT NULL,
  job_description text NOT NULL,
  note text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS resume_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_history_id uuid REFERENCES job_history(id) ON DELETE CASCADE NOT NULL,
  resume_data jsonb NOT NULL,
  generation_cost decimal(10,3),
  ai_provider text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE job_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE resume_history ENABLE ROW LEVEL SECURITY;

-- Job History Policies
CREATE POLICY "Users can view own job history"
  ON job_history
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own job history"
  ON job_history
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own job history"
  ON job_history
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own job history"
  ON job_history
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Resume History Policies
CREATE POLICY "Users can view own resume history"
  ON resume_history
  FOR SELECT
  TO authenticated
  USING (
    job_history_id IN (
      SELECT id FROM job_history WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own resume history"
  ON resume_history
  FOR INSERT
  TO authenticated
  WITH CHECK (
    job_history_id IN (
      SELECT id FROM job_history WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own resume history"
  ON resume_history
  FOR UPDATE
  TO authenticated
  USING (
    job_history_id IN (
      SELECT id FROM job_history WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    job_history_id IN (
      SELECT id FROM job_history WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own resume history"
  ON resume_history
  FOR DELETE
  TO authenticated
  USING (
    job_history_id IN (
      SELECT id FROM job_history WHERE user_id = auth.uid()
    )
  );

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS job_history_user_id_idx ON job_history(user_id);
CREATE INDEX IF NOT EXISTS job_history_created_at_idx ON job_history(created_at DESC);
CREATE INDEX IF NOT EXISTS job_history_company_name_idx ON job_history(company_name);
CREATE INDEX IF NOT EXISTS job_history_role_idx ON job_history(role);
CREATE INDEX IF NOT EXISTS resume_history_job_history_id_idx ON resume_history(job_history_id);
CREATE INDEX IF NOT EXISTS resume_history_created_at_idx ON resume_history(created_at DESC);

-- Create full-text search indexes for job description and note
CREATE INDEX IF NOT EXISTS job_history_search_idx ON job_history USING gin(to_tsvector('english', job_description || ' ' || COALESCE(note, '')));