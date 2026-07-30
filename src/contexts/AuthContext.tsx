import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

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
  signUp: (details: SignUpDetails) => Promise<{ error: string | null; needsEmailConfirmation: boolean }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  saveVehicleDetails: (details: VehicleDetails) => Promise<{ error: string | null }>;
  assignMunicipality: (municipalityId: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

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

  const fetchProfile = useCallback(async (userId: string) => {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    setProfile(data ?? null);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) fetchProfile(session.user.id);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, [fetchProfile]);

  const signUp = async ({ fullName, phone, email, password }: SignUpDetails) => {
    // full_name/phone travel as auth metadata; a DB trigger (see
    // supabase/migrations/0003_handle_new_user_trigger.sql) creates the
    // matching profiles row server-side, so this works whether or not a
    // session exists yet (email confirmation may still be pending).
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, phone } },
    });
    if (error) return { error: error.message, needsEmailConfirmation: false };

    if (data.session && data.user) {
      setSession(data.session);
      await fetchProfile(data.user.id);
    }

    return { error: null, needsEmailConfirmation: !data.session };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signOut = async () => {
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

  const assignMunicipality = async (municipalityId: string) => {
    if (!session?.user) return;
    await supabase.from('profiles').update({ municipality_id: municipalityId }).eq('id', session.user.id);
    await fetchProfile(session.user.id);
  };

  const refreshProfile = async () => {
    if (session?.user) await fetchProfile(session.user.id);
  };

  const isOnboardingComplete = Boolean(profile?.vehicle_make && profile?.vehicle_plate);

  return (
    <AuthContext.Provider
      value={{
        session,
        profile,
        loading,
        isOnboardingComplete,
        signUp,
        signIn,
        signOut,
        saveVehicleDetails,
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
