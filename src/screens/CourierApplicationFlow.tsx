import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Image,
  ImageBackground,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Camera, ChevronDown, MapPin, Search, X } from 'lucide-react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Button } from '../components/ui';
import FormField from '../components/ui/FormField';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { fontFamily } from '../constants/typography';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DashboardScreen } from './DashboardScreen';
import { MessagesScreen } from './MessagesScreen';
import { MyProfileScreen } from './MyProfileScreen';
import { BottomNav, type TabId } from '../components/BottomNav';

// ── Constants ────────────────────────────────────────────────────────────────

const SUPABASE_URL = 'https://rddssfhltufrwlsmbtps.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJkZHNzZmhsdHVmcndsc21idHBzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA0NjExNTAsImV4cCI6MjA3NjAzNzE1MH0.vNkjdUoYthWoaphE_sp1TsNx7U2A84W515iXVkuU01k';
const SPLASH_BG = 'https://res.cloudinary.com/chowlocal/image/upload/v1772499778/background_ejkzfw.png';
const SPLASH_ICON = 'https://res.cloudinary.com/chowlocal/image/upload/v1772028968/Untitled_design_vmrzsj.png';
const BUTTON_COLOR = '#ffd21f';
const CHOWLOCAL_LOGO = 'https://res.cloudinary.com/chowlocal/image/upload/v1758731159/logo_dmw37v.png';

// Province/state abbreviation to full name
const STATE_NAMES: Record<string, string> = {
  AB: 'Alberta', BC: 'British Columbia', MB: 'Manitoba', NB: 'New Brunswick',
  NL: 'Newfoundland and Labrador', NS: 'Nova Scotia', NT: 'Northwest Territories',
  NU: 'Nunavut', ON: 'Ontario', PE: 'Prince Edward Island', QC: 'Quebec',
  SK: 'Saskatchewan', YT: 'Yukon',
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
  MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
  OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  DC: 'District of Columbia',
};

type Screen = 'splash' | 'form' | 'success' | 'pending-dashboard';

interface CityPrediction {
  place_id: string;
  description: string;
  structured_formatting: {
    main_text: string;
    secondary_text: string;
  };
}

interface CourierApplicationFlowProps {
  onBack: () => void;
}

// ── Component ────────────────────────────────────────────────────────────────

export function CourierApplicationFlow({ onBack }: CourierApplicationFlowProps) {
  const { colors, isDark } = useTheme();
  const { courier } = useAuth();
  const insets = useSafeAreaInsets();

  const [screen, setScreen] = useState<Screen>('splash');
  const [checkingApplication, setCheckingApplication] = useState(true);

  // Application data for pending dashboard
  const [applicationData, setApplicationData] = useState<any>(null);

  // Check for existing application on mount
  useEffect(() => {
    checkExistingApplication();
  }, []);

  const checkExistingApplication = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setCheckingApplication(false); return; }

      const { data, error } = await supabase
        .from('courier_applications')
        .select('*')
        .eq('customer_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data && !error) {
        setApplicationData(data);
        setScreen('pending-dashboard');
      }
    } catch (err) {
      console.log('Check existing application error:', err);
    } finally {
      setCheckingApplication(false);
    }
  };

  // Form fields
  const [profilePictureUrl, setProfilePictureUrl] = useState<string | null>(courier?.profile_picture_url || null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Community / city search
  const [cityInput, setCityInput] = useState('');
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [predictions, setPredictions] = useState<CityPrediction[]>([]);
  const [isSearchingCity, setIsSearchingCity] = useState(false);
  const [showPredictions, setShowPredictions] = useState(false);

  // Yes/No questions
  const [hasDeliveryExperience, setHasDeliveryExperience] = useState<boolean | null>(null);
  const [hasDriversLicense, setHasDriversLicense] = useState<boolean | null>(null);
  const [hasReliableVehicle, setHasReliableVehicle] = useState<boolean | null>(null);
  const [hasCriminalRecord, setHasCriminalRecord] = useState<boolean | null>(null);
  const [willingToCriminalCheck, setWillingToCriminalCheck] = useState<boolean | null>(null);
  const [legallyAllowedToWork, setLegallyAllowedToWork] = useState<boolean | null>(null);

  // How did you hear
  const [howDidYouHear, setHowDidYouHear] = useState('');

  // State/country from selected city
  const [selectedState, setSelectedState] = useState('');
  const [selectedCountry, setSelectedCountry] = useState('');

  // Shared
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const isFormComplete = useMemo(() => {
    return (
      !!selectedCity &&
      hasDeliveryExperience !== null &&
      hasDriversLicense !== null &&
      hasReliableVehicle !== null &&
      hasCriminalRecord !== null &&
      willingToCriminalCheck !== null &&
      legallyAllowedToWork !== null &&
      !!howDidYouHear.trim()
    );
  }, [selectedCity, hasDeliveryExperience, hasDriversLicense, hasReliableVehicle, hasCriminalRecord, willingToCriminalCheck, legallyAllowedToWork, howDidYouHear]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setError('');
    await autoDetectCity();
    setRefreshing(false);
  }, []);

  // ── Auto-detect location ──────────────────────────────────────────

  useEffect(() => {
    if (screen === 'form' && !selectedCity && !cityInput) {
      autoDetectCity();
    }
  }, [screen]);

  const autoDetectCity = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const [geo] = await Location.reverseGeocodeAsync({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });

      if (geo) {
        const parts = [geo.city, geo.region, geo.country].filter(Boolean);
        const cityStr = parts.join(', ');
        if (cityStr) {
          setCityInput(cityStr);
          setSelectedCity(cityStr);
          if (geo.region) setSelectedState(STATE_NAMES[geo.region] || geo.region);
          if (geo.country) setSelectedCountry(geo.country);
        }
      }
    } catch (err) {
      console.log('Auto-detect city error:', err);
    }
  };

  // ── City search ───────────────────────────────────────────────────

  const searchCities = useCallback(async (query: string) => {
    if (query.length < 2) { setPredictions([]); return; }
    setIsSearchingCity(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || SUPABASE_ANON_KEY;
      const url = `${SUPABASE_URL}/functions/v1/google-places-autocomplete?input=${encodeURIComponent(query)}&components=country:ca|country:us&types=(cities)`;
      console.log('[CourierApp] City search:', query);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'apikey': SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
      });
      
      const data = await response.json();
      console.log('[CourierApp] City results:', data.predictions?.length || 0, data.status || data.error);
      
      if (data.predictions && data.predictions.length > 0) {
        setPredictions(data.predictions);
        setShowPredictions(true);
      } else {
        setPredictions([]);
        setShowPredictions(false);
      }
    } catch (err) {
      console.error('[CourierApp] City search error:', err);
    } finally {
      setIsSearchingCity(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      if (cityInput && !selectedCity) searchCities(cityInput);
      else if (!cityInput) setPredictions([]);
    }, 300);
    return () => clearTimeout(t);
  }, [cityInput, selectedCity, searchCities]);

  const handleSelectCity = (prediction: CityPrediction) => {
    const desc = prediction.description;
    setCityInput(desc);
    setSelectedCity(desc);
    setPredictions([]);
    setShowPredictions(false);

    // Parse state/country from description (e.g. "Regina, SK, Canada")
    const parts = desc.split(', ');
    if (parts.length >= 3) {
      const stateAbbr = parts[1].trim();
      setSelectedState(STATE_NAMES[stateAbbr] || stateAbbr);
      setSelectedCountry(parts[2]);
    } else if (parts.length === 2) {
      const stateAbbr = parts[1].trim();
      setSelectedState(STATE_NAMES[stateAbbr] || stateAbbr);
      setSelectedCountry('');
    }
  };

  // ── Profile picture ───────────────────────────────────────────────

  const pickImage = async () => {
    const options = ['Take Photo', 'Choose from Library', 'Cancel'];
    if (Platform.OS === 'ios') {
      const { ActionSheetIOS } = require('react-native');
      ActionSheetIOS.showActionSheetWithOptions({ options, cancelButtonIndex: 2 }, async (idx: number) => {
        if (idx === 0) await launchCamera();
        else if (idx === 1) await launchLibrary();
      });
    } else {
      Alert.alert('Profile Photo', '', [
        { text: 'Take Photo', onPress: launchCamera },
        { text: 'Choose from Library', onPress: launchLibrary },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  const launchCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission needed', 'Camera access is required.'); return; }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: 'images', allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (!result.canceled && result.assets[0]) setSelectedImage(result.assets[0].uri);
  };

  const launchLibrary = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission needed', 'Photo library access is required.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (!result.canceled && result.assets[0]) setSelectedImage(result.assets[0].uri);
  };

  const uploadImage = async (uri: string): Promise<string | null> => {
    setIsUploading(true);
    try {
      // Read the image file and convert to base64
      const response = await fetch(uri);
      const blob = await response.blob();
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || SUPABASE_ANON_KEY;

      const res = await fetch(`${SUPABASE_URL}/functions/v1/upload-to-cloudinary`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'apikey': SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          file_base64: base64,
          folder: 'courier-applications',
        }),
      });
      const json = await res.json();
      console.log('[CourierApp] Upload result:', json.secure_url || json.error);
      if (json.secure_url) return json.secure_url;
      if (json.file_url) return json.file_url;
      return null;
    } catch (err) {
      console.error('[CourierApp] Upload error:', err);
      return null;
    } finally { setIsUploading(false); }
  };

  // ── Submit ────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    // Validate
    if (!selectedCity) { setError('Please select your community/city.'); return; }
    if (hasDeliveryExperience === null) { setError('Please answer: Do you have delivery experience?'); return; }
    if (hasDriversLicense === null) { setError('Please answer: Do you have a valid driver\'s license?'); return; }
    if (hasReliableVehicle === null) { setError('Please answer: Do you have a reliable vehicle?'); return; }
    if (hasCriminalRecord === null) { setError('Please answer: Do you have a criminal record?'); return; }
    if (willingToCriminalCheck === null) { setError('Please answer: Are you willing to pay for a criminal record check?'); return; }
    if (legallyAllowedToWork === null) { setError('Please answer: Are you legally allowed to work?'); return; }

    setIsSubmitting(true);
    setError('');

    try {
      let finalPicUrl: string | null = null;
      if (selectedImage) {
        const uploaded = await uploadImage(selectedImage);
        if (uploaded) finalPicUrl = uploaded;
      }

      const { data: { user } } = await supabase.auth.getUser();

      // Update customer profile picture if they uploaded one
      if (finalPicUrl && user) {
        await supabase.from('customer').update({ profile_picture_url: finalPicUrl }).eq('id', user.id);
      }

      const { error: insertError } = await supabase.from('courier_applications').insert({
        customer_id: user?.id || null,
        first_name: courier?.first_name || '',
        last_name: courier?.last_name || '',
        email: courier?.email || '',
        phone_number: courier?.phone_number || '',
        community: selectedCity,
        has_delivery_experience: hasDeliveryExperience,
        has_valid_drivers_license: hasDriversLicense,
        has_reliable_vehicle: hasReliableVehicle,
        has_criminal_record: hasCriminalRecord,
        willing_to_pay_criminal_check: willingToCriminalCheck,
        legally_allowed_to_work: legallyAllowedToWork,
        how_did_you_hear: howDidYouHear || null,
      });

      if (insertError) {
        console.error('Insert error:', JSON.stringify(insertError));
        setError(`Failed to submit: ${insertError.message || insertError.code || 'Unknown error'}`);
        return;
      }

      // Fetch the newly created application
      if (user) {
        // Add 'courier-applicant' role to the user
        const { data: currentUser } = await supabase
          .from('customer')
          .select('roles')
          .eq('id', user.id)
          .single();
        const currentRoles = Array.isArray(currentUser?.roles) ? currentUser.roles : [];
        if (!currentRoles.includes('courier-applicant')) {
          await supabase
            .from('customer')
            .update({ roles: [...currentRoles, 'courier-applicant'] })
            .eq('id', user.id);
        }

        const { data: appData } = await supabase
          .from('courier_applications')
          .select('*')
          .eq('customer_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (appData) setApplicationData(appData);
      }

      setScreen('success');
    } catch (err: any) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Dynamic colors ────────────────────────────────────────────────

  const textColor = isDark ? colors.text : '#000';
  const textSecColor = isDark ? colors.textSecondary : '#555';
  const cardBg = isDark ? colors.card : '#fff';
  const bg = isDark ? colors.background : '#F5F5F5';

  // ── Yes/No pill ───────────────────────────────────────────────────

  const YesNo = ({ label, value, onChange }: { label: string; value: boolean | null; onChange: (v: boolean) => void }) => (
    <View style={styles.yesNoRow}>
      <Text style={[styles.yesNoLabel, { color: textColor }]}>{label}</Text>
      <View style={styles.yesNoBtns}>
        <TouchableOpacity
          style={[styles.yesNoBtn, value === true && { backgroundColor: isDark ? '#FFF' : '#000' }]}
          onPress={() => onChange(true)}
          activeOpacity={0.7}
        >
          <Text style={[styles.yesNoBtnText, { color: value === true ? (isDark ? '#000' : '#FFF') : textSecColor }]}>Yes</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.yesNoBtn, value === false && { backgroundColor: isDark ? '#FFF' : '#000' }]}
          onPress={() => onChange(false)}
          activeOpacity={0.7}
        >
          <Text style={[styles.yesNoBtnText, { color: value === false ? (isDark ? '#000' : '#FFF') : textSecColor }]}>No</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // ── Render: Loading (checking for existing application) ────────────
  if (checkingApplication) {
    return (
      <View style={[styles.splashContainer, { backgroundColor: bg }]}>
        <ActivityIndicator size="large" color={isDark ? '#FFF' : '#000'} />
      </View>
    );
  }

  // ── Render: Splash ────────────────────────────────────────────────

  if (screen === 'splash') {
    return (
      <ImageBackground source={{ uri: SPLASH_BG }} style={styles.splashContainer} resizeMode="cover">
        <SafeAreaView style={styles.splashSafe}>
          <View style={styles.splashContent}>
            <Image source={{ uri: SPLASH_ICON }} style={styles.splashIcon} resizeMode="contain" />
            <Text style={styles.splashTitle}>Drive For Us</Text>
            <Text style={styles.splashSubtitle}>Reliable, couriers Wanted In Various Cities</Text>
            <TouchableOpacity style={[styles.splashButton, { backgroundColor: BUTTON_COLOR }]} onPress={() => setScreen('form')} activeOpacity={0.8}>
              <Text style={styles.splashButtonText}>SIGN ME UP</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </ImageBackground>
    );
  }

  // ── Render: Success ───────────────────────────────────────────────

  if (screen === 'success') {
    return (
      <View style={[styles.successContainer, { backgroundColor: bg }]}>
        <SafeAreaView style={styles.successSafe}>
          <View style={styles.successContent}>
            <Ionicons name="checkmark-circle" size={100} color="#22C55E" />
            <Text style={[styles.successTitle, { color: textColor }]}>Application Received!</Text>
            <Text style={[styles.successDesc, { color: textSecColor }]}>
              Thank you for applying to be a courier. Your application has been received and will be reviewed by a member of our team. We'll be in touch soon!
            </Text>
            <Button title="Exit" onPress={() => setScreen('pending-dashboard')} variant="dark" size="large" style={{ marginTop: 32, width: '100%' }} />
          </View>
        </SafeAreaView>
      </View>
    );
  }

  // ── Render: Pending Dashboard (uses real DashboardScreen + BottomNav) ────

  if (screen === 'pending-dashboard') {
    return (
      <PendingDashboardLayout
        applicationData={applicationData}
        onSignOut={async () => { await supabase.auth.signOut(); onBack(); }}
      />
    );
  }

  // ── Render: Form ──────────────────────────────────────────────────

  const displayImage = selectedImage || profilePictureUrl;
  const initials = `${(courier?.first_name || '')[0] || ''}${(courier?.last_name || '')[0] || ''}`.toUpperCase();

  return (
    <View style={[styles.formOuter, { backgroundColor: bg }]}>
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {/* Header */}
          <View style={styles.formHeader}>
            <TouchableOpacity onPress={() => setScreen('splash')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <ArrowLeft size={24} color={textColor} />
            </TouchableOpacity>
            <Text style={[styles.formHeaderTitle, { color: textColor }]}>Courier Application</Text>
            <View style={{ width: 24 }} />
          </View>

          <ScrollView contentContainerStyle={styles.formScroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={textSecColor} />}>
            {/* Profile Picture */}
            <View style={styles.avatarSection}>
              <TouchableOpacity style={styles.avatarWrapper} onPress={pickImage} activeOpacity={0.8}>
                {displayImage ? (
                  <Image source={{ uri: displayImage }} style={styles.avatarImg} />
                ) : (
                  <View style={[styles.avatarPlaceholder, { backgroundColor: isDark ? '#333' : '#DDD' }]}>
                    <View style={styles.cameraOverlay}><Camera size={32} color="#fff" /></View>
                  </View>
                )}
              </TouchableOpacity>
              <Text style={[styles.avatarHint, { color: textSecColor }]}>Tap to add a profile photo</Text>
            </View>

            {/* Community / City Search */}
            <View style={{ marginBottom: 24 }}>
              <Text style={[styles.sectionLabel, { color: textSecColor }]}>Community</Text>
              <View style={{ position: 'relative' }}>
                <TextInput
                  style={[styles.cityInput, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: textColor }]}
                  placeholder="Search for your city..."
                  placeholderTextColor={colors.inputPlaceholder}
                  value={cityInput}
                  onChangeText={t => { setCityInput(t); if (selectedCity) { setSelectedCity(null); setSelectedState(''); setSelectedCountry(''); } }}
                  autoCapitalize="words"
                />
                {selectedCity ? (
                  <TouchableOpacity style={styles.cityIconBtn} onPress={() => { setCityInput(''); setSelectedCity(null); setSelectedState(''); setSelectedCountry(''); setPredictions([]); setShowPredictions(false); }}>
                    <X size={20} color={textSecColor} />
                  </TouchableOpacity>
                ) : isSearchingCity ? (
                  <View style={styles.cityIconBtn}><ActivityIndicator size="small" color={textSecColor} /></View>
                ) : (
                  <View style={styles.cityIconBtn}><Search size={20} color={textSecColor} /></View>
                )}
              </View>

              {showPredictions && predictions.length > 0 && !selectedCity && (
                <View style={[styles.predictionsBox, { backgroundColor: cardBg, borderColor: colors.inputBorder }]}>
                  {predictions.map(p => (
                    <TouchableOpacity key={p.place_id} style={[styles.predictionItem, { borderBottomColor: isDark ? colors.border : '#f0f0f0' }]} onPress={() => handleSelectCity(p)}>
                      <MapPin size={18} color={textSecColor} style={{ marginRight: 12 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.predMainText, { color: textColor }]}>{p.structured_formatting.main_text}</Text>
                        <Text style={[styles.predSecText, { color: textSecColor }]} numberOfLines={1}>{p.structured_formatting.secondary_text}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            {/* Yes/No Questions */}
            <YesNo label="Do you have experience doing deliveries?" value={hasDeliveryExperience} onChange={setHasDeliveryExperience} />
            <YesNo label="Do you have a valid driver's license?" value={hasDriversLicense} onChange={setHasDriversLicense} />
            <YesNo label="Do you have a reliable vehicle?" value={hasReliableVehicle} onChange={setHasReliableVehicle} />
            <YesNo label="Do you have a criminal record?" value={hasCriminalRecord} onChange={setHasCriminalRecord} />
            <YesNo label="Are you willing to pay for a criminal record check?" value={willingToCriminalCheck} onChange={setWillingToCriminalCheck} />
            <YesNo
              label={`Are you legally allowed to work in ${selectedState || '...'}${selectedCountry ? `, ${selectedCountry}` : ''}?`}
              value={legallyAllowedToWork}
              onChange={setLegallyAllowedToWork}
            />

            {/* How did you hear */}
            <FormField label="How did you hear about us?" value={howDidYouHear} onChangeText={setHowDidYouHear} placeholder="e.g. Facebook, friend, etc." autoCapitalize="sentences" />

            {/* Error */}
            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            {/* Submit - only when all fields complete */}
            {isFormComplete && (
              <Button
                title={isSubmitting ? (isUploading ? 'Uploading Photo...' : 'Submitting...') : 'Submit Application'}
                onPress={handleSubmit}
                variant="dark"
                size="large"
                disabled={isSubmitting}
                style={{ marginTop: 8, marginBottom: 40 }}
              />
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

// ── Pending Dashboard Layout ─────────────────────────────────────────────
// Uses the real DashboardScreen (stripped down) + BottomNav with 3 tabs

type PendingTab = 'dashboard' | 'messages' | 'my-account';

function PendingDashboardLayout({ applicationData, onSignOut }: { applicationData: any; onSignOut: () => void }) {
  const { colors } = useTheme();
  const [activeTab, setActiveTab] = useState<PendingTab>('dashboard');

  const renderScreen = () => {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardScreen applicationData={applicationData} />;
      case 'messages':
        return <MessagesScreen onBack={() => setActiveTab('dashboard')} />;
      case 'my-account':
        return <MyProfileScreen onBack={() => setActiveTab('dashboard')} />;
      default:
        return <DashboardScreen applicationData={applicationData} />;
    }
  };

  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ flex: 1 }}>{renderScreen()}</View>
        <BottomNav
          activeTab={activeTab as TabId}
          onTabPress={(tab) => setActiveTab(tab as PendingTab)}
          hiddenTabs={['deliveries', 'wallet', 'points', 'reviews', 'referrals']}
        />
      </View>
    </SafeAreaProvider>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const styles = StyleSheet.create({
  // Splash
  splashContainer: { flex: 1 },
  splashSafe: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  splashContent: { alignItems: 'center', paddingHorizontal: 32 },
  splashIcon: { width: 160, height: 160, marginBottom: 16 },
  splashTitle: { fontFamily: fontFamily.bold, fontSize: 36, color: '#FFF', fontStyle: 'italic', textAlign: 'center', marginBottom: 8 },
  splashSubtitle: { fontFamily: fontFamily.regular, fontSize: 16, color: 'rgba(255,255,255,0.8)', textAlign: 'center', marginBottom: 32 },
  splashButton: { borderRadius: 12, paddingVertical: 18, paddingHorizontal: 60, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
  splashButtonText: { fontFamily: fontFamily.bold, fontSize: 18, color: '#000', textAlign: 'center', letterSpacing: 2 },

  // Success
  successContainer: { flex: 1 },
  successSafe: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  successContent: { alignItems: 'center', paddingHorizontal: 32 },
  successTitle: { fontFamily: fontFamily.bold, fontSize: 28, marginTop: 24, textAlign: 'center' },
  successDesc: { fontFamily: fontFamily.regular, fontSize: 16, lineHeight: 24, marginTop: 16, textAlign: 'center' },

  // Form
  formOuter: { flex: 1 },
  formHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 16 },
  formHeaderTitle: { fontFamily: fontFamily.bold, fontSize: 20 },
  formScroll: { paddingHorizontal: 24, paddingTop: 8 },

  // Avatar
  avatarSection: { alignItems: 'center', marginBottom: 28 },
  avatarWrapper: { width: 120, height: 120, borderRadius: 60, overflow: 'hidden', borderWidth: 3, borderColor: 'rgba(255,255,255,0.3)' },
  avatarImg: { width: '100%', height: '100%' },
  avatarPlaceholder: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { fontFamily: fontFamily.bold, fontSize: 36 },
  cameraOverlay: { backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20, padding: 8 },
  avatarHint: { fontFamily: fontFamily.regular, fontSize: 12, marginTop: 8 },

  // City search
  sectionLabel: { fontFamily: fontFamily.semiBold, fontSize: 14, marginBottom: 8 },
  cityInput: { paddingVertical: 14, paddingHorizontal: 18, paddingRight: 44, borderRadius: 10, fontSize: 16, fontFamily: fontFamily.regular, borderWidth: 1, letterSpacing: 0 },
  cityIconBtn: { position: 'absolute', right: 12, top: 14, padding: 2 },
  predictionsBox: { borderRadius: 10, marginTop: 8, borderWidth: 1, overflow: 'hidden' },
  predictionItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1 },
  predMainText: { fontFamily: fontFamily.semiBold, fontSize: 14 },
  predSecText: { fontFamily: fontFamily.regular, fontSize: 12, marginTop: 2 },

  // Yes/No
  yesNoRow: { marginBottom: 20 },
  yesNoLabel: { fontFamily: fontFamily.regular, fontSize: 15, marginBottom: 10, lineHeight: 22 },
  yesNoBtns: { flexDirection: 'row', gap: 10 },
  yesNoBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#888', alignItems: 'center' },
  yesNoBtnText: { fontFamily: fontFamily.semiBold, fontSize: 15 },

  // Error
  errorText: { color: '#FF3B30', fontFamily: fontFamily.regular, fontSize: 14, textAlign: 'center', marginBottom: 12 },
});
