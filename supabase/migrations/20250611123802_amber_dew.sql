/*
  # Create work experiences table

  1. New Tables
    - `work_experiences`
      - `id` (uuid, primary key)
      - `profile_id` (uuid, references profiles)
      - `company` (text)
      - `position` (text)
      - `start_date` (date)
      - `end_date` (date, nullable)
      - `is_current` (boolean, default false)
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on `work_experiences` table
    - Add policies for users to manage their own work experience data
*/

CREATE TABLE IF NOT EXISTS work_experiences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  company text NOT NULL,
  position text NOT NULL,
  start_date date NOT NULL,
  end_date date,
  is_current boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE work_experiences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own work experiences"
  ON work_experiences
  FOR SELECT
  TO authenticated
  USING (
    profile_id IN (
      SELECT id FROM profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own work experiences"
  ON work_experiences
  FOR INSERT
  TO authenticated
  WITH CHECK (
    profile_id IN (
      SELECT id FROM profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own work experiences"
  ON work_experiences
  FOR UPDATE
  TO authenticated
  USING (
    profile_id IN (
      SELECT id FROM profiles WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    profile_id IN (
      SELECT id FROM profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own work experiences"
  ON work_experiences
  FOR DELETE
  TO authenticated
  USING (
    profile_id IN (
      SELECT id FROM profiles WHERE user_id = auth.uid()
    )
  );

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS work_experiences_profile_id_idx ON work_experiences(profile_id);
CREATE INDEX IF NOT EXISTS work_experiences_start_date_idx ON work_experiences(start_date DESC);