'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Ticket,
  CheckCircle2,
  Loader2,
  Copy,
  AlertCircle,
  Tv,
  User,
  Key,
  Calendar,
  Smartphone,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface ActivationResult {
  success: boolean;
  isNew: boolean;
  credentials: {
    username: string;
    password: string;
    expiresAt: string;
  };
}

export default function ActivatePage() {
  const [code, setCode] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [preferredUsername, setPreferredUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ActivationResult | null>(null);

  // Format code as user types (XXXXXX-XXXXXXXX)
  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^0-9]/g, '').slice(0, 14);
    setCode(value);
    setError(null);
  };

  const formatDisplayCode = (code: string) => {
    if (code.length <= 6) return code;
    return `${code.slice(0, 6)}-${code.slice(6)}`;
  };

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (code.length !== 14) {
      setError('Please enter a valid 14-digit activation code');
      return;
    }

    if (!deviceId.trim()) {
      setError('Please enter your device ID or MAC address');
      return;
    }

    setLoading(true);
    setError(null);

      try {
        const response = await fetch('/api-proxy/activate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code,
            deviceId: deviceId.trim(),
            preferredUsername: preferredUsername.trim() || undefined,
          }),
        });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Activation failed. Please check your code and try again.');
        return;
      }

      setResult(data);
    } catch (err) {
      setError('Unable to connect to the server. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copied', description: `${label} copied to clipboard` });
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo/Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
            <Tv className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-white">IPTV Activation</h1>
          <p className="text-slate-400 mt-1">Enter your activation code to get started</p>
        </div>

        {result ? (
          // Success State
          <Card className="border-green-500/20 bg-slate-800/50 backdrop-blur">
            <CardHeader className="text-center pb-2">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-500/10 mx-auto mb-2">
                <CheckCircle2 className="h-6 w-6 text-green-500" />
              </div>
              <CardTitle className="text-white">
                {result.isNew ? 'Activation Successful!' : 'Credentials Retrieved'}
              </CardTitle>
              <CardDescription className="text-slate-400">
                {result.isNew
                  ? 'Your account has been created. Save your credentials below.'
                  : 'Here are your existing account credentials.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Credentials */}
              <div className="space-y-3 p-4 rounded-lg bg-slate-900/50 border border-slate-700">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-slate-400">
                    <User className="h-4 w-4" />
                    <span className="text-sm">Username</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-white">{result.credentials.username}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-slate-400 hover:text-white"
                      onClick={() => copyToClipboard(result.credentials.username, 'Username')}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-slate-400">
                    <Key className="h-4 w-4" />
                    <span className="text-sm">Password</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-white">{result.credentials.password}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-slate-400 hover:text-white"
                      onClick={() => copyToClipboard(result.credentials.password, 'Password')}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-slate-400">
                    <Calendar className="h-4 w-4" />
                    <span className="text-sm">Expires</span>
                  </div>
                  <span className="text-white">{formatDate(result.credentials.expiresAt)}</span>
                </div>
              </div>

              {/* Copy All Button */}
              <Button
                variant="outline"
                className="w-full"
                onClick={() =>
                  copyToClipboard(
                    `Username: ${result.credentials.username}\nPassword: ${result.credentials.password}`,
                    'Credentials'
                  )
                }
              >
                <Copy className="h-4 w-4 mr-2" />
                Copy All Credentials
              </Button>

              {/* Important Notice */}
              <Alert className="bg-amber-500/10 border-amber-500/20">
                <AlertCircle className="h-4 w-4 text-amber-500" />
                <AlertTitle className="text-amber-500">Important</AlertTitle>
                <AlertDescription className="text-amber-200/80">
                  Save these credentials securely. You will need them to access IPTV services.
                </AlertDescription>
              </Alert>

              {/* Activate Another */}
              <Button
                variant="ghost"
                className="w-full text-slate-400 hover:text-white"
                onClick={() => {
                  setResult(null);
                  setCode('');
                  setDeviceId('');
                  setPreferredUsername('');
                }}
              >
                Activate Another Code
              </Button>
            </CardContent>
          </Card>
        ) : (
          // Activation Form
          <Card className="bg-slate-800/50 backdrop-blur border-slate-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Ticket className="h-5 w-5 text-primary" />
                Activate Code
              </CardTitle>
              <CardDescription className="text-slate-400">
                Enter your 14-digit activation code and device information
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleActivate} className="space-y-4">
                {/* Activation Code */}
                <div className="space-y-2">
                  <Label htmlFor="code" className="text-slate-300">
                    Activation Code *
                  </Label>
                  <div className="relative">
                    <Ticket className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                    <Input
                      id="code"
                      value={formatDisplayCode(code)}
                      onChange={handleCodeChange}
                      placeholder="Enter your 14-digit code"
                      className="pl-10 font-mono tracking-wider bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500"
                      maxLength={15}
                    />
                  </div>
                  <p className="text-xs text-slate-500">
                    {code.length}/14 digits
                  </p>
                </div>

                {/* Device ID */}
                <div className="space-y-2">
                  <Label htmlFor="deviceId" className="text-slate-300">
                    Device ID / MAC Address *
                  </Label>
                  <div className="relative">
                    <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                    <Input
                      id="deviceId"
                      value={deviceId}
                      onChange={(e) => {
                        setDeviceId(e.target.value);
                        setError(null);
                      }}
                      placeholder="e.g., AA:BB:CC:DD:EE:FF"
                      className="pl-10 font-mono bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500"
                    />
                  </div>
                  <p className="text-xs text-slate-500">
                    Your device will be locked to this account
                  </p>
                </div>

                {/* Preferred Username (Optional) */}
                <div className="space-y-2">
                  <Label htmlFor="preferredUsername" className="text-slate-300">
                    Preferred Username{' '}
                    <Badge variant="outline" className="ml-1 text-xs">
                      Optional
                    </Badge>
                  </Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                    <Input
                      id="preferredUsername"
                      value={preferredUsername}
                      onChange={(e) => setPreferredUsername(e.target.value)}
                      placeholder="Leave empty for auto-generated"
                      className="pl-10 bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500"
                      maxLength={50}
                    />
                  </div>
                </div>

                {/* Error Message */}
                {error && (
                  <Alert variant="destructive" className="bg-red-500/10 border-red-500/20">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                {/* Submit Button */}
                <Button
                  type="submit"
                  className="w-full"
                  size="lg"
                  disabled={loading || code.length !== 14}
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Activating...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Activate Code
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Footer */}
        <p className="text-center text-slate-500 text-sm mt-6">
          Need help? Contact your provider for support.
        </p>
      </div>
    </div>
  );
}
