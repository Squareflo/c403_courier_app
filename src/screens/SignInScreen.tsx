import React, { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, SafeAreaView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Moon, Sun } from 'lucide-react-native';
import { Button } from '../components/ui';
import FormField from '../components/ui/FormField';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

interface SignInScreenProps {
  onSignInSuccess: () => void;
}

const ALLOWED_COURIER_ROLES = ['courier'] as const;

export function SignInScreen({ onSignInSuccess }: SignInScreenProps) {
  const { colors, isDark, toggleTheme } = useTheme();
  const { setCourier } = useAuth();
  const { width } = useWindowDimensions();

  const isTablet = width >= 768;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const emailRegex = useMemo(() => /\S+@\S+\.\S+/, []);

  const handleSignIn = async () => {
    if (!email.trim()) {
      setError('Email is required');
      return;
    }

    if (!emailRegex.test(email.trim())) {
      setError('Please enter a valid email address');
      return;
    }

    if (!password.trim()) {
      setError('Password is required');
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.toLowerCase().trim(),
        password,
      });

      if (signInError) {
        throw signInError;
      }

      if (!data.user) {
        throw new Error('No user returned from sign in');
      }

      const { data: customerData, error: customerError } = await supabase
        .from('customer')
        .select('id, first_name, last_name, email, profile_picture_url, phone_number, roles, is_verified, community, is_online, current_location_latitude, current_location_longitude, points_30_days')
        .eq('id', data.user.id)
        .single();

      if (customerError || !customerData) {
        await supabase.auth.signOut();
        setError('Account not found. Please contact support.');
        return;
      }

      if (!customerData.is_verified) {
        await supabase.auth.signOut();
        setError('Your account is pending verification. Please check your email.');
        return;
      }

      const userRoles = Array.isArray(customerData.roles)
        ? (customerData.roles as string[])
        : [];

      const hasAllowedRole = userRoles.some((role) =>
        ALLOWED_COURIER_ROLES.includes(role as (typeof ALLOWED_COURIER_ROLES)[number])
      );

      if (!hasAllowedRole) {
        await supabase.auth.signOut();
        setError('This account does not have courier access.');
        return;
      }

      setCourier({
        id: customerData.id,
        first_name: customerData.first_name || '',
        last_name: customerData.last_name || '',
        email: customerData.email || '',
        profile_picture_url: customerData.profile_picture_url,
        phone_number: customerData.phone_number,
        roles: userRoles,
        is_verified: customerData.is_verified,
        community: customerData.community,
        is_online: customerData.is_online || false,
        current_location_latitude: customerData.current_location_latitude,
        current_location_longitude: customerData.current_location_longitude,
        points_30_days: customerData.points_30_days,
      });

      onSignInSuccess();
    } catch (err: any) {
      if (err.message?.includes('Invalid login credentials')) {
        setError('Invalid email or password. Please try again.');
      } else if (err.message?.includes('Email not confirmed')) {
        setError('Please verify your email address before signing in.');
      } else if (err.message?.includes('Too many requests')) {
        setError('Too many login attempts. Please wait a moment and try again.');
      } else {
        setError(err.message || 'Sign in failed. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView style={styles.keyboardView} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.root, isTablet && styles.rootTablet]}>
          <TouchableOpacity
            style={[styles.themeToggle, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={toggleTheme}
            activeOpacity={0.8}
          >
            {isDark ? <Sun size={20} color={colors.icon} /> : <Moon size={20} color={colors.icon} />}
          </TouchableOpacity>

          <View style={[styles.card, isTablet && styles.cardTablet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <FormField
              label="Email"
              value={email}
              onChangeText={(text) => {
                setEmail(text);
                if (error) setError('');
              }}
              placeholder="Enter your email"
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <FormField
              label="Password"
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                if (error) setError('');
              }}
              placeholder="Enter your password"
              secureTextEntry
            />

            {error ? <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text> : null}

            <Button
              title={isLoading ? 'Signing In...' : 'Sign In'}
              variant="dark"
              size="large"
              onPress={handleSignIn}
              disabled={isLoading}
            />

            <View style={styles.linksContainer}>
              <Text style={[styles.linkText, { color: colors.textSecondary }]}>
                Need help?{' '}
                <Text style={[styles.linkAction, { color: colors.text }]}>
                  Contact Support
                </Text>
              </Text>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  root: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  rootTablet: {
    paddingHorizontal: 40,
  },
  themeToggle: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 520,
    borderWidth: 0,
    borderRadius: 24,
    padding: 24,
  },
  cardTablet: {
    maxWidth: 640,
    paddingHorizontal: 36,
    paddingVertical: 32,
  },
  errorText: {
    fontFamily: 'Montserrat_400Regular',
    fontSize: 13,
    marginTop: -4,
    marginBottom: 12,
  },
  linksContainer: {
    marginTop: 18,
    gap: 10,
    alignItems: 'center',
  },
  linkText: {
    fontFamily: 'Montserrat_400Regular',
    fontSize: 14,
  },
  linkAction: {
    fontFamily: 'Montserrat_700Bold',
    textDecorationLine: 'underline',
  },
});
