/*
  # Add updated_at column to resume_history table

  1. Changes
    - Add `updated_at` column to `resume_history` table
    - Set default value to current timestamp
    - Create trigger to automatically update the timestamp on record updates

  2. Security
    - No changes to existing RLS policies
*/

-- Add updated_at column to resume_history table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'resume_history' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE resume_history ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;
END $$;

-- Create trigger to automatically update updated_at timestamp
CREATE TRIGGER update_resume_history_updated_at
  BEFORE UPDATE ON resume_history
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();