import React, { useState, useEffect, useRef, ReactNode } from 'react';
import { View, Text, StyleSheet, AppState, AppStateStatus } from 'react-native';
import { Button } from './ui/Button';
import { getForceUpdateSettings, openAppStore, getAppVersion } from '../services/forceUpdate';

interface ForceUpdateGateProps {
  children: ReactNode;
}

export default function ForceUpdateGate({ children }: ForceUpdateGateProps) {
  const [isBlocked, setIsBlocked] = useState(false);
  const [storeUrl, setStoreUrl] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const isMountedRef = useRef(true);

  const checkUpdate = async () => {
    try {
      const settings = await getForceUpdateSettings();
      if (isMountedRef.current) {
        setIsBlocked(settings.required);
        setStoreUrl(settings.storeUrl);
        setIsLoading(false);
      }
    } catch {
      if (isMountedRef.current) {
        setIsBlocked(false);
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    isMountedRef.current = true;
    checkUpdate();
    return () => { isMountedRef.current = false; };
  }, []);

  useEffect(() => {
    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === 'active' && isMountedRef.current) {
        checkUpdate();
      }
    };
    const subscription = AppState.addEventListener('change', handleAppState);
    return () => subscription.remove();
  }, []);

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <View style={styles.centered}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </View>
    );
  }

  if (isBlocked) {
    return (
      <View style={styles.container}>
        <View style={styles.overlay}>
          <View style={styles.card}>
            <Text style={styles.heading}>Update Required</Text>
            <Text style={styles.message}>
              A new version of this app is available and required. Please update to continue using the app.
            </Text>
            <Text style={styles.version}>Current version: {getAppVersion()}</Text>
            <Button
              title="Update Now"
              onPress={() => openAppStore(storeUrl)}
              variant="dark"
              size="large"
              style={styles.button}
            />
          </View>
        </View>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: '#000',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#fff',
    fontFamily: 'Montserrat_400Regular',
    fontSize: 14,
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
  heading: {
    fontFamily: 'Montserrat_700Bold',
    fontSize: 18,
    lineHeight: 24,
    color: '#000',
    textAlign: 'center',
    marginBottom: 16,
  },
  message: {
    fontFamily: 'Montserrat_400Regular',
    fontSize: 14,
    color: '#000',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 12,
  },
  version: {
    fontFamily: 'Montserrat_400Regular',
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    marginBottom: 24,
  },
  button: {
    width: '100%',
  },
});
