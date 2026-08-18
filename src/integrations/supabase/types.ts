// Hand-written to match supabase/migrations/0001_init_schema.sql.
// Once the project is linked to a live Supabase project, regenerate with:
//   npx supabase gen types typescript --project-id <project-ref> > src/integrations/supabase/types.ts

export type Database = {
  public: {
    Tables: {
      municipalities: {
        Row: {
          id: string;
          name: string;
          country: string;
          center_location: string;
          boundary: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["municipalities"]["Row"]> & {
          name: string;
          center_location: string;
        };
        Update: Partial<Database["public"]["Tables"]["municipalities"]["Row"]>;
      };
      municipality_admins: {
        Row: {
          id: string;
          user_id: string;
          municipality_id: string;
          role: "admin" | "viewer";
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["municipality_admins"]["Row"]> & {
          user_id: string;
          municipality_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["municipality_admins"]["Row"]>;
      };
      municipality_settings: {
        Row: {
          municipality_id: string;
          notify_high_occupancy: boolean;
          moderate_spot_threshold: number;
          full_spot_threshold: number;
          resident_code: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["municipality_settings"]["Row"]> & {
          municipality_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["municipality_settings"]["Row"]>;
      };
      profiles: {
        Row: {
          id: string;
          full_name: string;
          phone: string;
          email: string | null;
          vehicle_make: string | null;
          vehicle_color: string | null;
          vehicle_plate: string | null;
          municipality_id: string | null;
          membership_tier: "free" | "premium";
          membership_expires_at: string | null;
          points_balance: number;
          trust_score: number;
          device_fingerprint: string | null;
          resident_verified: boolean;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["profiles"]["Row"]> & {
          id: string;
          full_name: string;
          phone: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Row"]>;
      };
      parking_spots: {
        Row: {
          id: string;
          declared_by: string;
          location: string;
          road_snapped: boolean;
          municipality_id: string | null;
          status: "active" | "claimed" | "expired" | "invalid" | "reported";
          declared_at: string;
          expires_at: string;
          claimed_by: string | null;
          claimed_at: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["parking_spots"]["Row"]> & {
          declared_by: string;
          location: string;
        };
        Update: Partial<Database["public"]["Tables"]["parking_spots"]["Row"]>;
      };
      parking_sessions: {
        Row: {
          id: string;
          user_id: string;
          spot_id: string | null;
          parked_location: string;
          parked_at: string;
          unparked_at: string | null;
          unpark_type: "manual" | "lazy_auto" | "pending" | null;
          points_awarded: number;
        };
        Insert: Partial<Database["public"]["Tables"]["parking_sessions"]["Row"]> & {
          user_id: string;
          parked_location: string;
        };
        Update: Partial<Database["public"]["Tables"]["parking_sessions"]["Row"]>;
      };
      points_transactions: {
        Row: {
          id: string;
          user_id: string;
          delta: number;
          reason: string;
          related_spot_id: string | null;
          related_session_id: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["points_transactions"]["Row"]> & {
          user_id: string;
          delta: number;
          reason: string;
        };
        Update: Partial<Database["public"]["Tables"]["points_transactions"]["Row"]>;
      };
      trust_events: {
        Row: {
          id: string;
          user_id: string;
          delta: number;
          reason: string;
          reported_by: string | null;
          related_spot_id: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["trust_events"]["Row"]> & {
          user_id: string;
          delta: number;
          reason: string;
        };
        Update: Partial<Database["public"]["Tables"]["trust_events"]["Row"]>;
      };
      spot_reports: {
        Row: {
          id: string;
          spot_id: string;
          reported_by: string;
          reason: "taken" | "fake" | "invalid_location";
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["spot_reports"]["Row"]> & {
          spot_id: string;
          reported_by: string;
          reason: "taken" | "fake" | "invalid_location";
        };
        Update: Partial<Database["public"]["Tables"]["spot_reports"]["Row"]>;
      };
    };
    Views: {
      leaderboard_daily: {
        Row: {
          user_id: string;
          full_name: string;
          municipality_id: string | null;
          points_today: number | null;
        };
      };
      leaderboard_weekly: {
        Row: {
          user_id: string;
          full_name: string;
          municipality_id: string | null;
          points_this_week: number | null;
        };
      };
      city_leaderboard: {
        Row: {
          municipality_id: string;
          municipality_name: string;
          total_points: number;
        };
      };
    };
    Functions: {
      is_municipality_admin: {
        Args: { target_municipality_id: string };
        Returns: boolean;
      };
      redeem_trial_premium: {
        Args: Record<string, never>;
        Returns: void;
      };
      redeem_resident_code: {
        Args: { p_code: string };
        Returns: boolean;
      };
      sync_expired_membership: {
        Args: Record<string, never>;
        Returns: void;
      };
      my_admin_municipality: {
        Args: Record<string, never>;
        Returns: { municipality_id: string; municipality_name: string; role: string }[];
      };
      admin_city_kpis: {
        Args: { p_municipality_id: string };
        Returns: {
          active_drivers_24h: number;
          spots_declared_today: number;
          active_spots_now: number;
          avg_parking_minutes: number | null;
          avg_trust_score: number | null;
        }[];
      };
      admin_live_spots: {
        Args: { p_municipality_id: string };
        Returns: {
          id: string;
          lat: number;
          lng: number;
          status: "active" | "claimed" | "expired" | "invalid" | "reported";
          declared_at: string;
          expires_at: string;
        }[];
      };
      admin_weekly_trend: {
        Args: { p_municipality_id: string };
        Returns: { day: string; declarations: number }[];
      };
    };
  };
};
