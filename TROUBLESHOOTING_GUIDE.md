# Authentication & Database Troubleshooting Guide

## Issue: Created account but can't sign in

You're experiencing this because of two potential issues that need to be resolved:

### 1. Email Confirmation Issue

**Check if email confirmation is enabled:**
1. Go to your Supabase Dashboard → Authentication → Settings
2. Look for "Enable email confirmations" 
3. If it's ON, you have two options:
   - **Option A (Recommended):** Turn it OFF and try registering again
   - **Option B:** Check your email for a confirmation link and click it

### 2. Database Tables Not Applied

**The migration files exist but may not be applied to your database:**

1. **Go to Supabase Dashboard → SQL Editor**
2. **Run each migration in order** (copy/paste the SQL):

#### Migration 1: Profiles Table
```sql
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
  ON profiles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own profile"
  ON profiles FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE UNIQUE INDEX IF NOT EXISTS profiles_user_id_idx ON profiles(user_id);
```

#### Migration 2: Work Experiences Table
```sql
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
  ON work_experiences FOR SELECT TO authenticated
  USING (profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert own work experiences"
  ON work_experiences FOR INSERT TO authenticated
  WITH CHECK (profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can update own work experiences"
  ON work_experiences FOR UPDATE TO authenticated
  USING (profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()))
  WITH CHECK (profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete own work experiences"
  ON work_experiences FOR DELETE TO authenticated
  USING (profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS work_experiences_profile_id_idx ON work_experiences(profile_id);
CREATE INDEX IF NOT EXISTS work_experiences_start_date_idx ON work_experiences(start_date DESC);
```

#### Migration 3: Educations Table
```sql
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
  ON educations FOR SELECT TO authenticated
  USING (profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert own educations"
  ON educations FOR INSERT TO authenticated
  WITH CHECK (profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can update own educations"
  ON educations FOR UPDATE TO authenticated
  USING (profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()))
  WITH CHECK (profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete own educations"
  ON educations FOR DELETE TO authenticated
  USING (profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS educations_profile_id_idx ON educations(profile_id);
CREATE INDEX IF NOT EXISTS educations_start_date_idx ON educations(start_date DESC);
```

#### Migration 4: User Settings Table
```sql
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
  ON user_settings FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own settings"
  ON user_settings FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own settings"
  ON user_settings FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own settings"
  ON user_settings FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE UNIQUE INDEX IF NOT EXISTS user_settings_user_id_idx ON user_settings(user_id);

-- Create function and triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_settings_updated_at
  BEFORE UPDATE ON user_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
<<<<<<< HEAD
=======

-- Add updated_at to resume_history table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'resume_history' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE resume_history ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;
END $$;

CREATE TRIGGER update_resume_history_updated_at
  BEFORE UPDATE ON resume_history
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
>>>>>>> 4f41bb2 (WIP:local changes before pulling)
```

### 3. Verification Steps

After completing the above:

1. **Check Tables Created:**
   - Go to Supabase Dashboard → Table Editor
   - You should see: `profiles`, `work_experiences`, `educations`, `user_settings`

2. **Check Authentication:**
   - Go to Supabase Dashboard → Authentication → Users
   - You should see your user account listed

3. **Test Sign In:**
   - If email confirmation was disabled, try signing in
   - If you confirmed your email, try signing in
   - If still having issues, try registering a new account

### 4. Quick Fix Steps

**Do this in order:**

1. **Disable email confirmation** (Supabase Dashboard → Auth → Settings)
2. **Run all 4 SQL migrations** (Supabase Dashboard → SQL Editor)
3. **Try registering a new account** or **sign in with existing account**
4. **Access the Profile page** to verify everything works

### 5. If Still Having Issues

- Check browser console for specific error messages
- Verify your `.env` file has the correct Supabase URL and anon key
- Make sure you're using the correct email/password combination
- Try clearing browser cache and cookies

The most likely issue is that email confirmation is enabled and you haven't confirmed your email yet. Start with disabling email confirmation for easier development.