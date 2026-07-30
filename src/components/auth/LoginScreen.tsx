import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { MapPin, Loader2, Sparkles } from 'lucide-react';

const DEMO_EMAIL = 'demo@parkapp.tech';
const DEMO_PASSWORD = 'demo123456';

export const LoginScreen = () => {
  const { signUp, signIn } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [submitting, setSubmitting] = useState(false);
  const [demoSubmitting, setDemoSubmitting] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    if (mode === 'signup') {
      if (!fullName.trim() || !phone.trim() || !email.trim() || password.length < 6) {
        toast({
          title: 'Missing details',
          description: 'Fill in your name, phone, email, and a password of at least 6 characters.',
          variant: 'destructive',
        });
        setSubmitting(false);
        return;
      }
      const { error, needsEmailConfirmation } = await signUp({ fullName, phone, email, password });
      if (error) {
        toast({ title: 'Sign up failed', description: error, variant: 'destructive' });
      } else if (needsEmailConfirmation) {
        setEmailSent(true);
      }
    } else {
      const { error } = await signIn(email, password);
      if (error) {
        toast({ title: 'Sign in failed', description: error, variant: 'destructive' });
      }
    }
    setSubmitting(false);
  };

  const handleDemoLogin = async () => {
    setDemoSubmitting(true);
    const { error } = await signIn(DEMO_EMAIL, DEMO_PASSWORD);
    if (error) {
      toast({
        title: 'Demo login unavailable',
        description: 'The demo account is not set up yet on this environment.',
        variant: 'destructive',
      });
    }
    setDemoSubmitting(false);
  };

  if (emailSent) {
    return (
      <div className="h-[100dvh] w-full max-w-md mx-auto bg-background flex flex-col items-center justify-center p-6 text-center gap-3">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
          <MapPin className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-xl font-bold">Check your inbox</h1>
        <p className="text-muted-foreground text-sm">
          We sent a confirmation link to {email}. Confirm it, then come back and sign in.
        </p>
        <Button variant="outline" className="mt-2" onClick={() => { setEmailSent(false); setMode('signin'); }}>
          Back to Sign In
        </Button>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] w-full max-w-md mx-auto bg-background flex flex-col overflow-y-auto">
      <div className="flex-1 flex flex-col justify-center p-6">
        <div className="flex flex-col items-center gap-2 mb-8">
          <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center shadow-lg">
            <MapPin className="h-7 w-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold">ParkApp</h1>
          <p className="text-muted-foreground text-sm text-center">
            {mode === 'signup' ? 'Create your account to start earning points' : 'Welcome back'}
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={handleDemoLogin}
          disabled={demoSubmitting}
          className="w-full mb-6 border-accent/50 bg-accent/10 hover:bg-accent/20 text-accent-foreground font-medium"
        >
          {demoSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2 text-accent" />}
          Quick Demo Login
        </Button>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && (
            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name</Label>
              <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Dimitris K." />
            </div>
          )}
          {mode === 'signup' && (
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+30 69XXXXXXXX" />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={mode === 'signin' ? DEMO_EMAIL : 'you@email.com'}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'signin' ? DEMO_PASSWORD : '••••••••'}
            />
          </div>

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {mode === 'signup' ? 'Create Account' : 'Sign In'}
          </Button>
        </form>

        <button
          type="button"
          onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
          className="text-sm text-muted-foreground text-center mt-6"
        >
          {mode === 'signin' ? (
            <>Don&apos;t have an account? <span className="text-primary font-medium">Sign up</span></>
          ) : (
            <>Already have an account? <span className="text-primary font-medium">Sign in</span></>
          )}
        </button>
      </div>
    </div>
  );
};
