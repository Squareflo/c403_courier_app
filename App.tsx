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
import { CourierApplicationFlow } from './src/screens/CourierApplicationFlow';

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

type AppScreen = 'loading' | 'sign-in' | 'main' | 'application';

export default function App() {
  const [appScreen, setAppScreen] = useState<AppScreen>('loading');

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
        if (!session?.user) {
          setAppScreen('sign-in');
          return;
        }

        const { data } = await supabase
          .from('customer')
          .select('roles, is_verified')
          .eq('id', session.user.id)
          .single();

        if (!data?.is_verified) {
          setAppScreen('sign-in');
          return;
        }

        const userRoles = Array.isArray(data.roles) ? (data.roles as string[]) : [];
        const isCourier = userRoles.includes('courier');
        const isApplicant = userRoles.includes('courier-applicant');

        if (isCourier) {
          setAppScreen('main');
          return;
        }

        if (isApplicant) {
          setAppScreen('application');
          return;
        }

        // No courier role and no applicant role — show sign-in
        setAppScreen('sign-in');
      } catch (err) {
        console.error('Session restore error:', err);
        setAppScreen('sign-in');
      }
    };

    restoreSession();
  }, []);

  if (!fontsLoaded || appScreen === 'loading') {
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
        <AuthProvider onSignOut={() => setAppScreen('sign-in')}>
          {appScreen === 'main' ? (
            <PermissionGate>
              <MainLayout />
            </PermissionGate>
          ) : appScreen === 'application' ? (
            <CourierApplicationFlow onBack={() => setAppScreen('sign-in')} />
          ) : (
            <SignInScreen
              onSignInSuccess={() => setAppScreen('main')}
              onShowApplication={() => setAppScreen('application')}
            />
          )}
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
