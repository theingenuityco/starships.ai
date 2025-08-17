'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Eye, EyeOff, Save, ExternalLink, Zap, Shield, DollarSign } from 'lucide-react';
import api from '@/lib/api';

interface NativeToolConfig {
  name: string;
  displayName: string;
  description: string;
  apiKeyPlaceholder: string;
  signupUrl: string;
  pricing: string;
  icon: string;
}

const NATIVE_TOOLS: NativeToolConfig[] = [
  {
    name: 'tavily',
    displayName: 'Tavily Search',
    description: 'AI-optimized search engine for accurate, real-time results',
    apiKeyPlaceholder: 'tvly_xxxxx',
    signupUrl: 'https://tavily.com',
    pricing: '1,000 searches/month free',
    icon: '🔍'
  },
  {
    name: 'brave',
    displayName: 'Brave Search',
    description: 'Privacy-focused web search without tracking',
    apiKeyPlaceholder: 'BSA_xxxxx',
    signupUrl: 'https://brave.com/search/api/',
    pricing: '2,000 queries/month free',
    icon: '🦁'
  },
  {
    name: 'github',
    displayName: 'GitHub',
    description: 'Interact with GitHub repos, issues, PRs, and more',
    apiKeyPlaceholder: 'ghp_xxxxx or github_pat_xxxxx',
    signupUrl: 'https://github.com/settings/tokens',
    pricing: '5,000 requests/hour',
    icon: '🐙'
  },
  // TODO: Re-enable when OpenWeatherMap tool is available in LangChain
  // {
  //   name: 'openweather',
  //   displayName: 'OpenWeatherMap',
  //   description: 'Current weather and forecast data worldwide',
  //   apiKeyPlaceholder: 'Your OpenWeather API key',
  //   signupUrl: 'https://openweathermap.org/api',
  //   pricing: '1,000 calls/day free',
  //   icon: '🌤️'
  // }
];

interface NativeToolApiKeysProps {
  starshipId: string;
}

export function NativeToolApiKeys({ starshipId }: NativeToolApiKeysProps) {
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadApiKeys();
  }, [starshipId]);

  const loadApiKeys = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/api/starships/${starshipId}/native-api-keys`);
      
      if (response.data) {
        // Initialize with empty strings for tools that don't have keys
        const keys: Record<string, string> = {};
        NATIVE_TOOLS.forEach(tool => {
          keys[tool.name] = response.data[tool.name] || '';
        });
        setApiKeys(keys);
      }
    } catch (error) {
      console.error('Failed to load API keys:', error);
      // Initialize with empty keys on error
      const keys: Record<string, string> = {};
      NATIVE_TOOLS.forEach(tool => {
        keys[tool.name] = '';
      });
      setApiKeys(keys);
    } finally {
      setLoading(false);
    }
  };

  const saveApiKey = async (toolName: string) => {
    setSaving(toolName);
    setMessage(null);

    try {
      await api.post(`/api/starships/${starshipId}/native-api-keys`, {
        toolName,
        apiKey: apiKeys[toolName]
      });

      setMessage({ type: 'success', text: `${toolName} API key saved successfully!` });
      
      // Clear message after 3 seconds
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      setMessage({ type: 'error', text: `Failed to save ${toolName} API key` });
      console.error('Error saving API key:', error);
    } finally {
      setSaving(null);
    }
  };

  const toggleShowKey = (toolName: string) => {
    setShowKeys(prev => ({
      ...prev,
      [toolName]: !prev[toolName]
    }));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-yellow-500" />
          Native Tool API Keys
        </CardTitle>
        <CardDescription>
          Configure API keys for fast, native tool integrations. No Docker required!
        </CardDescription>
      </CardHeader>
      <CardContent>
        {message && (
          <Alert className={`mb-4 ${message.type === 'success' ? 'border-green-500' : 'border-red-500'}`}>
            <AlertDescription>{message.text}</AlertDescription>
          </Alert>
        )}

        <Tabs defaultValue="tavily" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            {NATIVE_TOOLS.map(tool => (
              <TabsTrigger key={tool.name} value={tool.name}>
                <span className="mr-2">{tool.icon}</span>
                {tool.displayName}
              </TabsTrigger>
            ))}
          </TabsList>

          {NATIVE_TOOLS.map(tool => (
            <TabsContent key={tool.name} value={tool.name} className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">{tool.description}</p>
                
                <div className="flex items-center gap-4 text-sm">
                  <span className="flex items-center gap-1">
                    <DollarSign className="h-3 w-3" />
                    {tool.pricing}
                  </span>
                  <a
                    href={tool.signupUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-blue-500 hover:underline"
                  >
                    Get API Key
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor={`${tool.name}-key`}>API Key</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      id={`${tool.name}-key`}
                      type={showKeys[tool.name] ? 'text' : '[DEFAULT-PASSWORD]'}
                      placeholder={tool.apiKeyPlaceholder}
                      value={apiKeys[tool.name] || ''}
                      onChange={(e) => setApiKeys(prev => ({
                        ...prev,
                        [tool.name]: e.target.value
                      }))}
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3"
                      onClick={() => toggleShowKey(tool.name)}
                    >
                      {showKeys[tool.name] ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <Button
                    onClick={() => saveApiKey(tool.name)}
                    disabled={!apiKeys[tool.name] || saving === tool.name}
                  >
                    {saving === tool.name ? (
                      'Saving...'
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        Save
                      </>
                    )}
                  </Button>
                </div>
                
                {apiKeys[tool.name] && (
                  <p className="text-xs text-green-600 flex items-center gap-1">
                    <Shield className="h-3 w-3" />
                    API key configured and encrypted
                  </p>
                )}
              </div>

              <Alert>
                <AlertDescription className="text-xs">
                  Your API key is encrypted and stored securely. It will only be used by your agents
                  to make API calls on your behalf. You are responsible for any costs incurred.
                </AlertDescription>
              </Alert>
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}