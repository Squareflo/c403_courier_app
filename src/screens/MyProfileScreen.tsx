import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Image,
  ActionSheetIOS,
  FlatList,
  TextInput,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Camera, ChevronDown, Search, X } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import FormField from '../components/ui/FormField';
import { fontFamily } from '../constants/typography';
import { supabase } from '../lib/supabase';

const PRIMARY_COLOR = '#ec2227';

// Country data with flags and dial codes
const COUNTRIES = [
  { code: 'CA', name: 'Canada', dialCode: '+1', flag: '🇨🇦' },
  { code: 'US', name: 'United States', dialCode: '+1', flag: '🇺🇸' },
  { code: 'GB', name: 'United Kingdom', dialCode: '+44', flag: '🇬🇧' },
  { code: 'AF', name: 'Afghanistan', dialCode: '+93', flag: '🇦🇫' },
  { code: 'AL', name: 'Albania', dialCode: '+355', flag: '🇦🇱' },
  { code: 'DZ', name: 'Algeria', dialCode: '+213', flag: '🇩🇿' },
  { code: 'AR', name: 'Argentina', dialCode: '+54', flag: '🇦🇷' },
  { code: 'AU', name: 'Australia', dialCode: '+61', flag: '🇦🇺' },
  { code: 'AT', name: 'Austria', dialCode: '+43', flag: '🇦🇹' },
  { code: 'BD', name: 'Bangladesh', dialCode: '+880', flag: '🇧🇩' },
  { code: 'BE', name: 'Belgium', dialCode: '+32', flag: '🇧🇪' },
  { code: 'BR', name: 'Brazil', dialCode: '+55', flag: '🇧🇷' },
  { code: 'CM', name: 'Cameroon', dialCode: '+237', flag: '🇨🇲' },
  { code: 'CL', name: 'Chile', dialCode: '+56', flag: '🇨🇱' },
  { code: 'CN', name: 'China', dialCode: '+86', flag: '🇨🇳' },
  { code: 'CO', name: 'Colombia', dialCode: '+57', flag: '🇨🇴' },
  { code: 'CD', name: 'Congo (DRC)', dialCode: '+243', flag: '🇨🇩' },
  { code: 'CR', name: 'Costa Rica', dialCode: '+506', flag: '🇨🇷' },
  { code: 'CU', name: 'Cuba', dialCode: '+53', flag: '🇨🇺' },
  { code: 'CZ', name: 'Czech Republic', dialCode: '+420', flag: '🇨🇿' },
  { code: 'DK', name: 'Denmark', dialCode: '+45', flag: '🇩🇰' },
  { code: 'DO', name: 'Dominican Republic', dialCode: '+1809', flag: '🇩🇴' },
  { code: 'EC', name: 'Ecuador', dialCode: '+593', flag: '🇪🇨' },
  { code: 'EG', name: 'Egypt', dialCode: '+20', flag: '🇪🇬' },
  { code: 'ET', name: 'Ethiopia', dialCode: '+251', flag: '🇪🇹' },
  { code: 'FI', name: 'Finland', dialCode: '+358', flag: '🇫🇮' },
  { code: 'FR', name: 'France', dialCode: '+33', flag: '🇫🇷' },
  { code: 'DE', name: 'Germany', dialCode: '+49', flag: '🇩🇪' },
  { code: 'GH', name: 'Ghana', dialCode: '+233', flag: '🇬🇭' },
  { code: 'GR', name: 'Greece', dialCode: '+30', flag: '🇬🇷' },
  { code: 'GT', name: 'Guatemala', dialCode: '+502', flag: '🇬🇹' },
  { code: 'HT', name: 'Haiti', dialCode: '+509', flag: '🇭🇹' },
  { code: 'HN', name: 'Honduras', dialCode: '+504', flag: '🇭🇳' },
  { code: 'HK', name: 'Hong Kong', dialCode: '+852', flag: '🇭🇰' },
  { code: 'IN', name: 'India', dialCode: '+91', flag: '🇮🇳' },
  { code: 'ID', name: 'Indonesia', dialCode: '+62', flag: '🇮🇩' },
  { code: 'IR', name: 'Iran', dialCode: '+98', flag: '🇮🇷' },
  { code: 'IQ', name: 'Iraq', dialCode: '+964', flag: '🇮🇶' },
  { code: 'IE', name: 'Ireland', dialCode: '+353', flag: '🇮🇪' },
  { code: 'IL', name: 'Israel', dialCode: '+972', flag: '🇮🇱' },
  { code: 'IT', name: 'Italy', dialCode: '+39', flag: '🇮🇹' },
  { code: 'JM', name: 'Jamaica', dialCode: '+1876', flag: '🇯🇲' },
  { code: 'JP', name: 'Japan', dialCode: '+81', flag: '🇯🇵' },
  { code: 'KE', name: 'Kenya', dialCode: '+254', flag: '🇰🇪' },
  { code: 'KR', name: 'South Korea', dialCode: '+82', flag: '🇰🇷' },
  { code: 'MX', name: 'Mexico', dialCode: '+52', flag: '🇲🇽' },
  { code: 'MA', name: 'Morocco', dialCode: '+212', flag: '🇲🇦' },
  { code: 'NL', name: 'Netherlands', dialCode: '+31', flag: '🇳🇱' },
  { code: 'NZ', name: 'New Zealand', dialCode: '+64', flag: '🇳🇿' },
  { code: 'NG', name: 'Nigeria', dialCode: '+234', flag: '🇳🇬' },
  { code: 'NO', name: 'Norway', dialCode: '+47', flag: '🇳🇴' },
  { code: 'PK', name: 'Pakistan', dialCode: '+92', flag: '🇵🇰' },
  { code: 'PE', name: 'Peru', dialCode: '+51', flag: '🇵🇪' },
  { code: 'PH', name: 'Philippines', dialCode: '+63', flag: '🇵🇭' },
  { code: 'PL', name: 'Poland', dialCode: '+48', flag: '🇵🇱' },
  { code: 'PT', name: 'Portugal', dialCode: '+351', flag: '🇵🇹' },
  { code: 'RO', name: 'Romania', dialCode: '+40', flag: '🇷🇴' },
  { code: 'RU', name: 'Russia', dialCode: '+7', flag: '🇷🇺' },
  { code: 'SA', name: 'Saudi Arabia', dialCode: '+966', flag: '🇸🇦' },
  { code: 'ZA', name: 'South Africa', dialCode: '+27', flag: '🇿🇦' },
  { code: 'ES', name: 'Spain', dialCode: '+34', flag: '🇪🇸' },
  { code: 'LK', name: 'Sri Lanka', dialCode: '+94', flag: '🇱🇰' },
  { code: 'SE', name: 'Sweden', dialCode: '+46', flag: '🇸🇪' },
  { code: 'CH', name: 'Switzerland', dialCode: '+41', flag: '🇨🇭' },
  { code: 'TH', name: 'Thailand', dialCode: '+66', flag: '🇹🇭' },
  { code: 'TR', name: 'Turkey', dialCode: '+90', flag: '🇹🇷' },
  { code: 'UA', name: 'Ukraine', dialCode: '+380', flag: '🇺🇦' },
  { code: 'AE', name: 'United Arab Emirates', dialCode: '+971', flag: '🇦🇪' },
  { code: 'VE', name: 'Venezuela', dialCode: '+58', flag: '🇻🇪' },
  { code: 'VN', name: 'Vietnam', dialCode: '+84', flag: '🇻🇳' },
  { code: 'ZM', name: 'Zambia', dialCode: '+260', flag: '🇿🇲' },
  { code: 'ZW', name: 'Zimbabwe', dialCode: '+263', flag: '🇿🇼' },
];

interface Country {
  code: string;
  name: string;
  dialCode: string;
  flag: string;
}

interface OriginalValues {
  firstName: string;
  lastName: string;
  email: string;
  countryCode: string;
  phoneNumberOnly: string;
  profilePictureUrl: string | null;
}

interface MyProfileScreenProps {
  onBack: () => void;
}

export function MyProfileScreen({ onBack }: MyProfileScreenProps) {
  const { colors, isDark } = useTheme();
  const { courier, refreshCourier, signOut } = useAuth();
  const insets = useSafeAreaInsets();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeletingImage, setIsDeletingImage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<Country>(COUNTRIES[0]);
  const [phoneNumberOnly, setPhoneNumberOnly] = useState('');

  // Password change
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Profile picture
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedImageBase64, setSelectedImageBase64] = useState<string | null>(null);
  const [imageDeleted, setImageDeleted] = useState(false);
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null);

  // Country picker
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');

  // Original values for change detection
  const [originalValues, setOriginalValues] = useState<OriginalValues | null>(null);

  const bg = colors.backgroundSecondary;
  const cardBg = colors.card;
  const textColor = colors.text;
  const textSecColor = colors.textTertiary;

  // ── Load profile ──────────────────────────────────────────────────

  const loadProfile = useCallback(async () => {
    if (!courier?.id) return;
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('customer')
        .select('id, first_name, last_name, email, phone_number, phone_number_only, dialing_code_only, profile_picture_url')
        .eq('id', courier.id)
        .single();

      if (fetchError || !data) {
        setError('Failed to load profile.');
        setIsLoading(false);
        return;
      }

      // Parse phone number
      let dialCode = '+1';
      let localPhone = '';

      if (data.phone_number_only && data.dialing_code_only) {
        dialCode = data.phone_number_only;
        localPhone = data.dialing_code_only;
      } else if (data.phone_number) {
        const spaceIdx = data.phone_number.indexOf(' ');
        if (spaceIdx > 0) {
          dialCode = data.phone_number.substring(0, spaceIdx);
          localPhone = data.phone_number.substring(spaceIdx + 1);
        } else {
          const phoneMatch = data.phone_number.match(/^(\+\d{1,3})(\d{10})$/);
          if (phoneMatch) {
            dialCode = phoneMatch[1];
            localPhone = phoneMatch[2];
          } else {
            localPhone = data.phone_number;
          }
        }
      }

      const country = COUNTRIES.find(c => c.dialCode === dialCode) || COUNTRIES[0];

      setFirstName(data.first_name || '');
      setLastName(data.last_name || '');
      setEmail(data.email || '');
      setSelectedCountry(country);
      setPhoneNumberOnly(localPhone);
      setExistingImageUrl(data.profile_picture_url || null);
      setNewPassword('');
      setConfirmPassword('');

      setOriginalValues({
        firstName: data.first_name || '',
        lastName: data.last_name || '',
        email: data.email || '',
        countryCode: country.code,
        phoneNumberOnly: localPhone,
        profilePictureUrl: data.profile_picture_url || null,
      });
    } catch (err: any) {
      setError(err.message || 'Failed to load profile.');
    } finally {
      setIsLoading(false);
    }
  }, [courier?.id]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // ── Change detection ──────────────────────────────────────────────

  const hasChanges = useMemo(() => {
    if (!originalValues) return false;
    if (selectedImage) return true;
    if (imageDeleted) return true;
    if (newPassword.length > 0) return true;
    return (
      firstName !== originalValues.firstName ||
      lastName !== originalValues.lastName ||
      email !== originalValues.email ||
      selectedCountry.code !== originalValues.countryCode ||
      phoneNumberOnly !== originalValues.phoneNumberOnly
    );
  }, [originalValues, firstName, lastName, email, selectedCountry, phoneNumberOnly, selectedImage, imageDeleted, newPassword]);

  // ── Country picker filter ─────────────────────────────────────────

  const filteredCountries = useMemo(() => {
    if (!countrySearch.trim()) return COUNTRIES;
    const search = countrySearch.toLowerCase();
    return COUNTRIES.filter(
      c => c.name.toLowerCase().includes(search) || c.dialCode.includes(search)
    );
  }, [countrySearch]);

  // ── Image handling ────────────────────────────────────────────────

  const displayImage = selectedImage || (imageDeleted ? null : existingImageUrl);
  const showDeleteButton = existingImageUrl && !imageDeleted && !selectedImage;

  const handleImagePick = async () => {
    if (existingImageUrl && !imageDeleted) {
      Alert.alert('Delete Current Photo First', 'Please tap the X button to delete your current photo before uploading a new one.');
      return;
    }

    const pickFromLibrary = async () => {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please allow access to your photo library.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        base64: true,
      });
      if (!result.canceled && result.assets[0]) {
        setSelectedImage(result.assets[0].uri);
        if (result.assets[0].base64) setSelectedImageBase64(result.assets[0].base64);
      }
    };

    const takePhoto = async () => {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please allow camera access.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        base64: true,
      });
      if (!result.canceled && result.assets[0]) {
        setSelectedImage(result.assets[0].uri);
        if (result.assets[0].base64) setSelectedImageBase64(result.assets[0].base64);
      }
    };

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Cancel', 'Take Photo', 'Choose from Photos'], cancelButtonIndex: 0, userInterfaceStyle: isDark ? 'dark' : 'light' },
        async (idx) => {
          if (idx === 1) await takePhoto();
          if (idx === 2) await pickFromLibrary();
        }
      );
    } else {
      Alert.alert('Add Profile Photo', 'Select a source', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Take Photo', onPress: takePhoto },
        { text: 'Choose from Photos', onPress: pickFromLibrary },
      ]);
    }
  };

  const handleDeleteProfilePicture = async () => {
    if (!existingImageUrl) return;
    Alert.alert('Delete Profile Picture', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          setIsDeletingImage(true);
          try {
            const match = existingImageUrl.match(/\/v\d+\/(.+)\.[a-z]+$/i);
            if (match) {
              await supabase.functions.invoke('delete-cloudinary-asset', { body: { public_id: match[1] } });
            }
            await supabase.from('customer').update({ profile_picture_url: null }).eq('id', courier!.id);
            setExistingImageUrl(null);
            setImageDeleted(true);
            setSuccess('Profile picture deleted.');
            setTimeout(() => setSuccess(null), 2000);
          } catch (err: any) {
            setError(err.message || 'Failed to delete.');
          } finally {
            setIsDeletingImage(false);
          }
        },
      },
    ]);
  };

  // ── Save ──────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!courier?.id) return;
    setError(null);
    setSuccess(null);
    setIsSaving(true);

    try {
      // Password validation
      if (newPassword.length > 0) {
        if (newPassword.length < 6) {
          setError('Password must be at least 6 characters.');
          setIsSaving(false);
          return;
        }
        if (newPassword !== confirmPassword) {
          setError('Passwords do not match.');
          setIsSaving(false);
          return;
        }
      }

      let newProfilePictureUrl = imageDeleted ? null : existingImageUrl;

      // Upload new image
      if (selectedImage && selectedImageBase64) {
        setIsUploading(true);
        try {
          const base64DataUri = selectedImageBase64.startsWith('data:')
            ? selectedImageBase64
            : `data:image/jpeg;base64,${selectedImageBase64}`;
          const { data, error: uploadErr } = await supabase.functions.invoke('upload-to-cloudinary', {
            body: { file_base64: base64DataUri, user_id: courier.id, folder: 'profile-pictures' },
          });
          if (uploadErr) throw uploadErr;
          if (data?.file_url) newProfilePictureUrl = data.file_url;
        } catch (uploadErr) {
          console.error('Image upload failed:', uploadErr);
        }
        setIsUploading(false);
      }

      const fullPhoneNumber = phoneNumberOnly ? `${selectedCountry.dialCode} ${phoneNumberOnly}` : '';

      const { error: updateError } = await supabase
        .from('customer')
        .update({
          first_name: firstName,
          last_name: lastName,
          email: email,
          phone_number: fullPhoneNumber || null,
          profile_picture_url: newProfilePictureUrl,
        })
        .eq('id', courier.id);

      if (updateError) throw updateError;

      // Update password if provided
      if (newPassword.length > 0) {
        const { error: pwError } = await supabase.auth.updateUser({ password: newPassword });
        if (pwError) throw pwError;
      }

      setSuccess('Profile updated!');
      setSelectedImage(null);
      setSelectedImageBase64(null);
      setImageDeleted(false);
      setNewPassword('');
      setConfirmPassword('');
      await refreshCourier();
      await loadProfile();
      setTimeout(() => setSuccess(null), 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to update profile.');
    } finally {
      setIsSaving(false);
    }
  };

  // ── Sign out ──────────────────────────────────────────────────────

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => signOut() },
    ]);
  };

  // ── Initials ──────────────────────────────────────────────────────

  const getInitials = () => {
    const first = firstName?.charAt(0)?.toUpperCase() || '';
    const last = lastName?.charAt(0)?.toUpperCase() || '';
    return `${first}${last}` || 'C';
  };

  // ── Render ────────────────────────────────────────────────────────

  return (
    <View style={[styles.screen, { backgroundColor: bg }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={styles.headerBtn} onPress={onBack} activeOpacity={0.7}>
          <ArrowLeft size={24} color={textColor} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: textColor }]}>My Profile</Text>
        <View style={styles.headerBtn} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={PRIMARY_COLOR} />
              <Text style={[styles.loadingText, { color: textSecColor }]}>Loading profile...</Text>
            </View>
          ) : (
            <>
              {error && (
                <View style={styles.alertError}>
                  <Text style={styles.alertErrorText}>{error}</Text>
                </View>
              )}
              {success && (
                <View style={styles.alertSuccess}>
                  <Text style={styles.alertSuccessText}>{success}</Text>
                </View>
              )}

              {/* Profile Picture */}
              <View style={styles.profilePictureContainer}>
                <View style={styles.profilePictureWrapper}>
                  <TouchableOpacity onPress={handleImagePick} activeOpacity={0.8} disabled={isDeletingImage}>
                    {isDeletingImage ? (
                      <View style={[styles.profilePicture, styles.profilePicturePlaceholder, { backgroundColor: isDark ? colors.surfaceSecondary : '#e5e5e5' }]}>
                        <ActivityIndicator size="small" color={PRIMARY_COLOR} />
                      </View>
                    ) : displayImage ? (
                      <Image source={{ uri: displayImage }} style={styles.profilePicture} resizeMode="cover" />
                    ) : (
                      <View style={[styles.profilePicture, styles.profilePicturePlaceholder, { backgroundColor: isDark ? colors.surfaceSecondary : '#e5e5e5' }]}>
                        <Text style={[styles.initialsText, { color: textColor }]}>{getInitials()}</Text>
                      </View>
                    )}
                  </TouchableOpacity>

                  {showDeleteButton && (
                    <TouchableOpacity style={styles.deleteImageButton} onPress={handleDeleteProfilePicture} activeOpacity={0.8}>
                      <X size={14} color="#fff" />
                    </TouchableOpacity>
                  )}

                  {!displayImage && (
                    <View style={styles.cameraOverlay}>
                      <Camera size={20} color="#fff" />
                    </View>
                  )}
                </View>
                <Text style={[styles.tapText, { color: textSecColor }]}>
                  {displayImage ? (showDeleteButton ? 'Tap X to remove photo' : 'Tap to change photo') : 'Tap to add photo'}
                </Text>
                {selectedImage && (
                  <Text style={[styles.tapText, { color: textSecColor, marginTop: 2 }]}>
                    New photo selected. Tap "Update" to save.
                  </Text>
                )}
              </View>

              {/* Form */}
              <View style={styles.formRow}>
                <View style={{ flex: 1 }}>
                  <FormField label="First Name" value={firstName} onChangeText={setFirstName} placeholder="First Name" autoCapitalize="words" />
                </View>
                <View style={{ flex: 1 }}>
                  <FormField label="Last Name" value={lastName} onChangeText={setLastName} placeholder="Last Name" autoCapitalize="words" />
                </View>
              </View>

              <FormField label="Email" value={email} onChangeText={setEmail} placeholder="Email Address" keyboardType="email-address" autoCapitalize="none" />

              {/* Phone */}
              <View style={styles.phoneContainer}>
                <Text style={[styles.fieldLabel, { color: textSecColor }]}>Phone Number</Text>
                <View style={styles.phoneRow}>
                  <TouchableOpacity
                    style={[styles.countryPickerButton, { backgroundColor: cardBg, borderColor: colors.border }]}
                    onPress={() => setShowCountryPicker(true)}
                    activeOpacity={0.7}
                  >
                    <Text style={{ fontSize: 20 }}>{selectedCountry.flag}</Text>
                    <Text style={[styles.countryDialCode, { color: textColor }]}>{selectedCountry.dialCode}</Text>
                    <ChevronDown size={16} color={textSecColor} />
                  </TouchableOpacity>
                  <View style={{ flex: 1, marginBottom: -20 }}>
                    <FormField value={phoneNumberOnly} onChangeText={setPhoneNumberOnly} placeholder="Phone Number" keyboardType="phone-pad" />
                  </View>
                </View>
              </View>

              {/* Password Change */}
              <View style={[styles.divider, { backgroundColor: isDark ? '#333' : '#DDD' }]} />
              <Text style={[styles.sectionTitle, { color: textColor }]}>Change Password</Text>
              <Text style={[styles.sectionSubtitle, { color: textSecColor }]}>Leave blank to keep current password</Text>

              <FormField label="New Password" value={newPassword} onChangeText={setNewPassword} placeholder="New Password" secureTextEntry />
              <FormField label="Confirm Password" value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Confirm Password" secureTextEntry />

              {/* Update Button or Sign Out */}
              <View style={[styles.divider, { backgroundColor: isDark ? '#333' : '#DDD' }]} />
              {hasChanges ? (
                <TouchableOpacity
                  style={[
                    styles.inlineUpdateButton,
                    {
                      backgroundColor: isDark ? '#FFF' : '#000',
                      opacity: isSaving ? 0.6 : 1,
                    },
                  ]}
                  onPress={handleSave}
                  disabled={isSaving}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.inlineUpdateButtonText, { color: isDark ? '#000' : '#FFF' }]}>
                    {isSaving ? (isUploading ? 'Uploading...' : 'Updating...') : 'Update'}
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut} activeOpacity={0.7}>
                  <Text style={styles.signOutText}>Sign Out</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Country Picker Modal */}
      <Modal visible={showCountryPicker} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { setShowCountryPicker(false); setCountrySearch(''); }}>
        <View style={[styles.modalContainer, { backgroundColor: bg }]}>
          <View style={[styles.modalHeader, { backgroundColor: cardBg, borderBottomColor: colors.border }]}>
            <View style={{ width: 40 }} />
            <Text style={[styles.headerTitle, { color: textColor }]}>Select Country</Text>
            <TouchableOpacity onPress={() => { setShowCountryPicker(false); setCountrySearch(''); }} style={{ padding: 8 }}>
              <X size={24} color={textColor} />
            </TouchableOpacity>
          </View>
          <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 }}>
            <View style={[styles.searchWrapper, { backgroundColor: cardBg, borderColor: colors.border }]}>
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
            keyExtractor={(item) => item.code}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.countryItem, { backgroundColor: cardBg, borderColor: colors.border }]}
                onPress={() => { setSelectedCountry(item); setShowCountryPicker(false); setCountrySearch(''); }}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 24, marginRight: 12 }}>{item.flag}</Text>
                <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={[styles.countryName, { color: textColor }]}>{item.name}</Text>
                  <Text style={[styles.countryDialCodeSmall, { color: textSecColor }]}>{item.dialCode}</Text>
                </View>
              </TouchableOpacity>
            )}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: fontFamily.bold, fontSize: 18, textAlign: 'center' },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 40 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 80 },
  loadingText: { fontFamily: fontFamily.regular, fontSize: 14, marginTop: 12 },

  // Alerts
  alertError: { backgroundColor: '#fee2e2', borderWidth: 1, borderColor: '#fecaca', borderRadius: 8, padding: 12, marginBottom: 12 },
  alertErrorText: { fontFamily: fontFamily.regular, fontSize: 14, color: '#dc2626' },
  alertSuccess: { backgroundColor: '#dcfce7', borderWidth: 1, borderColor: '#bbf7d0', borderRadius: 8, padding: 12, marginBottom: 12 },
  alertSuccessText: { fontFamily: fontFamily.regular, fontSize: 14, color: '#16a34a' },

  // Profile Picture
  profilePictureContainer: { alignItems: 'center', marginBottom: 24, marginTop: 8 },
  profilePictureWrapper: { position: 'relative' },
  profilePicture: { width: 120, height: 120, borderRadius: 60, borderWidth: 3, borderColor: '#fff' },
  profilePicturePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  initialsText: { fontFamily: fontFamily.bold, fontSize: 40 },
  deleteImageButton: { position: 'absolute', top: 0, right: 0, backgroundColor: PRIMARY_COLOR, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },
  cameraOverlay: { position: 'absolute', bottom: 4, right: 4, backgroundColor: PRIMARY_COLOR, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },
  tapText: { fontFamily: fontFamily.regular, fontSize: 12, marginTop: 8, textAlign: 'center' },

  // Form
  formRow: { flexDirection: 'row', gap: 12 },
  phoneContainer: { marginBottom: 20 },
  fieldLabel: { fontFamily: fontFamily.semiBold, fontSize: 14, marginBottom: 8 },
  phoneRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  countryPickerButton: { flexDirection: 'row', alignItems: 'center', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 12, gap: 4, minWidth: 95, borderWidth: 1 },
  countryDialCode: { fontFamily: fontFamily.regular, fontSize: 16 },

  // Sections
  divider: { height: 1, marginVertical: 20 },
  sectionTitle: { fontFamily: fontFamily.bold, fontSize: 16, marginBottom: 4 },
  sectionSubtitle: { fontFamily: fontFamily.regular, fontSize: 12, marginBottom: 16 },

  // Sign Out
  signOutButton: { paddingVertical: 14, alignItems: 'center' },
  signOutText: { fontFamily: fontFamily.bold, fontSize: 16, color: PRIMARY_COLOR },

  // Inline Update Button
  inlineUpdateButton: { borderRadius: 12, paddingVertical: 16, alignItems: 'center' as const, marginBottom: 8 },
  inlineUpdateButtonText: { fontFamily: fontFamily.bold, fontSize: 16 },

  // Country Picker Modal
  modalContainer: { flex: 1 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 16 : 16, paddingBottom: 16, borderBottomWidth: 1 },
  searchWrapper: { flexDirection: 'row', alignItems: 'center', borderRadius: 10, paddingHorizontal: 18, borderWidth: 1 },
  searchInput: { flex: 1, fontFamily: fontFamily.regular, fontSize: 16, paddingVertical: 14 },
  countryItem: { flexDirection: 'row', alignItems: 'center', borderRadius: 10, paddingVertical: 14, paddingHorizontal: 16, marginBottom: 8, borderWidth: 1 },
  countryName: { fontFamily: fontFamily.regular, fontSize: 16, flex: 1 },
  countryDialCodeSmall: { fontFamily: fontFamily.regular, fontSize: 15, marginLeft: 12 },
});
