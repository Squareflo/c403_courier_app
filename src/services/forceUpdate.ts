import { Platform, Linking } from 'react-native';
import { supabase } from '../lib/supabase';

const FALLBACK_IOS_URL = 'https://apps.apple.com/ca/app/chow-local-driver/id6742232521';
const FALLBACK_ANDROID_URL = 'https://play.google.com/store/apps/details?id=com.chowlocaldriver';

export function getAppVersion(): string {
  try {
    const appJson = require('../../app.json');
    return appJson.expo?.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export async function getForceUpdateSettings(): Promise<{
  required: boolean;
  storeUrl: string;
}> {
  const fallbackUrl = Platform.OS === 'ios' ? FALLBACK_IOS_URL : FALLBACK_ANDROID_URL;

  try {
    const { data, error } = await supabase
      .from('system_setting')
      .select('latest_version_required, driver_app_ios_url, driver_app_android_url')
      .eq('id', 'global')
      .single();

    if (error) {
      console.error('[ForceUpdate] Error checking system_setting:', error);
      return { required: false, storeUrl: fallbackUrl };
    }

    const storeUrl = Platform.OS === 'ios'
      ? (data?.driver_app_ios_url || FALLBACK_IOS_URL)
      : (data?.driver_app_android_url || FALLBACK_ANDROID_URL);

    return {
      required: data?.latest_version_required === true,
      storeUrl,
    };
  } catch (error) {
    console.error('[ForceUpdate] Error:', error);
    return { required: false, storeUrl: fallbackUrl };
  }
}

export function openAppStore(url: string): void {
  Linking.openURL(url);
}
