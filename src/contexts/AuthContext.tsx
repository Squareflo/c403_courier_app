import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { registerAndSavePushToken, deactivatePushTokens } from '../services/pushNotifications';

export interface CourierProfile {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  profile_picture_url?: string | null;
  phone_number?: string | null;
  roles: string[];
  is_verified: boolean;
  is_online: boolean;
  current_location_latitude?: number | null;
  current_location_longitude?: number | null;
  points_30_days?: number | null;
  city_id?: string | null;
  preferred_distance_unit?: string | null;
  stripe_connect_status?: string | null;
  stripe_account_id?: string | null;
  total_delivery_requests_accepted?: number | null;
  total_delivery_requests_rejected?: number | null;
  total_delivery_requests_viewed?: number | null;
  account_status?: string | null;
  vehicle_type?: string | null;
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

// Fields from customer table (non-courier-specific)
const CUSTOMER_SELECT =
  'id, first_name, last_name, email, profile_picture_url, phone_number, roles, is_verified, city_id, preferred_distance_unit, stripe_connect_status, stripe_account_id';

// Fields from courier table (courier-specific)
const COURIER_TABLE_SELECT =
  'id, is_online, current_location_latitude, current_location_longitude, points_30_days, total_delivery_requests_accepted, total_delivery_requests_rejected, total_delivery_requests_viewed, account_status, vehicle_type, went_online_at, session_rejections, city_id';

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

        // Fetch customer data and courier data in parallel
        const [customerResult, courierResult] = await Promise.all([
          supabase.from('customer').select(CUSTOMER_SELECT).eq('id', session.user.id).single(),
          supabase.from('courier').select(COURIER_TABLE_SELECT).eq('id', session.user.id).single(),
        ]);

        if (!customerResult.error && customerResult.data) {
          const merged = {
            ...customerResult.data,
            // Overlay courier-specific fields (fallback to defaults if courier row missing)
            is_online: courierResult.data?.is_online ?? false,
            current_location_latitude: courierResult.data?.current_location_latitude ?? null,
            current_location_longitude: courierResult.data?.current_location_longitude ?? null,
            points_30_days: courierResult.data?.points_30_days ?? null,
            total_delivery_requests_accepted: courierResult.data?.total_delivery_requests_accepted ?? null,
            total_delivery_requests_rejected: courierResult.data?.total_delivery_requests_rejected ?? null,
            total_delivery_requests_viewed: courierResult.data?.total_delivery_requests_viewed ?? null,
            account_status: courierResult.data?.account_status ?? null,
            vehicle_type: courierResult.data?.vehicle_type ?? null,
            went_online_at: courierResult.data?.went_online_at ?? null,
            session_rejections: courierResult.data?.session_rejections ?? 0,
          };
          setCourier(merged as CourierProfile);
          // Register push token for returning sessions
          registerAndSavePushToken().catch(() => {});
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

      // Fetch customer data and courier data in parallel
      const [customerResult, courierResult] = await Promise.all([
        supabase.from('customer').select(CUSTOMER_SELECT).eq('id', session.user.id).single(),
        supabase.from('courier').select(COURIER_TABLE_SELECT).eq('id', session.user.id).single(),
      ]);

      if (!customerResult.error && customerResult.data) {
        const merged = {
          ...customerResult.data,
          is_online: courierResult.data?.is_online ?? false,
          current_location_latitude: courierResult.data?.current_location_latitude ?? null,
          current_location_longitude: courierResult.data?.current_location_longitude ?? null,
          points_30_days: courierResult.data?.points_30_days ?? null,
          total_delivery_requests_accepted: courierResult.data?.total_delivery_requests_accepted ?? null,
          total_delivery_requests_rejected: courierResult.data?.total_delivery_requests_rejected ?? null,
          total_delivery_requests_viewed: courierResult.data?.total_delivery_requests_viewed ?? null,
          account_status: courierResult.data?.account_status ?? null,
          vehicle_type: courierResult.data?.vehicle_type ?? null,
          went_online_at: courierResult.data?.went_online_at ?? null,
          session_rejections: courierResult.data?.session_rejections ?? 0,
        };
        setCourier(merged as CourierProfile);
      }
    } catch (err) {
      console.error('Error refreshing courier:', err);
    }
  }, []);

  const signOut = useCallback(async () => {
    await deactivatePushTokens();
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
