/*
  # Create educations table

  1. New Tables
    - `educations`
      - `id` (uuid, primary key)
      - `profile_id` (uuid, references profiles)
      - `university` (text)
      - `degree` (text)
      - `start_date` (date)
      - `end_date` (date)
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on `educations` table
    - Add policies for users to manage their own education data
*/

CREATE TABLE IF NOT EXISTS educations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  university text NOT NULL,
  degree text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE educations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own educations"
  ON educations
  FOR SELECT
  TO authenticated
  USING (
    profile_id IN (
      SELECT id FROM profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own educations"
  ON educations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    profile_id IN (
      SELECT id FROM profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own educations"
  ON educations
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

CREATE POLICY "Users can delete own educations"
  ON educations
  FOR DELETE
  TO authenticated
  USING (
    profile_id IN (
      SELECT id FROM profiles WHERE user_id = auth.uid()
    )
  );

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS educations_profile_id_idx ON educations(profile_id);
CREATE INDEX IF NOT EXISTS educations_start_date_idx ON educations(start_date DESC);