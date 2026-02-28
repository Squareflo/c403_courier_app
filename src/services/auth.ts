import { supabase } from '../lib/supabase';

export async function getCurrentUserId(): Promise<string | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user?.id || null;
  } catch {
    return null;
  }
}

export async function getCurrentUser(): Promise<any | null> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return null;

    const { data, error } = await supabase
      .from('customer')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) return null;
    return data;
  } catch {
    return null;
  }
}

export async function isUserLoggedIn(): Promise<boolean> {
  const userId = await getCurrentUserId();
  return !!userId;
}
