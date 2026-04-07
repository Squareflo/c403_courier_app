import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from '../lib/supabase';

/**
 * Configure notification handler for foreground notifications
 */
Notifications.setNotificationHandler({
  handleNotification: async () => {
    return {
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    };
  },
});

/**
 * Register for push notifications and get the Expo Push Token
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('[Push] Failed to get push notification permissions');
    return null;
  }

  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;

    if (!projectId) {
      console.log('[Push] Project ID not found in app config');
      return null;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    console.log('[Push] Expo Push Token:', tokenData.data);
    return tokenData.data;
  } catch (error) {
    console.error('[Push] Error getting Expo push token:', error);
    return null;
  }
}

/**
 * Save the push token to the database for the current user
 */
export async function savePushTokenToDatabase(token: string): Promise<boolean> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const customerId = session?.user?.id;

    if (!customerId) {
      console.log('[Push] No user logged in, cannot save token');
      return false;
    }

    const deviceType = Platform.OS as 'ios' | 'android' | 'web';

    const { error } = await supabase
      .from('device_tokens')
      .upsert(
        {
          customer_id: customerId,
          expo_push_token: token,
          device_type: deviceType,
          is_active: true,
          last_used_at: new Date().toISOString(),
          app_type: 'courier',
        },
        { onConflict: 'customer_id,expo_push_token' }
      );

    if (error) {
      console.error('[Push] Error saving push token:', error);
      return false;
    }

    console.log('[Push] Push token saved successfully');
    return true;
  } catch (error) {
    console.error('[Push] Error in savePushTokenToDatabase:', error);
    return false;
  }
}

/**
 * Deactivate all courier push tokens for the current user (on logout)
 */
export async function deactivatePushTokens(): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const customerId = session?.user?.id;
    if (!customerId) return;

    await supabase
      .from('device_tokens')
      .update({ is_active: false })
      .eq('customer_id', customerId)
      .eq('app_type', 'courier');

    console.log('[Push] Push tokens deactivated');
  } catch (error) {
    console.error('[Push] Error deactivating tokens:', error);
  }
}

/**
 * Full registration flow - get token and save to database
 */
export async function registerAndSavePushToken(): Promise<string | null> {
  const token = await registerForPushNotificationsAsync();

  if (token) {
    await savePushTokenToDatabase(token);
  }

  // Configure Android notification channels
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('delivery-offers', {
      name: 'Delivery Offers',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#ec2227',
      sound: 'default',
    });
  }

  return token;
}

/**
 * Add listener for when user taps on a notification
 */
export function addNotificationResponseReceivedListener(
  callback: (response: Notifications.NotificationResponse) => void
): Notifications.EventSubscription {
  return Notifications.addNotificationResponseReceivedListener(callback);
}

/**
 * Add listener for notification received while app is foregrounded
 */
export function addNotificationReceivedListener(
  callback: (notification: Notifications.Notification) => void
): Notifications.EventSubscription {
  return Notifications.addNotificationReceivedListener(callback);
}
