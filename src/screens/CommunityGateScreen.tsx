import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { MapPin, Search, X } from 'lucide-react-native';
import * as Location from 'expo-location';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { fontFamily } from '../constants/typography';

const SUPABASE_URL = 'https://rddssfhltufrwlsmbtps.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJkZHNzZmhsdHVmcndsc21idHBzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA0NjExNTAsImV4cCI6MjA3NjAzNzE1MH0.vNkjdUoYthWoaphE_sp1TsNx7U2A84W515iXVkuU01k';

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

interface CityPrediction {
  place_id: string;
  description: string;
  structured_formatting: {
    main_text: string;
    secondary_text: string;
  };
}

interface CommunityGateScreenProps {
  onCommunitySet: () => void;
}

export function CommunityGateScreen({ onCommunitySet }: CommunityGateScreenProps) {
  const { colors, isDark } = useTheme();
  const { courier, refreshCourier } = useAuth();
  const insets = useSafeAreaInsets();

  const [cityInput, setCityInput] = useState('');
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [predictions, setPredictions] = useState<CityPrediction[]>([]);
  const [isSearchingCity, setIsSearchingCity] = useState(false);
  const [showPredictions, setShowPredictions] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const textColor = isDark ? colors.text : '#000';
  const textSecColor = isDark ? colors.textSecondary : '#555';
  const cardBg = isDark ? colors.card : '#fff';
  const bg = isDark ? colors.background : '#F5F5F5';

  // Auto-detect on mount
  useEffect(() => {
    autoDetectCity();
  }, []);

  const autoDetectCity = async () => {
    setIsDetecting(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setIsDetecting(false);
        return;
      }

      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const [geo] = await Location.reverseGeocodeAsync({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });

      if (geo) {
        const parts = [geo.city, geo.region, geo.country].filter(Boolean);
        const cityStr = parts.join(', ');
        if (cityStr) {
          setCityInput(cityStr);
          setSelectedCity(cityStr);
        }
      }
    } catch (err) {
      console.log('[CommunityGate] Auto-detect city error:', err);
    }
    setIsDetecting(false);
  };

  // City search via Google Places autocomplete
  const searchCities = useCallback(async (query: string) => {
    if (query.length < 2) {
      setPredictions([]);
      return;
    }
    setIsSearchingCity(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || SUPABASE_ANON_KEY;
      const url = `${SUPABASE_URL}/functions/v1/google-places-autocomplete?input=${encodeURIComponent(query)}&components=country:ca|country:us&types=(cities)`;

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (data.predictions && data.predictions.length > 0) {
        setPredictions(data.predictions);
        setShowPredictions(true);
      } else {
        setPredictions([]);
        setShowPredictions(false);
      }
    } catch (err) {
      console.error('[CommunityGate] City search error:', err);
    } finally {
      setIsSearchingCity(false);
    }
  }, []);

  // Debounced search
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
  };

  // Find or create the community record, then update customer.community_id
  const handleSave = async () => {
    if (!selectedCity || !courier?.id) return;

    setIsSaving(true);
    setError('');

    try {
      // Parse city parts from selected string (e.g. "Regina, SK, Canada")
      const parts = selectedCity.split(', ').map((s) => s.trim());
      const cityName = parts[0] || selectedCity;
      const stateShort = parts.length >= 2 ? parts[1] : null;
      const stateFull = stateShort ? (STATE_NAMES[stateShort] || stateShort) : null;
      const country = parts.length >= 3 ? parts[2] : null;

      // Look up city_id from city table
      let cityId: string | null = null;
      const { data: cityMatch } = await supabase
        .from('city')
        .select('id')
        .ilike('name', cityName)
        .limit(1);
      if (cityMatch && cityMatch.length > 0) {
        cityId = cityMatch[0].id;
      }

      // Update customer record with city_id and community text
      const { error: updateError } = await supabase
        .from('customer')
        .update({
          city_id: cityId,
          community: selectedCity,
        })
        .eq('id', courier.id);

      if (updateError) {
        console.error('[CommunityGate] Error updating customer:', updateError);
        setError('Failed to save community. Please try again.');
        setIsSaving(false);
        return;
      }

      // Refresh courier data and proceed
      await refreshCourier();
      onCommunitySet();
    } catch (err: any) {
      console.error('[CommunityGate] Error:', err);
      setError(err.message || 'Something went wrong.');
    }

    setIsSaving(false);
  };

  return (
    <View style={[styles.container, { backgroundColor: bg, paddingTop: insets.top }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Title */}
          <View style={styles.titleSection}>
            <MapPin size={40} color={isDark ? '#FFFFFF' : '#000000'} />
            <Text style={[styles.title, { color: textColor }]}>Set Your Community</Text>
            <Text style={[styles.subtitle, { color: textSecColor }]}>
              We need to know your city to match you with delivery opportunities in your area.
            </Text>
          </View>

          {/* City search */}
          <View style={[styles.card, { backgroundColor: cardBg }]}>
            <Text style={[styles.label, { color: textSecColor }]}>Your City</Text>
            <View style={{ position: 'relative' }}>
              <TextInput
                style={[styles.cityInput, {
                  backgroundColor: isDark ? colors.inputBackground : '#F3F4F6',
                  borderColor: isDark ? colors.inputBorder : '#D1D5DB',
                  color: textColor,
                }]}
                placeholder="Search for your city..."
                placeholderTextColor={isDark ? colors.inputPlaceholder : '#9CA3AF'}
                value={cityInput}
                onChangeText={t => {
                  setCityInput(t);
                  if (selectedCity) setSelectedCity(null);
                }}
                autoCapitalize="words"
              />
              {selectedCity ? (
                <TouchableOpacity
                  style={styles.cityIconBtn}
                  onPress={() => {
                    setCityInput('');
                    setSelectedCity(null);
                    setPredictions([]);
                    setShowPredictions(false);
                  }}
                >
                  <X size={20} color={textSecColor} />
                </TouchableOpacity>
              ) : isSearchingCity || isDetecting ? (
                <View style={styles.cityIconBtn}>
                  <ActivityIndicator size="small" color={textSecColor} />
                </View>
              ) : (
                <View style={styles.cityIconBtn}>
                  <Search size={20} color={textSecColor} />
                </View>
              )}
            </View>

            {showPredictions && predictions.length > 0 && !selectedCity && (
              <View style={[styles.predictionsBox, {
                backgroundColor: cardBg,
                borderColor: isDark ? colors.border : '#D1D5DB',
              }]}>
                {predictions.map(p => (
                  <TouchableOpacity
                    key={p.place_id}
                    style={[styles.predictionItem, { borderBottomColor: isDark ? colors.border : '#f0f0f0' }]}
                    onPress={() => handleSelectCity(p)}
                  >
                    <MapPin size={18} color={textSecColor} style={{ marginRight: 12 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.predMainText, { color: textColor }]}>
                        {p.structured_formatting.main_text}
                      </Text>
                      <Text style={[styles.predSecText, { color: textSecColor }]} numberOfLines={1}>
                        {p.structured_formatting.secondary_text}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {isDetecting && !selectedCity && (
              <Text style={[styles.detectingText, { color: textSecColor }]}>
                Detecting your location...
              </Text>
            )}

            {/* Error */}
            {error !== '' && (
              <Text style={styles.errorText}>{error}</Text>
            )}

            {/* Save button */}
            {selectedCity && (
              <TouchableOpacity
                style={[styles.saveButton, { opacity: isSaving ? 0.6 : 1, backgroundColor: isDark ? '#FFFFFF' : '#000000' }]}
                onPress={handleSave}
                disabled={isSaving}
                activeOpacity={0.8}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                                    <Text style={[styles.saveButtonText, { color: isDark ? '#000' : '#fff' }]}>Continue</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 40,
  },
  titleSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: 26,
    marginTop: 16,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: fontFamily.regular,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  card: {
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  label: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    marginBottom: 8,
  },
  cityInput: {
    paddingVertical: 14,
    paddingHorizontal: 18,
    paddingRight: 44,
    borderRadius: 10,
    fontSize: 16,
    fontFamily: fontFamily.regular,
    borderWidth: 1,
  },
  cityIconBtn: {
    position: 'absolute',
    right: 12,
    top: 14,
    padding: 2,
  },
  predictionsBox: {
    borderRadius: 10,
    marginTop: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  predictionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  predMainText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
  },
  predSecText: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    marginTop: 2,
  },
  detectingText: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    marginTop: 8,
    textAlign: 'center',
  },
  errorText: {
    color: '#FF3B30',
    fontFamily: fontFamily.regular,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 12,
  },
  saveButton: {
    backgroundColor: '#000',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  saveButtonText: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
    color: '#fff',
  },
});
