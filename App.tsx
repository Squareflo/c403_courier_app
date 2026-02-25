import React, { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts, Montserrat_400Regular, Montserrat_500Medium, Montserrat_600SemiBold, Montserrat_700Bold } from '@expo-google-fonts/montserrat';
import { ActivityIndicator, StatusBar, View } from 'react-native';
import { SignInScreen } from './src/screens/SignInScreen';
import { MainLayout } from './src/screens/MainLayout';
import { ThemeProvider } from './src/contexts/ThemeContext';
import { AuthProvider } from './src/contexts/AuthContext';
import PermissionGate from './src/components/PermissionGate';
import { supabase } from './src/lib/supabase';
import { useTheme } from './src/contexts/ThemeContext';

function ThemedStatusBar() {
  const { isDark } = useTheme();
  return (
    <StatusBar
      barStyle={isDark ? 'light-content' : 'dark-content'}
      backgroundColor="transparent"
      translucent
    />
  );
}

const ALLOWED_COURIER_ROLES = ['courier'] as const;

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isRestoringSession, setIsRestoringSession] = useState(true);

  const [fontsLoaded] = useFonts({
    Montserrat_400Regular,
    Montserrat_500Medium,
    Montserrat_600SemiBold,
    Montserrat_700Bold,
  });

  // Restore existing session on app launch
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const { data } = await supabase
            .from('customer')
            .select('roles, is_verified')
            .eq('id', session.user.id)
            .single();

          if (data?.is_verified) {
            const userRoles = Array.isArray(data.roles) ? (data.roles as string[]) : [];
            const hasAllowedRole = userRoles.some((role) =>
              ALLOWED_COURIER_ROLES.includes(role as (typeof ALLOWED_COURIER_ROLES)[number])
            );
            if (hasAllowedRole) {
              setIsAuthenticated(true);
            }
          }
        }
      } catch (err) {
        console.error('Session restore error:', err);
      } finally {
        setIsRestoringSession(false);
      }
    };

    restoreSession();
  }, []);

  if (!fontsLoaded || isRestoringSession) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' }}>
          <ActivityIndicator color="#ec2227" />
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <ThemedStatusBar />
        <AuthProvider onSignOut={() => setIsAuthenticated(false)}>
          {isAuthenticated ? (
            <PermissionGate>
              <MainLayout />
            </PermissionGate>
          ) : (
            <SignInScreen onSignInSuccess={() => setIsAuthenticated(true)} />
          )}
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
