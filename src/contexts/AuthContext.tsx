import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export interface CourierProfile {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  profile_picture_url?: string | null;
  phone_number?: string | null;
  roles: string[];
  is_verified: boolean;
  community?: string | null;
  is_online: boolean;
  current_location_latitude?: number | null;
  current_location_longitude?: number | null;
  points_30_days?: number | null;
  territory_id?: string | null;
  preferred_distance_unit?: string | null;
}

interface AuthContextValue {
  courier: CourierProfile | null;
  setCourier: (courier: CourierProfile | null) => void;
  refreshCourier: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  courier: null,
  setCourier: () => {},
  refreshCourier: async () => {},
  signOut: async () => {},
});

const COURIER_SELECT =
  'id, first_name, last_name, email, profile_picture_url, phone_number, roles, is_verified, community, is_online, current_location_latitude, current_location_longitude, points_30_days, territory_id, preferred_distance_unit';

export function AuthProvider({
  children,
  onSignOut,
}: {
  children: React.ReactNode;
  onSignOut: () => void;
}) {
  const [courier, setCourier] = useState<CourierProfile | null>(null);

  // Auto-load courier profile if a session already exists (persisted login)
  useEffect(() => {
    const loadCourierFromSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return;

        const { data, error } = await supabase
          .from('customer')
          .select(COURIER_SELECT)
          .eq('id', session.user.id)
          .single();

        if (!error && data) {
          setCourier(data as CourierProfile);
        }
      } catch (err) {
        console.error('Error loading courier from session:', err);
      }
    };

    loadCourierFromSession();
  }, []);

  const refreshCourier = useCallback(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) return;

      const { data, error } = await supabase
        .from('customer')
        .select(COURIER_SELECT)
        .eq('id', session.user.id)
        .single();

      if (!error && data) {
        setCourier(data as CourierProfile);
      }
    } catch (err) {
      console.error('Error refreshing courier:', err);
    }
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setCourier(null);
    onSignOut();
  }, [onSignOut]);

  return (
    <AuthContext.Provider value={{ courier, setCourier, refreshCourier, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
