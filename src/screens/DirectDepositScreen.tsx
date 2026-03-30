import React, { useState, useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { fontFamily } from '../constants/typography';
import { supabase } from '../lib/supabase';

interface DirectDepositScreenProps {
  onBack: () => void;
  onContinue: () => void;
}

interface FormData {
  legal_first_name: string;
  legal_last_name: string;
  address: string;
  city: string;
  state: string;
  zip_code: string;
  country: string;
  date_of_birth: string;
  transit_number: string;
  institution_number: string;
  account_number: string;
  confirm_account_number: string;
}

export function DirectDepositScreen({ onBack, onContinue }: DirectDepositScreenProps) {
  const { courier } = useAuth();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [recordId, setRecordId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>({
    legal_first_name: '',
    legal_last_name: '',
    address: '',
    city: '',
    state: '',
    zip_code: '',
    country: '',
    date_of_birth: '',
    transit_number: '',
    institution_number: '',
    account_number: '',
    confirm_account_number: '',
  });
  const [error, setError] = useState('');

  // Refs for field focus
  const lastNameRef = useRef<TextInput>(null);
  const addressRef = useRef<TextInput>(null);
  const cityRef = useRef<TextInput>(null);
  const stateRef = useRef<TextInput>(null);
  const zipRef = useRef<TextInput>(null);
  const countryRef = useRef<TextInput>(null);
  const dobRef = useRef<TextInput>(null);
  const transitRef = useRef<TextInput>(null);
  const institutionRef = useRef<TextInput>(null);
  const accountRef = useRef<TextInput>(null);
  const confirmAccountRef = useRef<TextInput>(null);

  useEffect(() => {
    loadOrCreateRecord();
  }, []);

  const loadOrCreateRecord = async () => {
    if (!courier?.id) { setLoading(false); return; }

    try {
      // Try to find existing record
      const { data: existing, error: fetchErr } = await supabase
        .from('stripe_express_details')
        .select('*')
        .eq('customer_id', courier.id)
        .maybeSingle();

      if (existing) {
        setRecordId(existing.id);
        setForm({
          legal_first_name: existing.legal_first_name || '',
          legal_last_name: existing.legal_last_name || '',
          address: existing.address || '',
          city: existing.city || '',
          state: existing.state || '',
          zip_code: existing.zip_code || '',
          country: existing.country || '',
          date_of_birth: existing.date_of_birth || '',
          transit_number: existing.transit_number || '',
          institution_number: existing.institution_number || '',
          account_number: existing.account_number || '',
          confirm_account_number: existing.account_number || '',
        });
        setLoading(false);
        return;
      }

      // No record found — gather data from customer + community
      let city = '';
      let state = '';
      let country = 'Canada';

      if (courier.community) {
        // Parse "Regina, SK" or "Regina, Saskatchewan, Canada"
        const parts = courier.community.split(',').map((s: string) => s.trim());
        if (parts.length >= 1) city = parts[0];
        if (parts.length >= 2) state = parts[1];
        if (parts.length >= 3) country = parts[2];
      }

      // Also try community table for better data
      const { data: custData } = await supabase
        .from('customer')
        .select('community_id')
        .eq('id', courier.id)
        .single();

      if (custData?.community_id) {
        const { data: comm } = await supabase
          .from('community')
          .select('city, state, state_short, country')
          .eq('id', custData.community_id)
          .single();

        if (comm) {
          if (comm.city) city = comm.city;
          if (comm.state) state = comm.state;
          else if (comm.state_short) state = comm.state_short;
          if (comm.country) country = comm.country;
        }
      }

      const newRecord = {
        customer_id: courier.id,
        legal_first_name: courier.first_name || '',
        legal_last_name: courier.last_name || '',
        address: '',
        city,
        state,
        zip_code: '',
        country,
        date_of_birth: null,
        transit_number: '',
        institution_number: '',
        account_number: '',
      };

      const { data: inserted, error: insertErr } = await supabase
        .from('stripe_express_details')
        .insert(newRecord)
        .select()
        .single();

      if (insertErr) {
        console.error('[DirectDeposit] Insert error:', insertErr);
        // Might be unique constraint — try fetching again
        const { data: retry } = await supabase
          .from('stripe_express_details')
          .select('*')
          .eq('customer_id', courier.id)
          .maybeSingle();

        if (retry) {
          setRecordId(retry.id);
          setForm({
            legal_first_name: retry.legal_first_name || '',
            legal_last_name: retry.legal_last_name || '',
            address: retry.address || '',
            city: retry.city || '',
            state: retry.state || '',
            zip_code: retry.zip_code || '',
            country: retry.country || '',
            date_of_birth: retry.date_of_birth || '',
            transit_number: retry.transit_number || '',
            institution_number: retry.institution_number || '',
            account_number: retry.account_number || '',
            confirm_account_number: retry.account_number || '',
          });
        }
      } else if (inserted) {
        setRecordId(inserted.id);
        setForm({
          legal_first_name: inserted.legal_first_name || '',
          legal_last_name: inserted.legal_last_name || '',
          address: inserted.address || '',
          city: inserted.city || '',
          state: inserted.state || '',
          zip_code: inserted.zip_code || '',
          country: inserted.country || '',
          date_of_birth: inserted.date_of_birth || '',
          transit_number: inserted.transit_number || '',
          institution_number: inserted.institution_number || '',
          account_number: inserted.account_number || '',
          confirm_account_number: inserted.account_number || '',
        });
      }
    } catch (err) {
      console.error('[DirectDeposit] Error:', err);
    }

    setLoading(false);
  };

  const updateField = (field: keyof FormData, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setError('');
  };

  // Auto-format DOB as YYYY-MM-DD
  const handleDobChange = (value: string) => {
    // Strip non-numeric
    const digits = value.replace(/\D/g, '');
    let formatted = '';
    if (digits.length <= 4) {
      formatted = digits;
    } else if (digits.length <= 6) {
      formatted = `${digits.slice(0, 4)}-${digits.slice(4)}`;
    } else {
      formatted = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
    }
    updateField('date_of_birth', formatted);
  };

  const isFormComplete = () => {
    return (
      form.legal_first_name.trim() !== '' &&
      form.legal_last_name.trim() !== '' &&
      form.address.trim() !== '' &&
      form.city.trim() !== '' &&
      form.state.trim() !== '' &&
      form.zip_code.trim() !== '' &&
      form.country.trim() !== '' &&
      form.date_of_birth.trim().length === 10 &&
      form.transit_number.trim() !== '' &&
      form.institution_number.trim() !== '' &&
      form.account_number.trim() !== '' &&
      form.confirm_account_number.trim() !== '' &&
      form.account_number === form.confirm_account_number
    );
  };

  const handleContinue = async () => {
    if (!recordId || !courier?.id) return;

    // Validate account numbers match
    if (form.account_number !== form.confirm_account_number) {
      setError('Account numbers do not match.');
      return;
    }

    // Validate DOB format
    const dobRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dobRegex.test(form.date_of_birth)) {
      setError('Please enter date of birth as YYYY-MM-DD.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const { error: updateErr } = await supabase
        .from('stripe_express_details')
        .update({
          legal_first_name: form.legal_first_name.trim(),
          legal_last_name: form.legal_last_name.trim(),
          address: form.address.trim(),
          city: form.city.trim(),
          state: form.state.trim(),
          zip_code: form.zip_code.trim(),
          country: form.country.trim(),
          date_of_birth: form.date_of_birth.trim(),
          transit_number: form.transit_number.trim(),
          institution_number: form.institution_number.trim(),
          account_number: form.account_number.trim(),
        })
        .eq('id', recordId);

      if (updateErr) {
        console.error('[DirectDeposit] Update error:', updateErr);
        setError('Failed to save details. Please try again.');
        setSaving(false);
        return;
      }

      onContinue();
    } catch (err) {
      console.error('[DirectDeposit] Save error:', err);
      setError('An unexpected error occurred.');
    }

    setSaving(false);
  };

  const inputBg = isDark ? colors.inputBackground || '#1F2937' : '#F9FAFB';
  const inputBorder = colors.border;
  const labelColor = colors.textSecondary;

  const renderField = (
    label: string,
    field: keyof FormData,
    options?: {
      placeholder?: string;
      keyboardType?: any;
      autoCapitalize?: any;
      ref?: any;
      nextRef?: any;
      onChangeText?: (v: string) => void;
      maxLength?: number;
      secureTextEntry?: boolean;
    }
  ) => {
    const opts = options || {};
    return (
      <View style={styles.fieldContainer}>
        <Text style={[styles.fieldLabel, { color: labelColor }]}>{label}</Text>
        <TextInput
          ref={opts.ref}
          style={[styles.fieldInput, { backgroundColor: inputBg, borderColor: inputBorder, color: colors.text }]}
          value={form[field]}
          onChangeText={opts.onChangeText || ((v) => updateField(field, v))}
          placeholder={opts.placeholder || ''}
          placeholderTextColor={colors.textMuted}
          keyboardType={opts.keyboardType || 'default'}
          autoCapitalize={opts.autoCapitalize ?? 'words'}
          returnKeyType={opts.nextRef ? 'next' : 'done'}
          onSubmitEditing={() => opts.nextRef?.current?.focus()}
          blurOnSubmit={!opts.nextRef}
          maxLength={opts.maxLength}
          secureTextEntry={opts.secureTextEntry}
        />
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: isDark ? colors.background : colors.backgroundTertiary }]}>
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={onBack} style={styles.headerBackButton}>
            <ChevronLeft size={26} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Direct Deposit Details</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.textMuted} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: isDark ? colors.background : colors.backgroundTertiary }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={onBack} style={styles.headerBackButton}>
          <ChevronLeft size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Direct Deposit Details</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[styles.sectionDesc, { color: colors.textSecondary }]}>
            Please verify your details below. This information will be used to set up your direct deposit payouts.
          </Text>

          {error !== '' && (
            <View style={[styles.errorBox, { backgroundColor: isDark ? '#7F1D1D' : '#FEE2E2' }]}>
              <Text style={[styles.errorText, { color: isDark ? '#FCA5A5' : '#991B1B' }]}>{error}</Text>
            </View>
          )}

          {/* Personal Information */}
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Personal Information</Text>

          {renderField('Legal First Name', 'legal_first_name', { placeholder: 'First name', ref: undefined, nextRef: lastNameRef })}
          {renderField('Legal Last Name', 'legal_last_name', { placeholder: 'Last name', ref: lastNameRef, nextRef: dobRef })}
          {renderField('Date of Birth', 'date_of_birth', {
            placeholder: 'YYYY-MM-DD',
            keyboardType: 'number-pad',
            autoCapitalize: 'none',
            ref: dobRef,
            nextRef: addressRef,
            onChangeText: handleDobChange,
            maxLength: 10,
          })}

          {/* Address */}
          <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 24 }]}>Address</Text>

          {renderField('Street Address', 'address', { placeholder: '123 Main St', ref: addressRef, nextRef: cityRef })}
          {renderField('City', 'city', { placeholder: 'City', ref: cityRef, nextRef: stateRef })}
          {renderField('Province / State', 'state', { placeholder: 'SK', ref: stateRef, nextRef: zipRef })}
          {renderField('Postal / ZIP Code', 'zip_code', { placeholder: 'S4S 1A1', autoCapitalize: 'characters', ref: zipRef, nextRef: countryRef })}
          {renderField('Country', 'country', { placeholder: 'Canada', ref: countryRef, nextRef: transitRef })}

          {/* Bank Details */}
          <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 24 }]}>Bank Account Details</Text>

          {renderField('Transit Number', 'transit_number', {
            placeholder: '5 digits',
            keyboardType: 'number-pad',
            autoCapitalize: 'none',
            ref: transitRef,
            nextRef: institutionRef,
            maxLength: 5,
          })}
          {renderField('Institution Number', 'institution_number', {
            placeholder: '3 digits',
            keyboardType: 'number-pad',
            autoCapitalize: 'none',
            ref: institutionRef,
            nextRef: accountRef,
            maxLength: 3,
          })}
          {renderField('Account Number', 'account_number', {
            placeholder: 'Account number',
            keyboardType: 'number-pad',
            autoCapitalize: 'none',
            ref: accountRef,
            nextRef: confirmAccountRef,
            maxLength: 12,
          })}
          {renderField('Confirm Account Number', 'confirm_account_number', {
            placeholder: 'Re-enter account number',
            keyboardType: 'number-pad',
            autoCapitalize: 'none',
            ref: confirmAccountRef,
            maxLength: 12,
          })}

          {form.account_number !== '' && form.confirm_account_number !== '' && form.account_number !== form.confirm_account_number && (
            <Text style={styles.mismatchText}>Account numbers do not match</Text>
          )}
        </ScrollView>

        {/* Continue button — fixed at bottom */}
        {isFormComplete() && (
          <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16, backgroundColor: isDark ? colors.background : colors.backgroundTertiary }]}>
            <TouchableOpacity
              style={[styles.continueButton, { backgroundColor: isDark ? '#FFFFFF' : '#000000', opacity: saving ? 0.6 : 1 }]}
              onPress={handleContinue}
              disabled={saving}
              activeOpacity={0.8}
            >
              {saving ? (
                <ActivityIndicator size="small" color={isDark ? '#000' : '#fff'} />
              ) : (
                <Text style={[styles.continueButtonText, { color: isDark ? '#000000' : '#FFFFFF' }]}>Continue</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12 },
  headerBackButton: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontFamily: fontFamily.bold, fontSize: 18 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { paddingHorizontal: 20, paddingTop: 8 },
  sectionDesc: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 20, marginBottom: 20 },
  sectionTitle: { fontFamily: fontFamily.bold, fontSize: 16, marginBottom: 12 },
  fieldContainer: { marginBottom: 16 },
  fieldLabel: { fontFamily: fontFamily.medium, fontSize: 13, marginBottom: 6 },
  fieldInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: fontFamily.regular,
    fontSize: 15,
  },
  errorBox: { borderRadius: 10, padding: 12, marginBottom: 16 },
  errorText: { fontFamily: fontFamily.regular, fontSize: 13, textAlign: 'center' },
  mismatchText: { fontFamily: fontFamily.regular, fontSize: 13, color: '#EF4444', marginTop: -8, marginBottom: 12 },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  continueButton: {
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueButtonText: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
  },
});
