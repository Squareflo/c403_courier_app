import React, { useEffect, useState, useCallback } from 'react';
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, QrCode } from 'lucide-react-native';
import QRCode from 'react-native-qrcode-svg';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { fontFamily } from '../constants/typography';
import { supabase } from '../lib/supabase';

type ReferralTab = 'qr-code' | 'how-it-works';

const TABS: { key: ReferralTab; label: string }[] = [
  { key: 'qr-code', label: 'My Referral Code' },
  { key: 'how-it-works', label: 'How It Works' },
];

// Generate a secure 10-character alphanumeric token
const generateReferralToken = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  const randomValues = new Uint8Array(10);
  for (let i = 0; i < 10; i++) {
    randomValues[i] = Math.floor(Math.random() * 256);
  }
  for (let i = 0; i < 10; i++) {
    token += chars[randomValues[i] % chars.length];
  }
  return token;
};

export function ReferralsScreen({ onBack }: { onBack: () => void }) {
  const { colors, isDark } = useTheme();
  const { courier } = useAuth();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<ReferralTab>('qr-code');
  const [courierCity, setCourierCity] = useState('');
  const [courierState, setCourierState] = useState('');

  // QR code state
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [loadingQr, setLoadingQr] = useState(false);
  const [checkingQr, setCheckingQr] = useState(true);

  // Referral commission from city plan
  const [referralCommission, setReferralCommission] = useState<string | null>(null);
  const [activationFeeAmount, setActivationFeeAmount] = useState<string | null>(null);

  const isSalesRep = courier?.roles?.includes('sales_rep') ?? false;

  // Fetch courier location
  useEffect(() => {
    if (!courier?.id) return;
    (async () => {
      try {
        const { data } = await supabase
          .from('stripe_express_details')
          .select('city, state')
          .eq('customer_id', courier.id)
          .maybeSingle();
        if (data?.city) setCourierCity(data.city);
        if (data?.state) setCourierState(data.state);
      } catch (e) {
        console.log('[ReferralsScreen] Error fetching location:', e);
      }
    })();
  }, [courier?.id]);

  // Fetch referral commission from courier's city plan
  useEffect(() => {
    if (!courier?.id) return;
    (async () => {
      try {
        const { data: cust } = await supabase
          .from('customer')
          .select('city_id')
          .eq('id', courier.id)
          .maybeSingle();

        if (!cust?.city_id) return;

        const { data: cityData } = await supabase
          .from('city_resolved')
          .select('default_plan_id')
          .eq('id', cust.city_id)
          .maybeSingle();

        if (!cityData?.default_plan_id) return;

        const { data: plan } = await supabase
          .from('plan')
          .select('account_activation_fee, activation_fee_commission_pct')
          .eq('id', cityData.default_plan_id)
          .maybeSingle();

        if (plan) {
          const fee = parseFloat(plan.account_activation_fee || '0');
          const pct = parseFloat(plan.activation_fee_commission_pct || '0');
          const commission = Math.round(fee * (pct / 100) * 100) / 100;
          setReferralCommission(commission > 0 ? `$${commission.toFixed(2)}` : null);
          setActivationFeeAmount(fee > 0 ? `$${fee.toFixed(0)}` : null);
        }
      } catch (e) {
        console.log('[ReferralsScreen] Error fetching commission:', e);
      }
    })();
  }, [courier?.id]);

  // Check if QR code record already exists on mount
  useEffect(() => {
    if (!courier?.id) {
      setCheckingQr(false);
      return;
    }
    (async () => {
      try {
        const { data: existing, error } = await supabase
          .from('qr_code')
          .select('token')
          .eq('type', 'customer_referral_code_place_registration')
          .eq('referral_by', courier.id)
          .maybeSingle();

        if (!error && existing?.token) {
          setQrToken(existing.token);
        }
      } catch (e) {
        console.log('[ReferralsScreen] Error checking QR code:', e);
      } finally {
        setCheckingQr(false);
      }
    })();
  }, [courier?.id]);

  // Generate QR code record
  const handleGenerateQrCode = useCallback(async () => {
    if (!courier?.id) return;
    setLoadingQr(true);

    try {
      // Double-check it doesn't already exist
      const { data: existing } = await supabase
        .from('qr_code')
        .select('token')
        .eq('type', 'customer_referral_code_place_registration')
        .eq('referral_by', courier.id)
        .maybeSingle();

      if (existing?.token) {
        setQrToken(existing.token);
        setLoadingQr(false);
        return;
      }

      // Generate unique token with retry
      let token = generateReferralToken();
      let attempts = 0;
      const maxAttempts = 5;

      while (attempts < maxAttempts) {
        const { data: newRecord, error: insertError } = await supabase
          .from('qr_code')
          .insert({
            type: 'customer_referral_code_place_registration',
            link_id: courier.id,
            referral_by: courier.id,
            token,
            scans: 0,
          })
          .select('token')
          .single();

        if (!insertError && newRecord) {
          console.log('[ReferralsScreen] QR code created with token:', newRecord.token);
          setQrToken(newRecord.token);
          return;
        }

        // If unique constraint violation, retry with new token
        if (insertError?.code === '23505') {
          token = generateReferralToken();
          attempts++;
        } else {
          console.error('[ReferralsScreen] Error creating QR code:', insertError);
          break;
        }
      }
    } catch (e) {
      console.error('[ReferralsScreen] Error generating QR code:', e);
    } finally {
      setLoadingQr(false);
    }
  }, [courier?.id]);

  const locationSuffix = courierCity && courierState
    ? ` in ${courierCity}, ${courierState}`
    : courierCity
      ? ` in ${courierCity}`
      : '';

  const locationLabel = courierCity && courierState
    ? `${courierCity}, ${courierState}`
    : courierCity || 'your city';

  const qrUrl = qrToken ? `https://effin.ca/r/${qrToken}` : '';

  // ── Not a sales rep ──
  if (!isSalesRep) {
    return (
      <View style={[styles.container, { backgroundColor: isDark ? colors.background : colors.backgroundTertiary }]}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={onBack} style={styles.headerBackButton}>
            <ChevronLeft size={26} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Referrals</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 20 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Not Authorized */}
          <View style={[styles.card, { backgroundColor: colors.card, marginBottom: 16 }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Restaurant Referral Program</Text>
            <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>
              You are not currently authorized to participate in Chow Local's Restaurant Referral Program for Couriers.
            </Text>
            <Text style={[styles.cardDescription, { color: colors.textSecondary, marginTop: 10 }]}>
              If you're interested in helping us recruit restaurants in {locationLabel}, let us know by reaching out to our team.
            </Text>
            <TouchableOpacity
              style={[styles.qrButton, { backgroundColor: isDark ? '#FFFFFF' : '#000000', marginTop: 16, marginBottom: 0 }]}
              activeOpacity={0.8}
              onPress={() => Linking.openURL('mailto:support@chowlocal.com?subject=Sales%20Rep%20Interest')}
            >
              <Text style={[styles.qrButtonText, { color: isDark ? '#000000' : '#FFFFFF' }]}>
                Contact Us
              </Text>
            </TouchableOpacity>
          </View>

          {/* How It Works */}
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>How It Works</Text>
            <Text style={[styles.cardDescription, { color: colors.textSecondary, marginBottom: 14 }]}>
              We're always looking for more restaurants and eateries to join our platform. The more restaurants we have, the more delivery opportunities our couriers get.
            </Text>
            <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>
              Couriers who have experience in sales and who have strong relationships in their local restaurant scene are encouraged to apply to become a Sales Rep.
            </Text>
          </View>
        </ScrollView>
      </View>
    );
  }

  // ── Sales rep view ──
  return (
    <View style={[styles.container, { backgroundColor: isDark ? colors.background : colors.backgroundTertiary }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={onBack} style={styles.headerBackButton}>
          <ChevronLeft size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Referrals</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Pill Tabs */}
      <View style={styles.filterContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScrollContent}
        >
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[
                  styles.filterTag,
                  { backgroundColor: colors.card },
                  isActive && { backgroundColor: isDark ? '#fff' : '#000' },
                ]}
                onPress={() => setActiveTab(tab.key)}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.filterTagText,
                  { color: colors.text },
                  isActive && { color: isDark ? '#000' : '#fff', fontFamily: fontFamily.semiBold },
                ]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 20 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* My Referral Code Tab */}
        {activeTab === 'qr-code' && (
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>My QR Code</Text>

            {checkingQr ? (
              <View style={styles.qrLoadingContainer}>
                <ActivityIndicator size="small" color={colors.text} />
              </View>
            ) : qrToken ? (
              /* ── QR Code Display ── */
              <View style={styles.qrDisplayContainer}>
                <View style={styles.qrCodeWrapper}>
                  <QRCode
                    value={qrUrl}
                    size={200}
                    backgroundColor="#FFFFFF"
                    color="#000000"
                  />
                </View>
                <Text style={[styles.qrTokenText, { color: colors.textSecondary }]}>
                  {qrToken}
                </Text>
                <Text style={[styles.cardDescription, { color: colors.textSecondary, textAlign: 'center' }]}>
                  Have the restaurant owner or manager scan this QR code using the Chow Local Customer App to start their sign-up.
                </Text>
              </View>
            ) : (
              /* ── Generate Button ── */
              <>
                <TouchableOpacity
                  style={[styles.qrButton, { backgroundColor: isDark ? '#FFFFFF' : '#000000' }]}
                  activeOpacity={0.8}
                  onPress={handleGenerateQrCode}
                  disabled={loadingQr}
                >
                  {loadingQr ? (
                    <ActivityIndicator size="small" color={isDark ? '#000000' : '#FFFFFF'} />
                  ) : (
                    <>
                      <QrCode size={18} color={isDark ? '#000000' : '#FFFFFF'} />
                      <Text style={[styles.qrButtonText, { color: isDark ? '#000000' : '#FFFFFF' }]}>
                        Generate My QR Code
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
                <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>
                  Tap the button above to generate your personal referral QR code. The restaurant operator must scan it in the Chow Local Customer App and complete sign-up within 24 hours.
                </Text>
              </>
            )}
          </View>
        )}

        {/* How It Works Tab */}
        {activeTab === 'how-it-works' && (
          <>
            <View style={[styles.card, { backgroundColor: colors.card, marginBottom: 16 }]}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>
                Earn {referralCommission || 'a commission'} for Every Restaurant You Refer
              </Text>
              <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>
                Invite a local restaurant to try Chow Local for 6 months and earn a {referralCommission ? `${referralCommission} referral commission` : 'referral commission'}.
              </Text>
            </View>
            <View style={[styles.card, { backgroundColor: colors.card }]}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>How It Works</Text>
              <View style={styles.stepList}>
                <View style={styles.stepRow}>
                  <View style={[styles.stepNumber, { backgroundColor: isDark ? '#fff' : '#000' }]}>
                    <Text style={[styles.stepNumberText, { color: isDark ? '#000' : '#fff' }]}>1</Text>
                  </View>
                  <Text style={[styles.stepText, { color: colors.textSecondary }]}>
                    Share your QR code with a local restaurant owner or operator.
                  </Text>
                </View>
                <View style={styles.stepRow}>
                  <View style={[styles.stepNumber, { backgroundColor: isDark ? '#fff' : '#000' }]}>
                    <Text style={[styles.stepNumberText, { color: isDark ? '#000' : '#fff' }]}>2</Text>
                  </View>
                  <Text style={[styles.stepText, { color: colors.textSecondary }]}>
                    The restaurant operator scans your QR code in the Chow Local Customer App and completes their sign-up within 24 hours.
                  </Text>
                </View>
                <View style={styles.stepRow}>
                  <View style={[styles.stepNumber, { backgroundColor: isDark ? '#fff' : '#000' }]}>
                    <Text style={[styles.stepNumberText, { color: isDark ? '#000' : '#fff' }]}>3</Text>
                  </View>
                  <Text style={[styles.stepText, { color: colors.textSecondary }]}>
                    Once the restaurant pays its account activation fee, your referral commission gets added to your wallet.
                  </Text>
                </View>
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerBackButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fontFamily.bold,
    fontSize: 18,
  },
  filterContainer: {
    paddingBottom: 4,
  },
  filterScrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  filterTag: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  filterTagText: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
  },
  scrollContent: {
    paddingTop: 12,
    paddingHorizontal: 16,
  },
  card: {
    borderRadius: 14,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  cardTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
    marginBottom: 12,
  },
  cardDescription: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 20,
  },
  bulletList: {
    gap: 6,
  },
  bulletItem: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 20,
  },
  qrButton: {
    borderRadius: 10,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
  },
  qrButtonText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
  },
  qrLoadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  qrDisplayContainer: {
    alignItems: 'center',
    gap: 14,
  },
  qrCodeWrapper: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrTokenText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    letterSpacing: 2,
  },
  stepList: {
    gap: 16,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepNumberText: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
  },
  stepText: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 20,
    flex: 1,
  },
});
