import React, { useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useAuth, maskPlate } from '@/contexts/AuthContext';
import { useLanguage, type Language } from '@/contexts/LanguageContext';
import { useAdminAccess } from '@/hooks/useAdminAccess';
import { User, Moon, Bell, Shield, LogOut, ChevronRight, Crown, Building2, Gem, TrendingUp, Loader2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';

const NOTIFICATIONS_KEY = 'parkapp_notifications_enabled';
const LANGUAGE_LABELS: Record<Language, string> = { en: 'EN', gr: 'GR', tr: 'TR' };

export const ProfileTab = () => {
  const { darkMode, toggleDarkMode, citizenVerified, setAdminMode } = useApp();
  const { profile, signOut, updateProfileDetails } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const { isAdmin, municipalityName } = useAdminAccess();

  const [editOpen, setEditOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editName, setEditName] = useState('');
  const [editMake, setEditMake] = useState('');
  const [editColor, setEditColor] = useState('');
  const [editPlate, setEditPlate] = useState('');
  const [notificationsOn, setNotificationsOn] = useState(
    () => localStorage.getItem(NOTIFICATIONS_KEY) !== 'off'
  );

  const openEdit = () => {
    setEditName(profile?.full_name ?? '');
    setEditMake(profile?.vehicle_make ?? '');
    setEditColor(profile?.vehicle_color ?? '');
    setEditPlate(profile?.vehicle_plate ?? '');
    setEditOpen(true);
  };

  const handleSaveProfile = async () => {
    if (!editName.trim() || !editMake.trim() || !editColor.trim() || !editPlate.trim()) {
      toast({ title: t('profile.allFieldsRequired'), variant: 'destructive' });
      return;
    }
    setSaving(true);
    const { error } = await updateProfileDetails({
      fullName: editName.trim(),
      make: editMake.trim(),
      color: editColor.trim(),
      plate: editPlate.trim().toUpperCase(),
    });
    setSaving(false);
    if (error) {
      toast({ title: t('profile.couldNotSave'), description: error, variant: 'destructive' });
    } else {
      toast({ title: t('profile.updated') });
      setEditOpen(false);
    }
  };

  const handleNotificationsToggle = (on: boolean) => {
    setNotificationsOn(on);
    localStorage.setItem(NOTIFICATIONS_KEY, on ? 'on' : 'off');
    toast({
      title: on ? t('profile.notifOn') : t('profile.notifOff'),
      description: on ? t('profile.notifOnDesc') : t('profile.notifOffDesc'),
    });
  };
  const points = profile?.points_balance ?? 0;
  const isPremium = profile?.membership_tier === 'premium';

  const initials = (profile?.full_name ?? '?')
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="h-full overflow-y-auto pb-24">
      {/* Header */}
      <div className="bg-gradient-to-br from-primary to-primary/80 text-primary-foreground p-6 pb-8">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center text-2xl font-bold backdrop-blur-sm">
            {initials}
          </div>
          <div>
            <h1 className="text-xl font-bold">{profile?.full_name ?? 'ParkApp User'}</h1>
            <p className="text-primary-foreground/80 text-sm">{profile?.email}</p>
            {profile?.vehicle_plate && (
              <p className="text-primary-foreground/70 text-xs font-mono mt-0.5">
                {profile.vehicle_color} {profile.vehicle_make} · {maskPlate(profile.vehicle_plate)}
              </p>
            )}
            <div className="flex items-center gap-2 mt-2">
              {isPremium ? (
                <span className="bg-accent text-accent-foreground text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
                  <Crown className="h-3 w-3" /> {t('profile.premium')}
                </span>
              ) : (
                <span className="bg-white/20 text-xs font-medium px-3 py-1 rounded-full">
                  {t('profile.freeTier')}
                </span>
              )}
              {citizenVerified && (
                <span className="bg-success text-success-foreground text-xs font-medium px-3 py-1 rounded-full flex items-center gap-1">
                  <Shield className="h-3 w-3" /> {t('profile.resident')}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4 -mt-4">
        {/* Points / Score Card */}
        <div className="glass-card p-5 flex items-center justify-between" data-tour="profile-score">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Gem className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t('profile.yourScore')}</p>
              <p className="text-2xl font-bold text-foreground">{points} {t('profile.pts')}</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-1 text-success text-sm font-medium">
              <TrendingUp className="h-4 w-4" />
              {t('profile.level')} {Math.floor(points / 100) + 1}
            </div>
            {profile && (
              <span className="text-xs text-muted-foreground">
                {t('profile.trust')} {Math.round(profile.trust_score * 100)}%
              </span>
            )}
          </div>
        </div>

        {/* Settings Card */}
        <div className="glass-card divide-y divide-border" data-tour="profile-settings">
          <div className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Moon className="h-5 w-5 text-muted-foreground" />
              <span className="font-medium">{t('profile.darkMode')}</span>
            </div>
            <Switch checked={darkMode} onCheckedChange={toggleDarkMode} />
          </div>

          <div className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Bell className="h-5 w-5 text-muted-foreground" />
              <span className="font-medium">{t('profile.notifications')}</span>
            </div>
            <Switch checked={notificationsOn} onCheckedChange={handleNotificationsToggle} />
          </div>

          <div className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-muted-foreground text-base leading-none w-5 text-center">🌐</span>
              <span className="font-medium">{t('profile.language')}</span>
            </div>
            <div className="flex rounded-full border border-border bg-secondary/50 p-0.5">
              {(['en', 'gr', 'tr'] as Language[]).map((lang) => (
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
          </div>
        </div>

        {/* Account Settings */}
        <div className="glass-card divide-y divide-border">
          <button
            onClick={openEdit}
            className="w-full p-4 flex items-center justify-between text-left hover:bg-secondary/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <User className="h-5 w-5 text-muted-foreground" />
              <span className="font-medium">{t('profile.editProfile')}</span>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </button>

          <button
            onClick={() => setPrivacyOpen(true)}
            className="w-full p-4 flex items-center justify-between text-left hover:bg-secondary/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Shield className="h-5 w-5 text-muted-foreground" />
              <span className="font-medium">{t('profile.privacy')}</span>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        {/* Admin Switch -- only rendered for real municipality_admins rows,
            never a client-side toggle anyone could flip on themselves. */}
        {isAdmin && (
          <div
            onClick={() => setAdminMode(true)}
            className="glass-card p-4 cursor-pointer hover:bg-primary/5 transition-colors border-primary/20 bg-primary/5"
            data-tour="profile-admin"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Building2 className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <span className="font-semibold block">{t('profile.adminDashboard')}</span>
                  <span className="text-sm text-muted-foreground">{t('profile.controlCenter', { name: municipalityName ?? 'Municipality' })}</span>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-primary" />
            </div>
          </div>
        )}

        {/* Logout */}
        <Button
          variant="outline"
          className="w-full text-destructive border-destructive/30 hover:bg-destructive/10"
          onClick={() => signOut()}
        >
          <LogOut className="h-4 w-4 mr-2" />
          {t('profile.logOut')}
        </Button>

        {/* App Version */}
        <p className="text-center text-xs text-muted-foreground pt-4">
          ParkApp v1.0.0 • Chalkida
        </p>
      </div>

      {/* Edit Profile Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle>{t('profile.editProfile')}</DialogTitle>
            <DialogDescription>{t('profile.editDesc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="editName">{t('login.fullName')}</Label>
              <Input id="editName" value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="editMake">{t('profile.vehicleMake')}</Label>
                <Input id="editMake" value={editMake} onChange={(e) => setEditMake(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editColor">{t('vehicle.color')}</Label>
                <Input id="editColor" value={editColor} onChange={(e) => setEditColor(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="editPlate">{t('vehicle.plate')}</Label>
              <Input id="editPlate" value={editPlate} onChange={(e) => setEditPlate(e.target.value)} />
              {editPlate.trim().length > 2 && (
                <p className="text-xs text-muted-foreground">
                  {t('profile.shownAs')} <span className="font-mono">{maskPlate(editPlate)}</span>
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>
              {t('profile.cancel')}
            </Button>
            <Button onClick={handleSaveProfile} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t('profile.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Privacy & Security Dialog */}
      <Dialog open={privacyOpen} onOpenChange={setPrivacyOpen}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle>{t('profile.privacy')}</DialogTitle>
            <DialogDescription>{t('profile.privacyDesc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2 text-sm text-muted-foreground">
            <div className="p-3 bg-secondary/50 rounded-xl">
              <p className="font-medium text-foreground mb-1">{t('profile.privacyPlateTitle')}</p>
              <p>
                {t('profile.privacyPlateBody')}
                {profile?.vehicle_plate ? <> {t('profile.privacyYours')} <span className="font-mono">{maskPlate(profile.vehicle_plate)}</span></> : null}.
              </p>
            </div>
            <div className="p-3 bg-secondary/50 rounded-xl">
              <p className="font-medium text-foreground mb-1">{t('profile.privacyLocationTitle')}</p>
              <p>
                {t('profile.privacyLocationBody')}
              </p>
            </div>
            <div className="p-3 bg-secondary/50 rounded-xl">
              <p className="font-medium text-foreground mb-1">{t('profile.privacyTrustTitle')}</p>
              <p>
                {t('profile.privacyTrustBody')}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button className="w-full" onClick={() => setPrivacyOpen(false)}>
              {t('profile.gotIt')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
