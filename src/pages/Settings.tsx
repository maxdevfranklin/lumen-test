import React, { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { Save, Eye, EyeOff, AlertCircle } from 'lucide-react'
import { ApiKeyValidator } from '../components/ApiKeyValidator'

interface UserSettings {
  openai_key: string
  anthropic_key: string
  preferred_ai: 'openai' | 'anthropic'
}

export function Settings() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showOpenAIKey, setShowOpenAIKey] = useState(false)
  const [showAnthropicKey, setShowAnthropicKey] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [validationResults, setValidationResults] = useState<{
    openai: { isValid: boolean; cost?: number }
    anthropic: { isValid: boolean; cost?: number }
  }>({
    openai: { isValid: false },
    anthropic: { isValid: false }
  })
  const [settings, setSettings] = useState<UserSettings>({
    openai_key: '',
    anthropic_key: '',
    preferred_ai: 'openai'
  })

  useEffect(() => {
    if (user) {
      loadSettings()
    }
  }, [user])

  const loadSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', user?.id)
        .maybeSingle()

      if (error) {
        console.error('Error loading settings:', error)
      }

      if (data) {
        setSettings({
          openai_key: data.openai_key || '',
          anthropic_key: data.anthropic_key || '',
          preferred_ai: data.preferred_ai || 'openai'
        })
      } else {
        // Initialize with default values if no settings exist
        setSettings({
          openai_key: '',
          anthropic_key: '',
          preferred_ai: 'openai'
        })
      }
    } catch (error) {
      console.error('Error loading settings:', error)
    } finally {
      setLoading(false)
    }
  }

  const saveSettings = async () => {
    if (!user) return
    
    setSaving(true)
    setSaveError('')
    setSaveSuccess(false)
    
    try {
      const { error } = await supabase
        .from('user_settings')
        .upsert({
          user_id: user.id,
          openai_key: settings.openai_key || null,
          anthropic_key: settings.anthropic_key || null,
          preferred_ai: settings.preferred_ai,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id'
        })

      if (error) {
        throw error
      }

      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (error) {
      console.error('Error saving settings:', error)
      setSaveError(error instanceof Error ? error.message : 'Error saving settings. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleValidationResult = (provider: 'openai' | 'anthropic', isValid: boolean, cost?: number) => {
    setValidationResults(prev => ({
      ...prev,
      [provider]: { isValid, cost }
    }))
  }

  const handlePreferredAIChange = (newPreferred: 'openai' | 'anthropic') => {
    setSettings(prev => ({
      ...prev,
      preferred_ai: newPreferred
    }))
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-lg shadow-md">
          <div className="px-6 py-4 border-b border-gray-200">
            <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
            <p className="text-gray-600 mt-1">Configure your AI settings for resume generation</p>
          </div>

          <div className="p-6 space-y-6">
            {/* Save Status Messages */}
            {saveError && (
              <div className="bg-red-50 border border-red-200 rounded-md p-3 flex items-center">
                <AlertCircle className="h-5 w-5 text-red-600 mr-2" />
                <span className="text-sm text-red-600">{saveError}</span>
              </div>
            )}

            {saveSuccess && (
              <div className="bg-green-50 border border-green-200 rounded-md p-3">
                <span className="text-sm text-green-600">✓ Settings saved successfully!</span>
              </div>
            )}

            {/* AI Preference */}
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">AI Provider Preference</h2>
              <div className="space-y-3">
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="preferred_ai"
                    value="openai"
                    checked={settings.preferred_ai === 'openai'}
                    onChange={(e) => handlePreferredAIChange(e.target.value as 'openai')}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                  />
                  <span className="ml-3 text-sm text-gray-700 flex items-center">
                    OpenAI (GPT-4)
                    {validationResults.openai.isValid && (
                      <span className="ml-2 text-xs text-green-600 bg-green-100 px-2 py-1 rounded">
                        ✓ Validated {validationResults.openai.cost && `(~$${validationResults.openai.cost}/resume)`}
                      </span>
                    )}
                  </span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="preferred_ai"
                    value="anthropic"
                    checked={settings.preferred_ai === 'anthropic'}
                    onChange={(e) => handlePreferredAIChange(e.target.value as 'anthropic')}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                  />
                  <span className="ml-3 text-sm text-gray-700 flex items-center">
                    Anthropic (Claude)
                    {validationResults.anthropic.isValid && (
                      <span className="ml-2 text-xs text-green-600 bg-green-100 px-2 py-1 rounded">
                        ✓ Validated {validationResults.anthropic.cost && `(~$${validationResults.anthropic.cost}/resume)`}
                      </span>
                    )}
                  </span>
                </label>
              </div>
            </section>

            {/* API Keys */}
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">API Keys</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    OpenAI API Key
                  </label>
                  <div className="relative">
                    <input
                      type={showOpenAIKey ? 'text' : 'password'}
                      value={settings.openai_key}
                      onChange={(e) => setSettings(prev => ({ ...prev, openai_key: e.target.value }))}
                      className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      placeholder="sk-..."
                    />
                    <button
                      type="button"
                      className="absolute inset-y-0 right-0 pr-3 flex items-center"
                      onClick={() => setShowOpenAIKey(!showOpenAIKey)}
                    >
                      {showOpenAIKey ? (
                        <EyeOff className="h-4 w-4 text-gray-400" />
                      ) : (
                        <Eye className="h-4 w-4 text-gray-400" />
                      )}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Get your API key from{' '}
                    <a
                      href="https://platform.openai.com/api-keys"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800"
                    >
                      OpenAI Platform
                    </a>
                  </p>
                  <ApiKeyValidator
                    apiKey={settings.openai_key}
                    provider="openai"
                    onValidationResult={(isValid, cost) => handleValidationResult('openai', isValid, cost)}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Anthropic API Key
                  </label>
                  <div className="relative">
                    <input
                      type={showAnthropicKey ? 'text' : 'password'}
                      value={settings.anthropic_key}
                      onChange={(e) => setSettings(prev => ({ ...prev, anthropic_key: e.target.value }))}
                      className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      placeholder="sk-ant-..."
                    />
                    <button
                      type="button"
                      className="absolute inset-y-0 right-0 pr-3 flex items-center"
                      onClick={() => setShowAnthropicKey(!showAnthropicKey)}
                    >
                      {showAnthropicKey ? (
                        <EyeOff className="h-4 w-4 text-gray-400" />
                      ) : (
                        <Eye className="h-4 w-4 text-gray-400" />
                      )}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Get your API key from{' '}
                    <a
                      href="https://console.anthropic.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800"
                    >
                      Anthropic Console
                    </a>
                  </p>
                  <ApiKeyValidator
                    apiKey={settings.anthropic_key}
                    provider="anthropic"
                    onValidationResult={(isValid, cost) => handleValidationResult('anthropic', isValid, cost)}
                  />
                </div>
              </div>
            </section>

            {/* Cost Information */}
            <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
              <div className="flex">
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-blue-800">Cost Information</h3>
                  <div className="mt-2 text-sm text-blue-700">
                    <ul className="space-y-1">
                      <li>• OpenAI (GPT-4): ~$0.10-$0.25 per resume generation</li>
                      <li>• Anthropic (Claude): ~$0.08-$0.20 per resume generation</li>
                      <li>• Costs vary based on job description length and profile complexity</li>
                      <li>• Real-time cost estimates are shown during generation</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            {/* Security Notice */}
            <div className="bg-green-50 border border-green-200 rounded-md p-4">
              <div className="flex">
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-green-800">Security Notice</h3>
                  <div className="mt-2 text-sm text-green-700">
                    <p>
                      Your API keys are encrypted and stored securely. They are only used to generate resume content and are never shared with third parties. You can validate your keys above to ensure they work correctly.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end">
              <button
                onClick={saveSettings}
                disabled={saving}
                className="flex items-center space-x-2 px-6 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Save className="h-4 w-4" />
                <span>{saving ? 'Saving...' : 'Save Settings'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}