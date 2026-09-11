import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage, type Language } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { MapPin, Loader2, Sparkles } from 'lucide-react';

const DEMO_EMAIL = 'demo@parkapp.tech';
const DEMO_PASSWORD = 'demo123456';

const LANGUAGE_LABELS: Record<Language, string> = { en: 'EN', gr: 'GR', tr: 'TR', pl: 'PL' };

const LanguageToggle = () => {
  const { language, setLanguage } = useLanguage();
  return (
    <div className="absolute top-4 right-4 z-10 flex rounded-full border border-border bg-background/80 backdrop-blur-sm p-0.5 shadow-sm">
      {(['en', 'gr', 'tr', 'pl'] as Language[]).map((lang) => (
        <button
          key={lang}
          type="button"
          onClick={() => setLanguage(lang)}
          className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
            language === lang
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {LANGUAGE_LABELS[lang]}
        </button>
      ))}
    </div>
  );
};

export const LoginScreen = () => {
  const { signUp, signIn } = useAuth();
  const { t } = useLanguage();
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
          title: t('login.missingDetails'),
          description: t('login.missingDetailsDesc'),
          variant: 'destructive',
        });
        setSubmitting(false);
        return;
      }
      const { error, needsEmailConfirmation } = await signUp({ fullName, phone, email, password });
      if (error) {
        toast({ title: t('login.signUpFailed'), description: error, variant: 'destructive' });
      } else if (needsEmailConfirmation) {
        setEmailSent(true);
      }
    } else {
      const { error } = await signIn(email, password);
      if (error) {
        toast({ title: t('login.signInFailed'), description: error, variant: 'destructive' });
      }
    }
    setSubmitting(false);
  };

  const handleDemoLogin = async () => {
    setDemoSubmitting(true);
    const { error } = await signIn(DEMO_EMAIL, DEMO_PASSWORD);
    if (error) {
      toast({
        title: t('login.demoUnavailable'),
        description: t('login.demoUnavailableDesc'),
        variant: 'destructive',
      });
    }
    setDemoSubmitting(false);
  };

  if (emailSent) {
    return (
      <div className="relative h-[100dvh] w-full max-w-md mx-auto bg-background flex flex-col items-center justify-center p-6 text-center gap-3">
        <LanguageToggle />
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
          <MapPin className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-xl font-bold">{t('login.checkInbox')}</h1>
        <p className="text-muted-foreground text-sm">
          {t('login.confirmationSent', { email })}
        </p>
        <Button variant="outline" className="mt-2" onClick={() => { setEmailSent(false); setMode('signin'); }}>
          {t('login.backToSignIn')}
        </Button>
      </div>
    );
  }

  return (
    <div className="relative h-[100dvh] w-full max-w-md mx-auto bg-background flex flex-col overflow-y-auto">
      <LanguageToggle />
      <div className="flex-1 flex flex-col p-6">
        {/* Centered login content -- its own flex-1 keeps it vertically
            centered in whatever space is left above the footer signature. */}
        <div className="flex-1 flex flex-col justify-center">
          <div className="flex flex-col items-center gap-2 mb-8">
            <img src="/parkapp-logo.png" alt="ParkApp Logo" className="h-16 w-auto object-contain mx-auto" />
            <p className="text-muted-foreground text-sm text-center">
              {mode === 'signup' ? t('login.createSubtitle') : t('login.welcomeBack')}
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
            {t('login.quickDemo')}
          </Button>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div className="space-y-2">
                <Label htmlFor="fullName">{t('login.fullName')}</Label>
                <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Dimitris K." />
              </div>
            )}
            {mode === 'signup' && (
              <div className="space-y-2">
                <Label htmlFor="phone">{t('login.phone')}</Label>
                <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+30 69XXXXXXXX" />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">{t('login.email')}</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={mode === 'signin' ? DEMO_EMAIL : 'you@email.com'}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t('login.password')}</Label>
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
              {mode === 'signup' ? t('login.createAccount') : t('login.signIn')}
            </Button>
          </form>

          <button
            type="button"
            onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
            className="text-sm text-muted-foreground text-center mt-6"
          >
            {mode === 'signin' ? (
              <>{t('login.noAccount')} <span className="text-primary font-medium">{t('login.signUpLink')}</span></>
            ) : (
              <>{t('login.haveAccount')} <span className="text-primary font-medium">{t('login.signInLink')}</span></>
            )}
          </button>
        </div>

        {/* Footer signature -- pinned to the bottom of the card so it reads
            as a proud company mark rather than a cramped afterthought. */}
        <div className="flex items-center justify-center gap-3 mt-10 pt-4 pb-2">
          <span className="text-base font-semibold text-foreground/80">{t('login.poweredBy')}</span>
          <img src="/urbansync-logo.jpg" alt="Urban Sync" className="h-12 w-auto object-contain" />
        </div>
      </div>
    </div>
  );
};
