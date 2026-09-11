import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { getDeviceFingerprint } from '@/lib/deviceFingerprint';

type Profile = Database['public']['Tables']['profiles']['Row'];

interface SignUpDetails {
  fullName: string;
  phone: string;
  email: string;
  password: string;
}

interface VehicleDetails {
  make: string;
  color: string;
  plate: string;
}

interface AuthContextType {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  /** true once the account exists AND the mandatory vehicle step is filled in */
  isOnboardingComplete: boolean;
  /**
   * True only for the shared demo/reviewer account. Demo-only UX (guided
   * tour, GPS mocking, confetti) must key off this, so it can never leak
   * into a real user's session.
   */
  isDemoAccount: boolean;
  signUp: (details: SignUpDetails) => Promise<{ error: string | null; needsEmailConfirmation: boolean }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  saveVehicleDetails: (details: VehicleDetails) => Promise<{ error: string | null }>;
  updateProfileDetails: (details: { fullName: string } & VehicleDetails) => Promise<{ error: string | null }>;
  upgradeToPremium: () => Promise<void>;
  /** Resolves true if the code matched the caller's municipality and Premium was granted. */
  redeemResidentCode: (code: string) => Promise<boolean>;
  assignMunicipality: (municipalityId: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// The shared demo/reviewer account -- "Quick Demo Login" must always land
// straight on the map, never the vehicle-onboarding step.
const DEMO_EMAIL = 'demo@parkapp.tech';

// Tour-done flags written by DemoTour.tsx (pattern: parkapp_demo_tour_<id>_done_v1).
// Cleared on every demo sign-in and sign-out so the tour restarts fresh for
// each reviewer session without requiring them to use incognito mode.
const DEMO_TOUR_IDS = ['map', 'offers', 'plans', 'profile', 'leaderboard', 'admin'] as const;
const clearDemoTours = () => {
  DEMO_TOUR_IDS.forEach((id) => localStorage.removeItem(`parkapp_demo_tour_${id}_done_v1`));
};

// GDPR: only the last 2 characters of the plate are ever shown in the UI.
// The full plate is stored server-side for municipality enforcement use only.
export function maskPlate(plate: string | null | undefined): string {
  if (!plate) return '';
  const clean = plate.trim();
  if (clean.length <= 2) return clean;
  return `${'•'.repeat(clean.length - 2)}${clean.slice(-2)}`;
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (userId: string, userEmail?: string | null) => {
    // Self-heals a trial that expired since the last check-in -- there's no
    // cron/scheduled-function infra to downgrade it in the background, so
    // this runs it on every profile fetch instead (see
    // 0009_resident_verification.sql). No-ops instantly unless this
    // specific account is a premium, non-resident row past its expiry.
    await supabase.rpc('sync_expired_membership');
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();

    // Defensive self-heal for the shared demo/reviewer account specifically:
    // "Quick Demo Login" promises a straight shot to the map, never the
    // vehicle-details step, and that promise shouldn't depend on nobody
    // having ever cleared this row's vehicle columns. Every other account
    // still goes through onboarding normally -- this never fires for them.
    if (data && userEmail === DEMO_EMAIL && (!data.vehicle_make || !data.vehicle_plate)) {
      const { data: healed } = await supabase
        .from('profiles')
        .update({ vehicle_make: 'Toyota', vehicle_color: 'Silver', vehicle_plate: 'ABC-1234' })
        .eq('id', userId)
        .select('*')
        .maybeSingle();
      setProfile(healed ?? data);
      return;
    }

    setProfile(data ?? null);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      // Awaited before setLoading(false) -- previously this fired the fetch
      // without waiting for it, so `loading` flipped false the instant the
      // session was known but `profile` was still null. AuthGate reads
      // isOnboardingComplete off `profile` directly, so that gap flashed the
      // vehicle-onboarding screen for a frame even when the real profile
      // already had vehicle details set (masking that as *this account
      // needs onboarding* rather than *the profile just hasn't loaded yet*).
      if (session?.user) await fetchProfile(session.user.id, session.user.email);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) {
        fetchProfile(session.user.id, session.user.email);
      } else {
        setProfile(null);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, [fetchProfile]);

  // Live-update points_balance/trust_score the instant an Edge Function
  // writes to the ledger, instead of waiting for a manual refetch.
  useEffect(() => {
    if (!session?.user) return;

    const channel = supabase
      .channel(`profile-${session.user.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${session.user.id}` },
        (payload) => setProfile(payload.new as Profile)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.user]);

  const signUp = async ({ fullName, phone, email, password }: SignUpDetails) => {
    // full_name/phone/device_fingerprint travel as auth metadata; a DB
    // trigger (see supabase/migrations/0003_handle_new_user_trigger.sql,
    // updated by 0008_lockdown_profile_columns.sql) creates the matching
    // profiles row server-side, so this works whether or not a session
    // exists yet (email confirmation may still be pending).
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, phone, device_fingerprint: getDeviceFingerprint() } },
    });
    if (error) return { error: error.message, needsEmailConfirmation: false };

    if (data.session && data.user) {
      setSession(data.session);
      await fetchProfile(data.user.id);
    }

    return { error: null, needsEmailConfirmation: !data.session };
  };

  const signIn = async (email: string, password: string) => {
    // Clear before the auth call: onAuthStateChange fires before the
    // signInWithPassword promise resolves, so clearing after loses the race.
    if (email === DEMO_EMAIL) clearDemoTours();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signOut = async () => {
    if (session?.user?.email === DEMO_EMAIL) clearDemoTours();
    await supabase.auth.signOut();
  };

  const saveVehicleDetails = async ({ make, color, plate }: VehicleDetails) => {
    if (!session?.user) return { error: 'Not authenticated.' };
    const { error } = await supabase
      .from('profiles')
      .update({ vehicle_make: make, vehicle_color: color, vehicle_plate: plate })
      .eq('id', session.user.id);
    if (!error) await fetchProfile(session.user.id);
    return { error: error?.message ?? null };
  };

  const updateProfileDetails = async ({ fullName, make, color, plate }: { fullName: string } & VehicleDetails) => {
    if (!session?.user) return { error: 'Not authenticated.' };
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: fullName, vehicle_make: make, vehicle_color: color, vehicle_plate: plate })
      .eq('id', session.user.id);
    if (!error) await fetchProfile(session.user.id);
    return { error: error?.message ?? null };
  };

  const upgradeToPremium = async () => {
    if (!session?.user) return;
    // Server-verified RPC (0008_lockdown_profile_columns.sql), not a raw
    // table update -- membership_tier/membership_expires_at are no longer
    // client-writable columns, so this is the only path to Premium. Real
    // payment verification is separate tracked work (PARKAPP_MASTER_PLAN.md,
    // Chunk 3); this RPC only grants the existing 15-day trial and is a
    // no-op if the account isn't currently on the free tier.
    await supabase.rpc('redeem_trial_premium');
    await fetchProfile(session.user.id);
  };

  const redeemResidentCode = async (code: string): Promise<boolean> => {
    if (!session?.user) return false;
    // Server-verified against the caller's own municipality's resident_code
    // (0009_resident_verification.sql) -- previously this accepted any
    // non-empty string with no check against anything real.
    const { data, error } = await supabase.rpc('redeem_resident_code', { p_code: code });
    if (error) {
      console.error('[AuthContext] redeemResidentCode failed:', error);
      return false;
    }
    if (data) await fetchProfile(session.user.id);
    return Boolean(data);
  };

  const assignMunicipality = async (municipalityId: string) => {
    if (!session?.user) return;
    await supabase.from('profiles').update({ municipality_id: municipalityId }).eq('id', session.user.id);
    await fetchProfile(session.user.id);
  };

  const refreshProfile = async () => {
    if (session?.user) await fetchProfile(session.user.id);
  };

  const isOnboardingComplete = Boolean(profile?.vehicle_make && profile?.vehicle_plate);
  const isDemoAccount = session?.user?.email === DEMO_EMAIL;

  return (
    <AuthContext.Provider
      value={{
        session,
        profile,
        loading,
        isOnboardingComplete,
        isDemoAccount,
        signUp,
        signIn,
        signOut,
        saveVehicleDetails,
        updateProfileDetails,
        upgradeToPremium,
        redeemResidentCode,
        assignMunicipality,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
