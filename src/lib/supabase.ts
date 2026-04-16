import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, LogBox } from 'react-native';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://rddssfhltufrwlsmbtps.supabase.co';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJkZHNzZmhsdHVmcndsc21idHBzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA0NjExNTAsImV4cCI6MjA3NjAzNzE1MH0.vNkjdUoYthWoaphE_sp1TsNx7U2A84W515iXVkuU01k';

// Supabase's GoTrueClient logs an AuthApiError to console.error when the stored
// refresh token is gone/invalid on boot. That's expected when a user needs to
// re-authenticate — the app already routes them to the sign-in screen — so
// silence the cosmetic LogBox overlay.
LogBox.ignoreLogs([
  /Invalid Refresh Token/i,
  /AuthApiError: Invalid Refresh Token/i,
  /Refresh Token Not Found/i,
]);

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Refresh auth session whenever the app comes back to the foreground
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
