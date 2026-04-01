import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, ChevronDown, Moon, Search, Sun, X } from 'lucide-react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../components/ui';
import FormField from '../components/ui/FormField';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { fontFamily } from '../constants/typography';
import {
  registerCustomer,
  requestPasswordReset,
  resendVerificationCode,
  verifyEmail,
  verifyResetCode,
  verifyResetCodeAndSetPassword,
} from '../api/functions';
import { FlatList, Modal } from 'react-native';


// ── Types ────────────────────────────────────────────────────────────────────

type Screen = 'auth' | 'verify-email' | 'forgot-password' | 'enter-reset-code' | 'reset-success';
type StepType = 'initial' | 'signin' | 'register';

interface SignInScreenProps {
  onSignInSuccess: () => void;
  onShowApplication?: () => void;
}

// ── Country data (for sign-up phone) ─────────────────────────────────────────

const COUNTRIES = [
  { code: 'CA', name: 'Canada', dialCode: '+1', flag: '🇨🇦' },
  { code: 'US', name: 'United States', dialCode: '+1', flag: '🇺🇸' },
  { code: 'GB', name: 'United Kingdom', dialCode: '+44', flag: '🇬🇧' },
  { code: 'AU', name: 'Australia', dialCode: '+61', flag: '🇦🇺' },
  { code: 'IN', name: 'India', dialCode: '+91', flag: '🇮🇳' },
  { code: 'NG', name: 'Nigeria', dialCode: '+234', flag: '🇳🇬' },
  { code: 'PH', name: 'Philippines', dialCode: '+63', flag: '🇵🇭' },
  { code: 'PK', name: 'Pakistan', dialCode: '+92', flag: '🇵🇰' },
  { code: 'BD', name: 'Bangladesh', dialCode: '+880', flag: '🇧🇩' },
  { code: 'MX', name: 'Mexico', dialCode: '+52', flag: '🇲🇽' },
  { code: 'BR', name: 'Brazil', dialCode: '+55', flag: '🇧🇷' },
  { code: 'DE', name: 'Germany', dialCode: '+49', flag: '🇩🇪' },
  { code: 'FR', name: 'France', dialCode: '+33', flag: '🇫🇷' },
  { code: 'CN', name: 'China', dialCode: '+86', flag: '🇨🇳' },
  { code: 'JP', name: 'Japan', dialCode: '+81', flag: '🇯🇵' },
  { code: 'KR', name: 'South Korea', dialCode: '+82', flag: '🇰🇷' },
  { code: 'ZA', name: 'South Africa', dialCode: '+27', flag: '🇿🇦' },
  { code: 'KE', name: 'Kenya', dialCode: '+254', flag: '🇰🇪' },
  { code: 'GH', name: 'Ghana', dialCode: '+233', flag: '🇬🇭' },
  { code: 'ET', name: 'Ethiopia', dialCode: '+251', flag: '🇪🇹' },
  { code: 'CM', name: 'Cameroon', dialCode: '+237', flag: '🇨🇲' },
  { code: 'EG', name: 'Egypt', dialCode: '+20', flag: '🇪🇬' },
  { code: 'AE', name: 'United Arab Emirates', dialCode: '+971', flag: '🇦🇪' },
  { code: 'SA', name: 'Saudi Arabia', dialCode: '+966', flag: '🇸🇦' },
];

const ALLOWED_COURIER_ROLES = ['courier'] as const;
const APPLICANT_ROLES = ['courier-applicant'] as const;

// ── Component ────────────────────────────────────────────────────────────────

export function SignInScreen({ onSignInSuccess, onShowApplication }: SignInScreenProps) {
  const { colors, isDark, toggleTheme } = useTheme();
  const { setCourier } = useAuth();

  // Screen state
  const [screen, setScreen] = useState<Screen>('auth');
  const [step, setStep] = useState<StepType>('initial');

  // Email (shared across steps)
  const [email, setEmail] = useState('');

  // Sign In fields
  const [password, setPassword] = useState('');

  // Sign Up fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [selectedCountry, setSelectedCountry] = useState(COUNTRIES[0]);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');

  // Verify email state
  const [verifyUserId, setVerifyUserId] = useState('');
  const [verifyEmail_, setVerifyEmail_] = useState('');
  const [verifyPassword, setVerifyPassword] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [countdown, setCountdown] = useState(45);
  const [canResend, setCanResend] = useState(false);

  // Forgot password state
  const [resetEmail, setResetEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [resetStep, setResetStep] = useState(1); // 1=code, 2=new pass, 3=success
  const [newPassword, setNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');

  // Shared
  const [errors, setErrors] = useState<any>({});
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);

  // Animations
  const screenOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(screenOpacity, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, []);

  // Countdown for verify email
  useEffect(() => {
    if (screen !== 'verify-email') return;
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      setCanResend(true);
    }
  }, [countdown, screen]);

  const filteredCountries = useMemo(() => {
    if (!countrySearch.trim()) return COUNTRIES;
    const s = countrySearch.toLowerCase();
    return COUNTRIES.filter(c => c.name.toLowerCase().includes(s) || c.dialCode.includes(s));
  }, [countrySearch]);

  // ── Dynamic colors ──────────────────────────────────────────────────

  const bg = isDark ? colors.background : '#F5F5F5';
  const textColor = isDark ? colors.text : '#000';
  const textSecColor = isDark ? colors.textSecondary : '#555';
  const cardBg = isDark ? colors.card : colors.card;
  const subtextColor = isDark ? colors.textSecondary : '#666';

  // ── Helpers ─────────────────────────────────────────────────────────

  const clearErrors = () => { setErrors({}); setError(''); setSuccessMessage(''); };

  const goToScreen = (s: Screen) => {
    clearErrors();
    setScreen(s);
  };

  const handleBack = () => {
    setStep('initial');
    setPassword('');
    setSignupPassword('');
    setConfirmPassword('');
    setErrors({});
    setSuccessMessage('');
  };

  // ── Email Check (initial step) ────────────────────────────────────

  const handleEmailSubmit = async () => {
    if (!email) {
      setErrors({ email: 'Email is required' });
      return;
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
      setErrors({ email: 'Email is invalid' });
      return;
    }

    setIsLoading(true);
    setErrors({});

    try {
      const normalizedEmail = email.toLowerCase().trim();

      // Check if customer exists
      const { data: customers, error: checkError } = await supabase
        .from('customer')
        .select('id, first_name')
        .eq('email', normalizedEmail)
        .limit(1);

      if (checkError) {
        console.error('Error checking customer:', checkError);
        setErrors({ general: 'Something went wrong. Please try again.' });
        return;
      }

      if (customers && customers.length > 0) {
        // Existing customer - go to sign in
        setStep('signin');
      } else {
        // New customer - go to registration
        setStep('register');
      }
    } catch (error: any) {
      console.error('Error checking email:', error);
      setErrors({ general: 'Something went wrong. Please try again.' });
    } finally {
      setIsLoading(false);
    }
  };

  // ── Sign In ─────────────────────────────────────────────────────────

  const handleSignIn = async () => {
    const newErrors: any = {};
    if (!password) newErrors.password = 'Password is required';
    else if (password.length < 6) newErrors.password = 'Password must be at least 6 characters';
    if (Object.keys(newErrors).length) { setErrors(newErrors); return; }

    setIsLoading(true);
    clearErrors();

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.toLowerCase().trim(),
        password,
      });

      if (signInError) throw signInError;
      if (!data.user) throw new Error('No user returned from sign in');

      if (!data.user.email_confirmed_at) {
        setVerifyEmail_(email.toLowerCase().trim());
        setVerifyUserId(data.user.id);
        setVerifyPassword(password);
        setCountdown(45);
        setCanResend(false);
        setVerificationCode('');
        goToScreen('verify-email');
        return;
      }

      const { data: customerData, error: customerError } = await supabase
        .from('customer')
        .select('id, first_name, last_name, email, profile_picture_url, phone_number, roles, is_verified, is_online, current_location_latitude, current_location_longitude, points_30_days, city_id, preferred_distance_unit')
        .eq('id', data.user.id)
        .single();

      if (customerError || !customerData) {
        setErrors({ general: 'Account not found. Please contact support.' });
        return;
      }

      if (!customerData.is_verified) {
        // Don't sign out — send them to verify email
        setVerifyEmail_(email.toLowerCase().trim());
        setVerifyUserId(data.user.id);
        setVerifyPassword(password);
        setCountdown(45);
        setCanResend(false);
        setVerificationCode('');
        goToScreen('verify-email');
        return;
      }

      const userRoles = Array.isArray(customerData.roles) ? (customerData.roles as string[]) : [];
      const isCourier = userRoles.some(r => ALLOWED_COURIER_ROLES.includes(r as any));

      if (!isCourier) {
        setCourier({
          id: customerData.id,
          first_name: customerData.first_name || '',
          last_name: customerData.last_name || '',
          email: customerData.email || '',
          profile_picture_url: customerData.profile_picture_url,
          phone_number: customerData.phone_number,
          roles: userRoles,
          is_verified: customerData.is_verified,

          is_online: customerData.is_online || false,
          current_location_latitude: customerData.current_location_latitude,
          current_location_longitude: customerData.current_location_longitude,
          points_30_days: customerData.points_30_days,
          city_id: customerData.city_id,
          preferred_distance_unit: customerData.preferred_distance_unit,
        });
        onShowApplication?.();
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
        city_id: customerData.city_id,
        preferred_distance_unit: customerData.preferred_distance_unit,
      });

      onSignInSuccess();
    } catch (err: any) {
      if (err.message?.includes('Invalid login credentials')) {
        setErrors({ general: 'Invalid email or password. Please try again.' });
      } else if (err.message?.includes('Email not confirmed')) {
        setErrors({ general: 'Please verify your email address before signing in.' });
      } else if (err.message?.includes('Too many requests')) {
        setErrors({ general: 'Too many login attempts. Please wait a moment and try again.' });
      } else {
        setErrors({ general: err.message || 'Sign in failed. Please try again.' });
      }
    } finally {
      setIsLoading(false);
    }
  };

  // ── Sign Up ─────────────────────────────────────────────────────────

  const handleSignUp = async () => {
    const newErrors: any = {};
    if (!firstName) newErrors.firstName = 'First name is required';
    if (!lastName) newErrors.lastName = 'Last name is required';
    if (!phoneNumber) newErrors.phoneNumber = 'Phone number is required';
    if (!signupPassword) newErrors.signupPassword = 'Password is required';
    else if (signupPassword.length < 6) newErrors.signupPassword = 'Password must be at least 6 characters';
    if (!confirmPassword) newErrors.confirmPassword = 'Please confirm your password';
    else if (signupPassword !== confirmPassword) newErrors.confirmPassword = 'Passwords do not match';
    if (Object.keys(newErrors).length) { setErrors(newErrors); return; }

    setIsLoading(true);
    clearErrors();

    try {
      const formattedPhone = `${selectedCountry.dialCode} ${phoneNumber}`;
      const response = await registerCustomer({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.toLowerCase().trim(),
        phone_number: formattedPhone,
        password: signupPassword,
      });

      const result = response.data;
      await supabase.auth.signOut();

      setVerifyEmail_(result.email || email.toLowerCase().trim());
      setVerifyUserId(result.id);
      setVerifyPassword(signupPassword);
      setCountdown(45);
      setCanResend(false);
      setVerificationCode('');
      goToScreen('verify-email');
    } catch (err: any) {
      const errorData = err.response?.data || {};
      const errorMessage = errorData.error || errorData.message || err.message || 'Sign up failed.';
      const fullStr = `${errorMessage} ${errorData.details || ''}`.toLowerCase();

      if (fullStr.includes('already been registered') || fullStr.includes('already exists') || fullStr.includes('already registered')) {
        setErrors({ general: 'This email is already registered. Please sign in instead.' });
        setStep('signin');
      } else if (errorMessage.toLowerCase().includes('email')) {
        setErrors({ general: errorMessage });
      } else if (errorMessage.toLowerCase().includes('password')) {
        setErrors({ signupPassword: errorMessage });
      } else if (errorMessage.toLowerCase().includes('phone')) {
        setErrors({ phoneNumber: errorMessage });
      } else {
        setErrors({ general: errorMessage });
      }
    } finally {
      setIsLoading(false);
    }
  };

  // ── Verify Email ────────────────────────────────────────────────────

  const handleVerifyEmail = async () => {
    if (!verificationCode || verificationCode.length !== 6) {
      setError('Please enter a valid 6-digit code');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      await verifyEmail({ userId: verifyUserId, verificationCode });

      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: verifyEmail_,
        password: verifyPassword,
      });

      if (signInError || !signInData.user) {
        setError('Email verified! Please sign in.');
        setTimeout(() => { goToScreen('auth'); setStep('signin'); setEmail(verifyEmail_); }, 2000);
        return;
      }

      const { data: customerData, error: customerError } = await supabase
        .from('customer')
        .select('id, first_name, last_name, email, profile_picture_url, phone_number, roles, is_verified, is_online, current_location_latitude, current_location_longitude, points_30_days, city_id, preferred_distance_unit')
        .eq('id', signInData.user.id)
        .single();

      if (customerError || !customerData || !customerData.is_verified) {
        setError('Email verified! Please sign in.');
        setTimeout(() => { goToScreen('auth'); setStep('signin'); setEmail(verifyEmail_); }, 2000);
        return;
      }

      const userRoles = Array.isArray(customerData.roles) ? (customerData.roles as string[]) : [];
      const isCourier = userRoles.some(r => ALLOWED_COURIER_ROLES.includes(r as any));

      if (!isCourier) {
        setCourier({
          id: customerData.id,
          first_name: customerData.first_name || '',
          last_name: customerData.last_name || '',
          email: customerData.email || '',
          profile_picture_url: customerData.profile_picture_url,
          phone_number: customerData.phone_number,
          roles: userRoles,
          is_verified: customerData.is_verified,

          is_online: customerData.is_online || false,
          current_location_latitude: customerData.current_location_latitude,
          current_location_longitude: customerData.current_location_longitude,
          points_30_days: customerData.points_30_days,
          city_id: customerData.city_id,
          preferred_distance_unit: customerData.preferred_distance_unit,
        });
        onShowApplication?.();
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
        city_id: customerData.city_id,
        preferred_distance_unit: customerData.preferred_distance_unit,
      });

      onSignInSuccess();
    } catch (err: any) {
      const msg = err.response?.data?.error || err.response?.data?.message || err.message || 'Verification failed.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!canResend) return;
    setIsResending(true);
    setError('');
    try {
      await resendVerificationCode({ userId: verifyUserId, email: verifyEmail_ });
      setCountdown(45);
      setCanResend(false);
      setSuccessMessage('Code sent! Check your email.');
      setTimeout(() => setSuccessMessage(''), 5000);
    } catch (err: any) {
      setError('Failed to resend code. Please try again.');
    } finally {
      setIsResending(false);
    }
  };

  // ── Forgot Password ─────────────────────────────────────────────────

  const handleRequestReset = async () => {
    if (!resetEmail) { setError('Email is required'); return; }
    if (!/\S+@\S+\.\S+/.test(resetEmail)) { setError('Please enter a valid email'); return; }

    setIsLoading(true);
    setError('');

    try {
      await requestPasswordReset({ email: resetEmail.toLowerCase().trim() });
      setResetStep(1);
      goToScreen('enter-reset-code');
    } catch (err: any) {
      const msg = err.response?.data?.error || err.response?.data?.message || err.message || 'Failed to send reset email.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyResetCode = async () => {
    if (!resetCode || resetCode.length !== 6) { setError('Please enter a valid 6-digit code'); return; }
    setIsLoading(true);
    setError('');
    try {
      await verifyResetCode({ email: resetEmail.toLowerCase().trim(), code: resetCode });
      setResetStep(2);
      setError('');
    } catch (err: any) {
      const msg = err.response?.data?.error || err.response?.data?.message || err.message || 'Invalid code.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetNewPassword = async () => {
    if (!newPassword || newPassword.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (newPassword !== resetConfirmPassword) { setError('Passwords do not match'); return; }

    setIsLoading(true);
    setError('');

    try {
      await verifyResetCodeAndSetPassword({
        email: resetEmail.toLowerCase().trim(),
        verificationCode: resetCode,
        newPassword,
        password: newPassword,
      });
      setResetStep(3);
    } catch (err: any) {
      const msg = err.response?.data?.error || err.response?.data?.message || err.message || 'Failed to reset password.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendResetCode = async () => {
    setIsResending(true);
    setError('');
    setSuccessMessage('');
    try {
      await requestPasswordReset({ email: resetEmail.toLowerCase().trim() });
      setSuccessMessage('Reset code sent! Check your email.');
      setTimeout(() => setSuccessMessage(''), 5000);
    } catch {
      setError('Failed to resend code.');
    } finally {
      setIsResending(false);
    }
  };

  // ── Render: Auth (Step-based) ─────────────────────────────────────

  const renderAuth = () => (
    <>
      {/* Header */}
      {step === 'initial' ? (
        <View style={styles.header}>
          <View style={{ width: 40 }} />
          <Text style={[styles.headerTitle, { color: textColor }]}>Welcome</Text>
          <TouchableOpacity
            style={[styles.themeToggle, { backgroundColor: isDark ? colors.surface : '#e5e5e5' }]}
            onPress={toggleTheme}
            activeOpacity={0.8}
          >
            {isDark ? <Sun size={18} color={colors.icon} /> : <Moon size={18} color={colors.icon} />}
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <ArrowLeft size={24} color={textColor} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: textColor }]}>
            {step === 'signin' ? 'Sign In' : 'Create Account'}
          </Text>
          <TouchableOpacity
            style={[styles.themeToggle, { backgroundColor: isDark ? colors.surface : '#e5e5e5' }]}
            onPress={toggleTheme}
            activeOpacity={0.8}
          >
            {isDark ? <Sun size={18} color={colors.icon} /> : <Moon size={18} color={colors.icon} />}
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.formContainer}>
        {/* Initial step: email + Continue */}
        {step === 'initial' && (
          <>
            <FormField
              label="Email Address"
              value={email}
              onChangeText={(t: string) => { setEmail(t); if (errors.email) setErrors({ ...errors, email: null }); }}
              placeholder="Enter your email"
              keyboardType="email-address"
              autoCapitalize="none"
              error={errors.email}
            />

            {errors.general ? <Text style={styles.generalError}>{errors.general}</Text> : null}

            <Button
              title={isLoading ? 'Checking...' : 'Continue'}
              onPress={handleEmailSubmit}
              variant="dark"
              size="large"
              style={styles.actionButton}
              disabled={isLoading}
            />

            <Text style={[styles.subtextCenter, { color: subtextColor }]}>
              Enter your email address to allow us to check if you already have an account. If not, we'll help you create one.
            </Text>
          </>
        )}

        {/* Sign In step: password only */}
        {step === 'signin' && (
          <>
            <Text style={[styles.contextText, { color: subtextColor }]}>
              You already have a Chow Local account. Please sign in below.
            </Text>

            <FormField
              label="Password"
              value={password}
              onChangeText={(t: string) => { setPassword(t); if (errors.password) setErrors({ ...errors, password: null }); }}
              placeholder="Enter your password"
              secureTextEntry
              error={errors.password}
            />

            {successMessage ? <Text style={styles.successText}>{successMessage}</Text> : null}
            {errors.general ? <Text style={styles.generalError}>{errors.general}</Text> : null}

            <Button
              title={isLoading ? 'Signing In...' : 'Sign In'}
              onPress={handleSignIn}
              variant="dark"
              size="large"
              style={styles.actionButton}
              disabled={isLoading}
            />

            <View style={styles.forgotContainer}>
              <Text style={[styles.forgotText, { color: textSecColor }]}>
                Forgot your password?{' '}
                <Text
                  style={[styles.resetLink, { color: textColor }]}
                  onPress={() => {
                    setResetEmail(email);
                    setResetCode('');
                    setResetStep(1);
                    setNewPassword('');
                    setResetConfirmPassword('');
                    goToScreen('forgot-password');
                  }}
                >
                  Reset it.
                </Text>
              </Text>
            </View>
          </>
        )}

        {/* Register step: full form */}
        {step === 'register' && (
          <>
            <Text style={[styles.contextText, { color: subtextColor }]}>
              Let's create your Chow Local account.
            </Text>

            <FormField
              label="First Name"
              value={firstName}
              onChangeText={(t: string) => { setFirstName(t); if (errors.firstName) setErrors({ ...errors, firstName: null }); }}
              placeholder="Enter your first name"
              autoCapitalize="words"
              error={errors.firstName}
            />

            <FormField
              label="Last Name"
              value={lastName}
              onChangeText={(t: string) => { setLastName(t); if (errors.lastName) setErrors({ ...errors, lastName: null }); }}
              placeholder="Enter your last name"
              autoCapitalize="words"
              error={errors.lastName}
            />

            {/* Phone with country picker */}
            <View style={{ marginBottom: 20 }}>
              <Text style={[styles.fieldLabel, { color: isDark ? colors.textSecondary : '#333' }]}>Mobile Number</Text>
              <View style={styles.phoneRow}>
                <TouchableOpacity
                  style={[styles.countryBtn, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}
                  onPress={() => setShowCountryPicker(true)}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 20 }}>{selectedCountry.flag}</Text>
                  <Text style={[styles.dialCodeText, { color: textColor }]}>{selectedCountry.dialCode}</Text>
                  <ChevronDown size={16} color={textSecColor} />
                </TouchableOpacity>
                <View style={{ flex: 1, marginBottom: -20 }}>
                  <FormField
                    value={phoneNumber}
                    onChangeText={(t: string) => { setPhoneNumber(t); if (errors.phoneNumber) setErrors({ ...errors, phoneNumber: null }); }}
                    placeholder="Phone Number"
                    keyboardType="phone-pad"
                    error={errors.phoneNumber}
                  />
                </View>
              </View>
            </View>

            <FormField
              label="Password"
              value={signupPassword}
              onChangeText={(t: string) => { setSignupPassword(t); if (errors.signupPassword) setErrors({ ...errors, signupPassword: null }); }}
              placeholder="Create a password"
              secureTextEntry
              error={errors.signupPassword}
            />

            <FormField
              label="Confirm Password"
              value={confirmPassword}
              onChangeText={(t: string) => { setConfirmPassword(t); if (errors.confirmPassword) setErrors({ ...errors, confirmPassword: null }); }}
              placeholder="Confirm your password"
              secureTextEntry
              error={errors.confirmPassword}
            />

            {errors.general ? <Text style={styles.generalError}>{errors.general}</Text> : null}

            <Button
              title={isLoading ? 'Creating Account...' : 'Create Account'}
              onPress={handleSignUp}
              variant="dark"
              size="large"
              style={styles.actionButton}
              disabled={isLoading}
            />
          </>
        )}

        {/* Need Help section on every step */}
        <View style={styles.helpContainer}>
          <Text style={[styles.helpText, { color: textSecColor }]}>
            Need help?{' '}
            <Text style={[styles.helpLink, { color: textColor }]}>Contact Support</Text>
          </Text>
        </View>
      </View>
    </>
  );

  // ── Render: Verify Email ────────────────────────────────────────────

  const renderVerifyEmail = () => (
    <>
      <View style={styles.header}>
        <View style={{ width: 40 }} />
        <Text style={[styles.headerTitle, { color: textColor }]}>Email Verification</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.formContainer}>
        {error ? <View style={styles.errorBox}><Text style={styles.errorBoxText}>{error}</Text></View> : null}
        {successMessage ? <View style={styles.successBox}><Text style={styles.successBoxText}>{successMessage}</Text></View> : null}

        <FormField
          label="Enter the code we sent to your email"
          value={verificationCode}
          onChangeText={t => { setVerificationCode(t.replace(/[^0-9]/g, '')); if (error) setError(''); }}
          placeholder="XXXXXX"
          keyboardType="number-pad"
          maxLength={6}
          style={{ textAlign: 'center', fontSize: 24, letterSpacing: 12 }}
        />

        <Button title={isLoading ? 'Verifying...' : 'Continue'} onPress={handleVerifyEmail} variant="dark" size="large" style={{ marginTop: 8 }} disabled={isLoading || verificationCode.length !== 6} />

        <View style={[styles.infoBlock, verificationCode.length > 0 && { opacity: 0.3 }]}>
          <Text style={[styles.infoText, { color: textColor }]}>
            We sent the code to:{' '}
            <Text style={{ fontFamily: fontFamily.bold }}>{verifyEmail_}</Text>
            . Wrong email?{' '}
            <Text style={{ textDecorationLine: 'underline' }} onPress={() => { goToScreen('auth'); setStep('initial'); }}>Start over</Text>.
          </Text>
        </View>

        <View style={[styles.infoBlock, verificationCode.length > 0 && { opacity: 0.3 }]}>
          <Text style={[styles.infoText, { color: textColor }]}>
            {canResend ? (
              <>You can <Text style={{ fontFamily: fontFamily.bold, textDecorationLine: 'underline' }} onPress={handleResendVerification}>{isResending ? 'Resending...' : 'resend'}</Text> now.</>
            ) : (
              <>Or, you can <Text style={{ color: textSecColor }}>resend</Text> it in: <Text style={{ fontFamily: fontFamily.bold }}>{countdown} seconds</Text></>
            )}
          </Text>
        </View>

        <View style={styles.helpContainer}>
          <Text style={[styles.helpText, { color: textSecColor }]}>
            Need help?{' '}
            <Text style={[styles.helpLink, { color: textColor }]}>Contact Support</Text>
          </Text>
        </View>
      </View>
    </>
  );

  // ── Render: Forgot Password ─────────────────────────────────────────

  const renderForgotPassword = () => (
    <>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => goToScreen('auth')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <ArrowLeft size={24} color={textColor} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: textColor }]}>Forgot Password</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.formContainer}>
        <Text style={[styles.descText, { color: textSecColor }]}>
          Enter your email address and we'll send you a verification code to reset your password.
        </Text>

        {error ? <View style={styles.errorBox}><Text style={styles.errorBoxText}>{error}</Text></View> : null}

        <FormField label="Email Address" value={resetEmail} onChangeText={t => { setResetEmail(t); if (error) setError(''); }} placeholder="Enter your email" keyboardType="email-address" autoCapitalize="none" />

        <Button title={isLoading ? 'Sending...' : 'Continue'} onPress={handleRequestReset} variant="dark" size="large" style={{ marginTop: 8 }} disabled={isLoading} />

        <View style={styles.helpContainer}>
          <Text style={[styles.helpText, { color: textSecColor }]}>
            Need help?{' '}
            <Text style={[styles.helpLink, { color: textColor }]}>Contact Support</Text>
          </Text>
        </View>
      </View>
    </>
  );

  // ── Render: Enter Reset Code ────────────────────────────────────────

  const renderEnterResetCode = () => (
    <>
      <View style={styles.header}>
        {resetStep === 1 ? (
          <TouchableOpacity onPress={() => goToScreen('forgot-password')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <ArrowLeft size={24} color={textColor} />
          </TouchableOpacity>
        ) : <View style={{ width: 24 }} />}
        <Text style={[styles.headerTitle, { color: textColor }]}>Reset Password</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.formContainer}>
        {/* Step 1: Enter code */}
        {resetStep === 1 && (
          <>
            {successMessage ? <View style={styles.successBox}><Text style={styles.successBoxText}>{successMessage}</Text></View> : null}
            {error ? <View style={styles.errorBox}><Text style={styles.errorBoxText}>{error}</Text></View> : null}

            <FormField
              label="Verification Code"
              value={resetCode}
              onChangeText={t => { setResetCode(t.replace(/[^0-9]/g, '')); if (error) setError(''); }}
              placeholder="000000"
              keyboardType="number-pad"
              maxLength={6}
              style={{ textAlign: 'center', fontSize: 24, letterSpacing: 12 }}
            />

            <Button title={isLoading ? 'Verifying...' : 'Verify Code'} onPress={handleVerifyResetCode} variant="dark" size="large" style={{ marginTop: 8 }} disabled={isLoading || resetCode.length !== 6} />

            <View style={styles.resendContainer}>
              <Text style={[styles.infoText, { color: textSecColor }]}>Didn't receive the code?</Text>
              <TouchableOpacity onPress={handleResendResetCode} disabled={isResending}>
                <Text style={[styles.resendLink, { color: textColor }]}>{isResending ? 'Resending...' : 'Resend Code'}</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* Step 2: New password */}
        {resetStep === 2 && (
          <>
            {error ? <View style={styles.errorBox}><Text style={styles.errorBoxText}>{error}</Text></View> : null}

            <FormField key="reset-new-pw" label="New Password" value={newPassword} onChangeText={t => { setNewPassword(t); if (error) setError(''); }} placeholder="Enter new password" secureTextEntry style={{ letterSpacing: 0 }} />
            <FormField key="reset-confirm-pw" label="Confirm New Password" value={resetConfirmPassword} onChangeText={t => { setResetConfirmPassword(t); if (error) setError(''); }} placeholder="Confirm new password" secureTextEntry style={{ letterSpacing: 0 }} />

            <Button title={isLoading ? 'Setting Password...' : 'Set New Password'} onPress={handleSetNewPassword} variant="dark" size="large" style={{ marginTop: 8 }} disabled={isLoading || !newPassword || !resetConfirmPassword} />
          </>
        )}

        {/* Step 3: Success */}
        {resetStep === 3 && (
          <>
            <View style={{ alignItems: 'center', marginBottom: 24 }}>
              <Ionicons name="checkmark-circle" size={80} color="#22C55E" />
            </View>
            <Text style={[styles.bigTitle, { color: textColor }]}>Password Reset!</Text>
            <Text style={[styles.descText, { color: textSecColor }]}>
              Your password has been successfully updated. You can now sign in with your new password.
            </Text>
            <Button title="Proceed to Sign In" onPress={() => { goToScreen('auth'); setStep('signin'); }} variant="dark" size="large" style={{ marginTop: 8 }} />
          </>
        )}

        <View style={styles.helpContainer}>
          <Text style={[styles.helpText, { color: textSecColor }]}>
            Need help?{' '}
            <Text style={[styles.helpLink, { color: textColor }]}>Contact Support</Text>
          </Text>
        </View>
      </View>
    </>
  );

  // ── Main render ─────────────────────────────────────────────────────

  const renderCurrentScreen = () => {
    switch (screen) {
      case 'auth': return renderAuth();
      case 'verify-email': return renderVerifyEmail();
      case 'forgot-password': return renderForgotPassword();
      case 'enter-reset-code': return renderEnterResetCode();
      default: return renderAuth();
    }
  };

  return (
    <Animated.View style={[styles.container, { backgroundColor: bg, opacity: screenOpacity }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
            <SafeAreaView style={{ flex: 1 }}>
              {renderCurrentScreen()}
            </SafeAreaView>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>

      {/* Country Picker Modal */}
      <Modal visible={showCountryPicker} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { setShowCountryPicker(false); setCountrySearch(''); }}>
        <View style={[styles.modalContainer, { backgroundColor: bg }]}>
          <View style={[styles.modalHeader, { backgroundColor: cardBg, borderBottomColor: isDark ? colors.border : '#e5e5e5' }]}>
            <View style={{ width: 40 }} />
            <Text style={[styles.headerTitle, { color: textColor }]}>Select Country</Text>
            <TouchableOpacity onPress={() => { setShowCountryPicker(false); setCountrySearch(''); }} style={{ padding: 8 }}>
              <X size={24} color={textColor} />
            </TouchableOpacity>
          </View>
          <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 }}>
            <View style={[styles.searchWrapper, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder }]}>
              <Search size={20} color={textSecColor} style={{ marginRight: 10 }} />
              <TextInput
                style={[styles.searchInput, { color: textColor }]}
                placeholder="Search country or dial code..."
                placeholderTextColor={textSecColor}
                value={countrySearch}
                onChangeText={setCountrySearch}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>
          <FlatList
            data={filteredCountries}
            keyExtractor={item => item.code}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.countryItem, { backgroundColor: cardBg, borderColor: isDark ? colors.border : '#e5e5e5' }]}
                onPress={() => { setSelectedCountry(item); setShowCountryPicker(false); setCountrySearch(''); }}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 24, marginRight: 12 }}>{item.flag}</Text>
                <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={[styles.countryName, { color: textColor }]}>{item.name}</Text>
                  <Text style={{ fontFamily: fontFamily.regular, fontSize: 15, color: textSecColor, marginLeft: 12 }}>{item.dialCode}</Text>
                </View>
              </TouchableOpacity>
            )}
          />
        </View>
      </Modal>
    </Animated.View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  headerTitle: { fontFamily: fontFamily.bold, fontSize: 20 },
  themeToggle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },

  // Form
  formContainer: { padding: 24, paddingTop: 40 },
  actionButton: { marginTop: 15, marginBottom: 20 },
  fieldLabel: { fontFamily: fontFamily.semiBold, fontSize: 14, marginBottom: 8 },
  phoneRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  countryBtn: { flexDirection: 'row', alignItems: 'center', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 12, gap: 4, minWidth: 95, borderWidth: 1 },
  dialCodeText: { fontFamily: fontFamily.regular, fontSize: 16 },

  // Context text (below header on signin/register steps)
  contextText: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 20, marginBottom: 20 },
  subtextCenter: { fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 19, textAlign: 'left', marginTop: 4 },

  // Forgot password
  forgotContainer: { alignSelf: 'center', marginTop: 10 },
  forgotText: { fontFamily: fontFamily.regular, fontSize: 14 },
  resetLink: { fontFamily: fontFamily.bold },

  // Help
  helpContainer: { alignItems: 'center', marginTop: 24 },
  helpText: { fontFamily: fontFamily.regular, fontSize: 14 },
  helpLink: { fontFamily: fontFamily.semiBold },

  // Errors & success
  generalError: { color: '#FF3B30', fontSize: 14, marginBottom: 16, fontFamily: fontFamily.regular, textAlign: 'center' },
  successText: { color: '#34C759', fontSize: 14, marginBottom: 16, fontFamily: fontFamily.regular, textAlign: 'center' },
  errorBox: { backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#FCA5A5', borderRadius: 8, padding: 12, marginBottom: 24 },
  errorBoxText: { fontFamily: fontFamily.regular, fontSize: 14, color: '#991B1B' },
  successBox: { backgroundColor: '#DCFCE7', borderWidth: 1, borderColor: '#86EFAC', borderRadius: 8, padding: 12, marginBottom: 24 },
  successBoxText: { fontFamily: fontFamily.regular, fontSize: 14, color: '#166534' },

  // Info blocks (verify email)
  infoBlock: { marginTop: 20 },
  infoText: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 20 },

  // Resend
  resendContainer: { marginTop: 24, alignItems: 'center' },
  resendLink: { fontFamily: fontFamily.bold, fontSize: 14, textDecorationLine: 'underline', marginTop: 8 },

  // Description
  descText: { fontFamily: fontFamily.regular, fontSize: 16, lineHeight: 24, marginBottom: 32, textAlign: 'center' },
  bigTitle: { fontFamily: fontFamily.bold, fontSize: 32, textAlign: 'center', marginBottom: 16 },

  // Country picker modal
  modalContainer: { flex: 1 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 16 : 16, paddingBottom: 16, borderBottomWidth: 1 },
  searchWrapper: { flexDirection: 'row', alignItems: 'center', borderRadius: 10, paddingHorizontal: 18, borderWidth: 1 },
  searchInput: { flex: 1, fontFamily: fontFamily.regular, fontSize: 16, paddingVertical: 14 },
  countryItem: { flexDirection: 'row', alignItems: 'center', borderRadius: 10, paddingVertical: 14, paddingHorizontal: 16, marginBottom: 8, borderWidth: 1 },
  countryName: { fontFamily: fontFamily.regular, fontSize: 16, flex: 1 },
});
