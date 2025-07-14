# Database Migration Instructions

Your application is failing because the database tables don't exist. You need to manually apply the migration files to your Supabase database.

## Steps to Fix:

1. **Go to your Supabase Dashboard**
   - Visit https://supabase.com/dashboard
   - Select your project

2. **Open the SQL Editor**
   - Click on "SQL Editor" in the left sidebar

3. **Run the migrations in order** (copy and paste each SQL file content):

### Migration 1: Create profiles table
```sql
/*
  # Create profiles table

  1. New Tables
    - `profiles`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `name` (text)
      - `email` (text)
      - `phone` (text)
      - `location` (text)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on `profiles` table
    - Add policy for users to manage their own profile data
*/

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  location text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile"
  ON profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own profile"
  ON profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own profile"
  ON profiles
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create unique index on user_id to ensure one profile per user
CREATE UNIQUE INDEX IF NOT EXISTS profiles_user_id_idx ON profiles(user_id);
```

### Migration 2: Create work experiences table
```sql
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
```

### Migration 3: Create educations table
```sql
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
```

### Migration 4: Create user settings table
```sql
/*
  # Create user settings table

  1. New Tables
    - `user_settings`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `openai_key` (text, nullable, encrypted)
      - `anthropic_key` (text, nullable, encrypted)
      - `preferred_ai` (text, default 'openai')
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on `user_settings` table
    - Add policies for users to manage their own settings
*/

CREATE TABLE IF NOT EXISTS user_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  openai_key text,
  anthropic_key text,
  preferred_ai text DEFAULT 'openai' CHECK (preferred_ai IN ('openai', 'anthropic')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own settings"
  ON user_settings
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own settings"
  ON user_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own settings"
  ON user_settings
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own settings"
  ON user_settings
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create unique index on user_id to ensure one settings record per user
CREATE UNIQUE INDEX IF NOT EXISTS user_settings_user_id_idx ON user_settings(user_id);

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers to automatically update updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_settings_updated_at
  BEFORE UPDATE ON user_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

<<<<<<< HEAD
=======
### Migration 5: Add updated_at to resume_history table
```sql
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
```

>>>>>>> 4f41bb2 (WIP:local changes before pulling)
## After running all migrations:

1. **Verify the tables were created**
   - Go to "Table Editor" in your Supabase dashboard
   - You should see: `profiles`, `work_experiences`, `educations`, and `user_settings` tables

2. **Test your application**
   - Refresh your application
   - Try accessing the Profile page
   - The errors should be resolved

## Important Notes:

- Run the migrations in the exact order shown above
- Each migration builds on the previous one
- If you get any errors, check that you're running them in the correct order
- The `IF NOT EXISTS` clauses prevent errors if tables already exist