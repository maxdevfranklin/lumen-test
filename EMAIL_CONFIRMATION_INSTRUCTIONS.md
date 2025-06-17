# Email Confirmation Setup Instructions

You received a confirmation email because Supabase has email confirmation enabled by default. Here are your options:

## Option 1: Disable Email Confirmation (Recommended for Development)

1. **Go to your Supabase Dashboard**
   - Visit https://supabase.com/dashboard
   - Select your project

2. **Navigate to Authentication Settings**
   - Click on "Authentication" in the left sidebar
   - Click on "Settings" tab

3. **Disable Email Confirmation**
   - Scroll down to "User Signups" section
   - Find "Enable email confirmations" toggle
   - Turn it **OFF**
   - Click "Save"

4. **Test Registration Again**
   - Go back to your app
   - Try registering with a new email
   - You should be able to sign in immediately without confirmation

## Option 2: Confirm Your Email (If you want to keep email confirmation)

1. **Check Your Email**
   - Look for an email from your Supabase project
   - Subject will be something like "Confirm your signup"

2. **Click the Confirmation Link**
   - Open the email and click the confirmation link
   - This will verify your email address

3. **Return to Your App**
   - Go back to the login page
   - Sign in with your email and password

## Option 3: Configure Email Templates (Advanced)

If you want to keep email confirmation but customize it:

1. **Go to Authentication > Email Templates**
2. **Customize the "Confirm signup" template**
3. **Make sure the confirmation URL points to your app**

## Recommended for Development

For development purposes, **Option 1 (disabling email confirmation)** is recommended as it makes testing much easier. You can always re-enable it later for production.

## Current Status

After you choose one of the options above:
- Your registration should work smoothly
- You'll be able to access the Profile page
- The application will function as expected

Choose the option that best fits your current needs!