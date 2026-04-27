import React, { useState, useEffect, useCallback, ReactNode, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  Linking,
  Platform,
  AppState,
  AppStateStatus,
  ActivityIndicator,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

const isExpoGo = Constants.appOwnership === 'expo';
import { Ionicons } from '@expo/vector-icons';
import { Button } from './ui/Button';
import { fontFamily } from '../constants/typography';

const PERMISSION_STATE_KEY = 'courier_permission_gate_state';

type PermissionStep = 'loading' | 'notification' | 'location' | 'done';

interface PermissionGateProps {
  children: ReactNode;
}

export default function PermissionGate({ children }: PermissionGateProps) {
  const [step, setStep] = useState<PermissionStep>('loading');
  const isMountedRef = useRef(true);
  const isCheckingRef = useRef(false);

  // ── Check all permissions ───────────────────────────────────────────────

  const checkPermissions = useCallback(async () => {
    if (isCheckingRef.current) return;
    isCheckingRef.current = true;

    try {
      // Check notification permission (skip in Expo Go)
      let hasNotifications = true;
      if (!isExpoGo) {
        const { status: notifStatus } = await Notifications.getPermissionsAsync();
        hasNotifications = notifStatus === Notifications.PermissionStatus.GRANTED;
      }

      // Check location permission
      const { status: locStatus } = await Location.getForegroundPermissionsAsync();
      const hasLocation = locStatus === Location.PermissionStatus.GRANTED;

      if (!isMountedRef.current) return;

      if (!hasNotifications) {
        setStep('notification');
      } else if (!hasLocation) {
        setStep('location');
      } else {
        setStep('done');
      }
    } catch (err) {
      console.error('[PermissionGate] Error checking permissions:', err);
      if (isMountedRef.current) {
        setStep('notification');
      }
    } finally {
      isCheckingRef.current = false;
    }
  }, []);

  // ── Initial check ───────────────────────────────────────────────────────

  useEffect(() => {
    isMountedRef.current = true;
    checkPermissions();
    return () => {
      isMountedRef.current = false;
    };
  }, [checkPermissions]);

  // ── Re-check when app returns from settings ─────────────────────────────

  useEffect(() => {
    const handleAppState = async (nextState: AppStateStatus) => {
      if (nextState === 'active' && isMountedRef.current && step !== 'done') {
        await new Promise((r) => setTimeout(r, 500));
        if (isMountedRef.current) {
          checkPermissions();
        }
      }
    };

    const sub = AppState.addEventListener('change', handleAppState);
    return () => sub.remove();
  }, [checkPermissions, step]);

  // ── Handle notification allow ───────────────────────────────────────────

  const handleNotificationAllow = async () => {
    if (isExpoGo) {
      // Expo Go — skip notifications, proceed to location
      const { status: locStatus } = await Location.getForegroundPermissionsAsync();
      if (!isMountedRef.current) return;
      setStep(locStatus !== Location.PermissionStatus.GRANTED ? 'location' : 'done');
      return;
    }
    try {
      const { status } = await Notifications.requestPermissionsAsync();

      if (status === Notifications.PermissionStatus.GRANTED) {
        // Granted — check location next
        const { status: locStatus } = await Location.getForegroundPermissionsAsync();
        if (!isMountedRef.current) return;

        if (locStatus !== Location.PermissionStatus.GRANTED) {
          setStep('location');
        } else {
          setStep('done');
        }
      } else if (status === 'denied') {
        Alert.alert(
          'Notifications Disabled',
          'Please enable notifications in Settings to receive delivery alerts.',
          [
            {
              text: 'Open Settings',
              onPress: () => {
                Platform.OS === 'ios'
                  ? Linking.openURL('app-settings:')
                  : Linking.openSettings();
              },
            },
          ]
        );
      }
    } catch (err) {
      console.error('[PermissionGate] Notification request error:', err);
    }
  };

  // ── Handle location share ───────────────────────────────────────────────

  const handleLocationShare = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status === Location.PermissionStatus.GRANTED) {
        if (isMountedRef.current) setStep('done');
      } else if (status === Location.PermissionStatus.DENIED) {
        Alert.alert(
          'Location Required',
          'Location access is required to receive delivery offers and track your position. Please enable it in Settings.',
          [
            {
              text: 'Open Settings',
              onPress: () => {
                Platform.OS === 'ios'
                  ? Linking.openURL('app-settings:')
                  : Linking.openSettings();
              },
            },
          ]
        );
      }
    } catch (err) {
      console.error('[PermissionGate] Location request error:', err);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────

  if (step === 'loading') {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ec2227" />
      </View>
    );
  }

  if (step === 'notification') {
    return (
      <PermissionScreen
        icon="notifications"
        heading="Get Notifications"
        message="Stay in the loop! Allow notifications so we can alert you when new delivery offers come in, when orders are ready for pickup, and other important updates."
        buttonText="Allow Notifications"
        onButtonPress={handleNotificationAllow}
      />
    );
  }

  if (step === 'location') {
    return (
      <PermissionScreen
        icon="location-outline"
        heading="Location Needed"
        message="We need your location to match you with nearby delivery offers, calculate distances, and let restaurants know when you're approaching. Please share your location to continue."
        buttonText="Share My Location"
        onButtonPress={handleLocationShare}
      />
    );
  }

  // step === 'done'
  return <>{children}</>;
}

// ── Permission Screen (matches customer app design) ─────────────────────────

function PermissionScreen({
  icon,
  heading,
  message,
  buttonText,
  onButtonPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  heading: string;
  message: string;
  buttonText: string;
  onButtonPress: () => void;
}) {
  return (
    <View style={styles.container}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.iconContainer}>
            <Ionicons name={icon} size={48} color="#000" />
          </View>

          <Text style={styles.heading}>{heading}</Text>
          <Text style={styles.message}>{message}</Text>

          <Button
            title={buttonText}
            onPress={onButtonPress}
            variant="dark"
            size="large"
            backgroundColor="#000000"
            textColor="#FFFFFF"
            style={styles.button}
          />
        </View>
      </View>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  iconContainer: {
    marginBottom: 24,
  },
  heading: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
    lineHeight: 24,
    color: '#000',
    textAlign: 'center',
    marginBottom: 16,
  },
  message: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: '#000',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 32,
  },
  button: {
    width: '100%',
  },
});
