import React from 'react';
import { useApp } from '@/contexts/AppContext';
import { useAuth, maskPlate } from '@/contexts/AuthContext';
import { User, Moon, Bell, Shield, LogOut, ChevronRight, Crown, Building2, Gem, TrendingUp } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';

export const ProfileTab = () => {
  const { darkMode, toggleDarkMode, citizenVerified, setAdminMode } = useApp();
  const { profile, signOut } = useAuth();
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
                  <Crown className="h-3 w-3" /> Premium
                </span>
              ) : (
                <span className="bg-white/20 text-xs font-medium px-3 py-1 rounded-full">
                  Free
                </span>
              )}
              {citizenVerified && (
                <span className="bg-success text-success-foreground text-xs font-medium px-3 py-1 rounded-full flex items-center gap-1">
                  <Shield className="h-3 w-3" /> Resident
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4 -mt-4">
        {/* Points / Score Card */}
        <div className="glass-card p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Gem className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Your Score</p>
              <p className="text-2xl font-bold text-foreground">{points} pts</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-1 text-success text-sm font-medium">
              <TrendingUp className="h-4 w-4" />
              Level {Math.floor(points / 100) + 1}
            </div>
            {profile && (
              <span className="text-xs text-muted-foreground">
                Trust {Math.round(profile.trust_score * 100)}%
              </span>
            )}
          </div>
        </div>

        {/* Settings Card */}
        <div className="glass-card divide-y divide-border">
          <div className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Moon className="h-5 w-5 text-muted-foreground" />
              <span className="font-medium">Dark Mode</span>
            </div>
            <Switch checked={darkMode} onCheckedChange={toggleDarkMode} />
          </div>
          
          <div className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Bell className="h-5 w-5 text-muted-foreground" />
              <span className="font-medium">Notifications</span>
            </div>
            <Switch defaultChecked />
          </div>
        </div>

        {/* Account Settings */}
        <div className="glass-card divide-y divide-border">
          <button className="w-full p-4 flex items-center justify-between text-left hover:bg-secondary/50 transition-colors">
            <div className="flex items-center gap-3">
              <User className="h-5 w-5 text-muted-foreground" />
              <span className="font-medium">Edit Profile</span>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </button>
          
          <button className="w-full p-4 flex items-center justify-between text-left hover:bg-secondary/50 transition-colors">
            <div className="flex items-center gap-3">
              <Shield className="h-5 w-5 text-muted-foreground" />
              <span className="font-medium">Privacy & Security</span>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        {/* Admin Switch */}
        <div 
          onClick={() => setAdminMode(true)}
          className="glass-card p-4 cursor-pointer hover:bg-primary/5 transition-colors border-primary/20 bg-primary/5"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Building2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <span className="font-semibold block">Admin Dashboard</span>
                <span className="text-sm text-muted-foreground">Switch to Municipality view</span>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-primary" />
          </div>
        </div>

        {/* Logout */}
        <Button
          variant="outline"
          className="w-full text-destructive border-destructive/30 hover:bg-destructive/10"
          onClick={() => signOut()}
        >
          <LogOut className="h-4 w-4 mr-2" />
          Log Out
        </Button>

        {/* App Version */}
        <p className="text-center text-xs text-muted-foreground pt-4">
          ParkApp v1.0.0 • Chalkida
        </p>
      </div>
    </div>
  );
};
