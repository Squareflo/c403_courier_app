import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Linking, Modal, RefreshControl, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';
import {
  Wallet, CreditCard, Banknote, Coins, ChevronLeft, ExternalLink,
  AlertCircle, CheckCircle, Mail, Info, X,
} from 'lucide-react-native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { fontFamily } from '../constants/typography';
import { spacing, layout } from '../constants/spacing';
import { getCourierWalletTransactions } from '../services/wallet';
import {
  createStripeAccountLink, getStripeAccountDetails, cancelStripeConnection,
  requestWalletPayout, calculateAvailablePayoutAmount,
} from '../services/stripeConnect';
import { supabase } from '../lib/supabase';
import { CommunityGateScreen } from './CommunityGateScreen';
import { DirectDepositScreen } from './DirectDepositScreen';
import { SectionHeader } from '../components/ui/SectionHeader';
import { WalletPayments } from './wallet/WalletPayments';
import { WalletStoreCredit } from './wallet/WalletStoreCredit';
import { WalletCreditTransactions } from './wallet/WalletCreditTransactions';

const formatPrice = (price: number): string => {
  const absPrice = Math.abs(price);
  const formatted = absPrice.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  return price >= 0 ? formatted : `-${formatted}`;
};

// ─── Stripe Connect Screen ───────────────────────────────────────────────────

export function StripeConnectScreen({ onBack, onConnected, standalone }: { onBack: () => void; onConnected: () => void; standalone?: boolean }) {
  const { courier, refreshCourier } = useAuth();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [accountDetails, setAccountDetails] = useState<any>(null);
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
  const [error, setError] = useState('');
  const hasStartedOnboarding = !!courier?.stripe_account_id;
  const isFullyConnected = courier?.stripe_connect_status === 'enabled';
  const WEB_REFRESH_URL = 'https://www.chowlocal.app/CustomerStripeConnect?stripe_refresh=true';
  const WEB_RETURN_URL = 'https://www.chowlocal.app/CustomerStripeConnect?stripe_return=true';

  useEffect(() => { loadAccountDetails(); }, []);
  useEffect(() => {
    if (!courier?.stripe_account_id) return;
    const p = setInterval(async () => { await refreshCourier(); }, 5000);
    const t = setTimeout(() => { clearInterval(p); }, 30000);
    return () => { clearInterval(p); clearTimeout(t); };
  }, [courier?.stripe_account_id]);
  useEffect(() => { if (!standalone && courier?.stripe_connect_status === 'enabled') onConnected(); }, [courier?.stripe_connect_status]);

  const loadAccountDetails = async () => {
    if (!courier?.id || !courier?.stripe_account_id) { setLoading(false); return; }
    try { const r = await getStripeAccountDetails({ entity_type: 'customer', entity_id: courier.id }); if (r.success && r.account) setAccountDetails(r.account); } catch (e) { console.error('[StripeConnect] Error:', e); }
    setLoading(false);
  };
  const handleConnect = async () => {
    if (!courier?.id) return;
    setConnecting(true); setError('');
    try {
      const r = await createStripeAccountLink({ entity_type: 'customer', entity_id: courier.id, refresh_url: WEB_REFRESH_URL, return_url: WEB_RETURN_URL });
      if (r.success && r.url) { const c = await Linking.canOpenURL(r.url); if (c) { await Linking.openURL(r.url); await refreshCourier(); } else setError('Could not open Stripe onboarding.'); }
      else setError(r.error || 'Failed to create Stripe connection link.');
    } catch (e: any) { setError(e.message || 'Failed to initiate Stripe connection.'); }
    setConnecting(false);
  };
  const handleDisconnect = async () => {
    if (!courier?.id) return;
    setCancelling(true); setError(''); setShowDisconnectConfirm(false);
    try { const r = await cancelStripeConnection({ entity_type: 'customer', entity_id: courier.id }); if (r.success) { setAccountDetails(null); await refreshCourier(); } else setError('Failed to reset Stripe connection.'); }
    catch (e: any) { setError(e.message || 'Failed to reset Stripe connection.'); }
    setCancelling(false);
  };

  const textColor = isDark ? colors.text : '#000';

  if (loading) return (
    <View style={[styles.container, { backgroundColor: isDark ? colors.background : colors.backgroundTertiary }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={onBack} style={styles.headerBackButton}><ChevronLeft size={26} color={textColor} /></TouchableOpacity>
        <Text style={[styles.headerTitle, { color: textColor }]}>Stripe Express</Text>
        <View style={{ width: 36 }} />
      </View>
      <View style={styles.loadingContainer}><ActivityIndicator size="large" color={colors.textMuted} /></View>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: isDark ? colors.background : colors.backgroundTertiary }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={onBack} style={styles.headerBackButton}><ChevronLeft size={26} color={textColor} /></TouchableOpacity>
        <Text style={[styles.headerTitle, { color: textColor }]}>Stripe Express</Text>
        <View style={{ width: 36 }} />
      </View>
      <ScrollView contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 20 }]} showsVerticalScrollIndicator={false}>
        {error !== '' && (
          <View style={[styles.errorCard, { backgroundColor: isDark ? '#7F1D1D' : '#FEE2E2', borderColor: isDark ? '#991B1B' : '#FECACA' }]}>
            <AlertCircle size={18} color={isDark ? '#F87171' : '#DC2626'} />
            <Text style={[styles.errorText, { color: isDark ? '#FCA5A5' : '#991B1B' }]}>{error}</Text>
          </View>
        )}
        {isFullyConnected && (
          <View style={[styles.successCard, { backgroundColor: isDark ? '#064E3B' : '#D1FAE5', borderColor: isDark ? '#065F46' : '#A7F3D0' }]}>
            <CheckCircle size={18} color={isDark ? '#34D399' : '#059669'} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={[styles.successTitle, { color: isDark ? '#A7F3D0' : '#065F46' }]}>Stripe Connected!</Text>
              <Text style={[styles.successText, { color: isDark ? '#6EE7B7' : '#047857' }]}>Your bank account is connected. You can now receive payouts.</Text>
            </View>
          </View>
        )}
        <View style={[styles.connectCard, { backgroundColor: colors.card }]}>
          {!hasStartedOnboarding ? (
            <>
              <Text style={[styles.connectDescription, { color: colors.textSecondary }]}>To receive payouts, you need to connect a Stripe account. This is a secure process that will allow ChowLocal to transfer your earnings directly to your bank account.</Text>
              <TouchableOpacity style={[styles.connectButton, { opacity: connecting ? 0.6 : 1, backgroundColor: isDark ? '#FFFFFF' : '#000000' }]} onPress={handleConnect} disabled={connecting} activeOpacity={0.8}>
                {connecting ? <ActivityIndicator size="small" color={isDark ? '#000' : '#fff'} /> : <ExternalLink size={18} color={isDark ? '#000' : '#fff'} />}
                <Text style={[styles.connectButtonText, { color: isDark ? '#000' : '#fff' }]}>{connecting ? 'Connecting...' : 'Connect Stripe Account'}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              {accountDetails && (
                <View style={{ marginBottom: 16 }}>
                  <Text style={[styles.connectedTitle, { color: colors.text }]}>Connected Stripe Account</Text>
                  <View style={[styles.detailsBox, { backgroundColor: isDark ? colors.surfaceSecondary : '#F9FAFB', borderColor: colors.border }]}>
                    {accountDetails.email && (
                      <View style={styles.detailRow}>
                        <Mail size={18} color={colors.textSecondary} />
                        <View style={{ flex: 1, marginLeft: 10 }}>
                          <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Email</Text>
                          <Text style={[styles.detailValue, { color: colors.text }]}>{accountDetails.email}</Text>
                        </View>
                      </View>
                    )}
                    {accountDetails.business_profile?.name && (
                      <View style={[styles.detailRow, { marginTop: 12 }]}>
                        <CreditCard size={18} color={colors.textSecondary} />
                        <View style={{ flex: 1, marginLeft: 10 }}>
                          <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Business Name</Text>
                          <Text style={[styles.detailValue, { color: colors.text }]}>{accountDetails.business_profile.name}</Text>
                        </View>
                      </View>
                    )}
                    <View style={[styles.detailRow, { marginTop: 12 }]}>
                      <CheckCircle size={18} color={colors.textSecondary} />
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Account Status</Text>
                        <Text style={[styles.detailValue, { color: colors.text }]}>{accountDetails.charges_enabled && accountDetails.payouts_enabled ? 'Fully Enabled' : accountDetails.details_submitted ? 'Pending Verification' : 'Setup Incomplete'}</Text>
                      </View>
                    </View>
                    <TouchableOpacity style={[styles.stripeDashboardLink, { borderTopColor: colors.border }]} onPress={() => Linking.openURL('https://connect.stripe.com/app/express')} activeOpacity={0.7}>
                      <ExternalLink size={16} color={isDark ? '#FFFFFF' : '#000000'} />
                      <Text style={[styles.stripeDashboardText, { color: isDark ? '#FFFFFF' : '#000000' }]}>View in Stripe Dashboard</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
              {!isFullyConnected && (
                <TouchableOpacity style={[styles.continueButton, { borderColor: colors.border, backgroundColor: isDark ? colors.surfaceSecondary : '#fff' }]} onPress={handleConnect} disabled={connecting} activeOpacity={0.8}>
                  {connecting ? <ActivityIndicator size="small" color={colors.text} /> : <ExternalLink size={18} color={colors.text} />}
                  <Text style={[styles.continueButtonText, { color: colors.text }]}>{connecting ? 'Continuing...' : 'Continue Stripe Setup'}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[styles.disconnectButton, { borderColor: isDark ? '#991B1B' : '#FCA5A5', backgroundColor: isDark ? 'rgba(127,29,29,0.3)' : '#FEF2F2' }]} onPress={() => setShowDisconnectConfirm(true)} disabled={cancelling} activeOpacity={0.8}>
                {cancelling ? <ActivityIndicator size="small" color={isDark ? '#F87171' : '#DC2626'} /> : null}
                <Text style={[styles.disconnectButtonText, { color: isDark ? '#F87171' : '#DC2626' }]}>{cancelling ? 'Resetting...' : 'Disconnect & Start Over'}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
        {standalone && (
          <TouchableOpacity style={[styles.connectButton, { backgroundColor: isDark ? '#FFFFFF' : '#000000', marginTop: 16 }]} onPress={onConnected} activeOpacity={0.8}>
            <Wallet size={18} color={isDark ? '#000' : '#fff'} />
            <Text style={[styles.connectButtonText, { color: isDark ? '#000' : '#fff' }]}>Go To My Wallet</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
      <Modal visible={showDisconnectConfirm} transparent animationType="fade" onRequestClose={() => setShowDisconnectConfirm(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Disconnect Stripe Account?</Text>
            <Text style={[styles.modalDescription, { color: colors.textSecondary }]}>Are you sure you want to disconnect your Stripe account and start over? This action cannot be undone and you will need to reconnect to receive payouts.</Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalCancelButton, { borderColor: colors.border }]} onPress={() => setShowDisconnectConfirm(false)} activeOpacity={0.8}>
                <Text style={[styles.modalCancelText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalDisconnectButton} onPress={handleDisconnect} activeOpacity={0.8}>
                <Text style={styles.modalDisconnectText}>Disconnect</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Payout Screen ───────────────────────────────────────────────────────────

function PayoutScreen({ onBack, availableAmount, holdDays, onConfirm, processing }: { onBack: () => void; availableAmount: number; holdDays: number; onConfirm: (n: number) => void; processing: boolean }) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [amount, setAmount] = useState(availableAmount.toFixed(2));
  const [error, setError] = useState('');
  const textColor = isDark ? colors.text : '#000';

  const handleAmountChange = (v: string) => {
    setAmount(v);
    const p = parseFloat(v);
    if (isNaN(p) || p <= 0) setError('Please enter a valid amount');
    else if (p > availableAmount + 0.01) setError(`Amount cannot exceed $${availableAmount.toFixed(2)}`);
    else setError('');
  };

  const parsedAmount = parseFloat(amount) || 0;
  const fee = parsedAmount > 0 && parsedAmount < 150 ? parsedAmount * 0.0299 : 0;
  const youReceive = parsedAmount > 0 ? parsedAmount - fee : 0;
  const isValid = parsedAmount > 0 && parsedAmount <= availableAmount + 0.01 && error === '';

  return (
    <View style={[styles.container, { backgroundColor: isDark ? colors.background : colors.backgroundTertiary }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={onBack} style={styles.headerBackButton}><ChevronLeft size={26} color={textColor} /></TouchableOpacity>
        <Text style={[styles.headerTitle, { color: textColor }]}>Payout</Text>
        <View style={{ width: 36 }} />
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 20 }]} showsVerticalScrollIndicator={false}>
          <Text style={[styles.payoutScreenSubtitle, { color: colors.textSecondary }]}>
            You currently have ${availableAmount.toFixed(2)} available to pay out today
          </Text>
          <View style={{ marginTop: 20 }}>
            <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Payout Amount</Text>
            <View style={[styles.inputContainer, { borderColor: error ? '#EF4444' : colors.border, backgroundColor: isDark ? colors.inputBackground : '#F9FAFB' }]}>
              <Text style={[styles.inputPrefix, { color: colors.textSecondary }]}>$</Text>
              <TextInput style={[styles.input, { color: colors.text }]} value={amount} onChangeText={handleAmountChange} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.textMuted} editable={!processing} />
            </View>
            {error !== '' && <Text style={styles.inputError}>{error}</Text>}
          </View>
          <View style={[styles.payoutBreakdown, { borderTopColor: colors.border }]}>
            {fee > 0 && (
              <View style={styles.breakdownRow}>
                <Text style={[styles.breakdownLabel, { color: colors.textSecondary }]}>Processing fee (2.99%)</Text>
                <Text style={[styles.breakdownValue, { color: colors.text }]}>${fee.toFixed(2)}</Text>
              </View>
            )}
            {parsedAmount > 0 && (
              <View style={styles.breakdownRow}>
                <Text style={[styles.breakdownLabelBold, { color: colors.text }]}>You'll receive</Text>
                <Text style={[styles.breakdownValueBold, { color: '#27d20b' }]}>${youReceive.toFixed(2)}</Text>
              </View>
            )}
          </View>
          <View style={[styles.feeInfoBox, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F3F4F6' }]}>
            <Info size={14} color={isDark ? '#CCCCCC' : '#666666'} style={{ marginTop: 1 }} />
            <Text style={[styles.feeInfoText, { color: isDark ? '#CCCCCC' : '#666666' }]}>
              Payouts under $150 include a 2.99% processing fee. Funds must be in your wallet for {holdDays} days before becoming available.
            </Text>
          </View>
          <TouchableOpacity style={[styles.confirmPayoutButton, { opacity: !isValid || processing ? 0.5 : 1 }]} onPress={() => onConfirm(parsedAmount)} disabled={!isValid || processing} activeOpacity={0.8}>
            {processing ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.confirmPayoutButtonText}>Confirm Payout</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── My Wallet Screen (Dashboard) ────────────────────────────────────────────

type SubScreen = 'dashboard' | 'payments' | 'store-credit' | 'credit-transactions' | 'payout' | 'stripe-connect' | 'community-gate' | 'direct-deposit';

export function MyWalletScreen({ onBack }: { onBack?: () => void }) {
  const { courier, refreshCourier } = useAuth();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const [subScreen, setSubScreen] = useState<SubScreen>('dashboard');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [balance, setBalance] = useState(0);
  const [availableAmount, setAvailableAmount] = useState(0);
  const [holdDays, setHoldDays] = useState(7);
  const [payoutProcessing, setPayoutProcessing] = useState(false);
  const [storeCreditBalance, setStoreCreditBalance] = useState(0);
  const [storeCreditPlaceCount, setStoreCreditPlaceCount] = useState(0);

  const stripeConnectStatus = courier?.stripe_connect_status;
  const isStripeConnected = stripeConnectStatus === 'enabled';

  const loadData = useCallback(async () => {
    if (!courier?.id) return;
    try {
      const [txResult, payoutResult] = await Promise.all([
        getCourierWalletTransactions(courier.id),
        calculateAvailablePayoutAmount(courier.id),
      ]);
      setBalance(txResult.balance);
      setAvailableAmount(payoutResult.available);
      setHoldDays(payoutResult.holdDays);

      // Fetch store credit balance
      const { data: entries } = await supabase
        .from('store_credit_ledger_entry')
        .select('place_id, balance_after')
        .eq('customer_id', courier.id)
        .order('created_at', { ascending: false });

      if (entries && entries.length > 0) {
        const placeMap = new Map<string, number>();
        for (const entry of entries) {
          if (!placeMap.has(entry.place_id)) {
            placeMap.set(entry.place_id, parseFloat(entry.balance_after as string) || 0);
          }
        }
        const balances = Array.from(placeMap.values()).filter(b => b > 0);
        setStoreCreditBalance(balances.reduce((sum, b) => sum + b, 0));
        setStoreCreditPlaceCount(balances.length);
      } else {
        setStoreCreditBalance(0);
        setStoreCreditPlaceCount(0);
      }
    } catch (e) {
      console.error('[MyWalletScreen] Error:', e);
    }
  }, [courier?.id]);

  useEffect(() => {
    (async () => { setLoading(true); await loadData(); setLoading(false); })();
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadData(), refreshCourier()]);
    setRefreshing(false);
  }, [loadData, refreshCourier]);

  const handlePayoutPress = async () => {
    if (!courier?.id) return;
    try {
      const { data: custData } = await supabase.from('customer').select('city_id').eq('id', courier.id).single();
      if (!custData?.city_id) { setSubScreen('community-gate'); return; }
    } catch (e) { console.log('[MyWalletScreen] city check error:', e); }
    if (!isStripeConnected) { setSubScreen('direct-deposit'); return; }
    if (availableAmount <= 0) { Alert.alert('No Funds Available', `Funds added to your wallet must remain for ${holdDays} days before they become available for withdrawal.`); return; }
    setSubScreen('payout');
  };

  const handlePayoutConfirm = async (amount: number) => {
    if (!courier?.id) return;
    setPayoutProcessing(true);
    try {
      const r = await requestWalletPayout({ entity_type: 'customer', entity_id: courier.id, amount });
      if (r.success) {
        setSubScreen('dashboard');
        Alert.alert('Payout Processed', `$${(r.amount || amount).toFixed(2)} has been sent to your Stripe account.${r.fee && r.fee > 0 ? `\nProcessing fee: $${r.fee.toFixed(2)}` : ''}`);
        await loadData();
      } else Alert.alert('Payout Failed', r.error || 'Failed to process payout.');
    } catch (e: any) { Alert.alert('Error', e.message || 'An unexpected error occurred.'); }
    setPayoutProcessing(false);
  };

  const handleStripeConnected = () => { setSubScreen('dashboard'); refreshCourier(); loadData(); };
  const handleCommunitySet = () => { setSubScreen('dashboard'); refreshCourier(); };
  const handleDirectDepositContinue = () => { setSubScreen('stripe-connect'); };

  // ─── Sub-screen routing ─────────────────────────────────────────────────

  if (!courier?.id) return null;

  if (subScreen === 'community-gate') return <CommunityGateScreen onCommunitySet={handleCommunitySet} />;
  if (subScreen === 'direct-deposit') return <DirectDepositScreen onBack={() => setSubScreen('dashboard')} onContinue={handleDirectDepositContinue} />;
  if (subScreen === 'stripe-connect') return <StripeConnectScreen onBack={() => setSubScreen('dashboard')} onConnected={handleStripeConnected} />;
  if (subScreen === 'payout') return <PayoutScreen onBack={() => setSubScreen('dashboard')} availableAmount={availableAmount} holdDays={holdDays} onConfirm={handlePayoutConfirm} processing={payoutProcessing} />;
  if (subScreen === 'payments') return <WalletPayments courierId={courier.id} onBack={() => setSubScreen('dashboard')} />;
  if (subScreen === 'store-credit') return <WalletStoreCredit courierId={courier.id} onBack={() => setSubScreen('dashboard')} onViewAllTransactions={() => setSubScreen('credit-transactions')} />;
  if (subScreen === 'credit-transactions') return <WalletCreditTransactions courierId={courier.id} onBack={() => setSubScreen('store-credit')} />;

  // ─── Dashboard ──────────────────────────────────────────────────────────

  const walletIconBg = isDark ? '#374151' : '#1f2937';
  const textColor = isDark ? colors.text : '#000';

  return (
    <View style={[styles.container, { backgroundColor: isDark ? colors.background : colors.backgroundTertiary }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={onBack} style={styles.headerBackButton}>
          <ChevronLeft size={26} color={textColor} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: textColor }]}>My Wallet</Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.textMuted} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 20 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.textMuted}
              colors={[colors.textMuted]}
            />
          }
        >
          {/* Money Card */}
          <TouchableOpacity
            style={[styles.balanceCard, { backgroundColor: colors.card }]}
            activeOpacity={0.7}
            onPress={() => setSubScreen('payments')}
          >
            <View style={styles.balanceCardTop}>
              <View style={[styles.balanceIconContainer, { backgroundColor: walletIconBg }]}>
                <Banknote size={24} color="#fff" />
              </View>
              <View style={styles.balanceInfo}>
                <Text style={[styles.balanceLabel, { color: colors.textSecondary }]}>Money</Text>
                <Text style={[styles.balanceAmount, { color: colors.text }]}>{formatPrice(balance)}</Text>
              </View>
              <TouchableOpacity
                style={styles.payoutButton}
                onPress={(e) => { e.stopPropagation?.(); handlePayoutPress(); }}
                activeOpacity={0.8}
              >
                <Text style={styles.payoutButtonText}>Payout</Text>
              </TouchableOpacity>
            </View>
            <Text style={[styles.balanceDescription, { color: colors.textSecondary }]}>
              {isStripeConnected
                ? `$${availableAmount.toFixed(2)} eligible for payout. Funds must remain for ${holdDays} days. Payouts under $150 include a 2.99% fee.`
                : 'Connect your bank account to withdraw your earnings.'}
            </Text>
          </TouchableOpacity>

          {/* Available payout info */}
          {isStripeConnected && availableAmount > 0 && (
            <View style={[styles.availableInfoCard, { backgroundColor: isDark ? '#064E3B' : '#ECFDF5', borderColor: isDark ? '#065F46' : '#A7F3D0' }]}>
              <Text style={[styles.availableInfoText, { color: isDark ? '#6EE7B7' : '#047857' }]}>${availableAmount.toFixed(2)} available for payout</Text>
            </View>
          )}

          {/* Connect prompt */}
          {!isStripeConnected && balance > 0 && (
            <TouchableOpacity
              style={[styles.connectPrompt, { backgroundColor: isDark ? '#78350F' : '#FEF3C7', borderColor: isDark ? '#92400E' : '#FDE68A' }]}
              onPress={() => setSubScreen('stripe-connect')}
              activeOpacity={0.8}
            >
              <AlertCircle size={16} color={isDark ? '#FBBF24' : '#D97706'} />
              <Text style={[styles.connectPromptText, { color: isDark ? '#FDE68A' : '#92400E' }]}>Connect your bank account to withdraw your earnings</Text>
              <ChevronLeft size={16} color={isDark ? '#FBBF24' : '#D97706'} style={{ transform: [{ rotate: '180deg' }] }} />
            </TouchableOpacity>
          )}

          {/* Store Credit + QR Code Row */}
          <View style={styles.storeCreditRow}>
            <TouchableOpacity
              style={[styles.storeCreditCard, { backgroundColor: colors.card }]}
              activeOpacity={0.7}
              onPress={() => setSubScreen('store-credit')}
            >
              <View style={[styles.balanceIconContainer, { backgroundColor: walletIconBg }]}>
                <Coins size={24} color="#fff" />
              </View>
              <View style={styles.balanceInfo}>
                <Text style={[styles.balanceLabel, { color: colors.textSecondary }]}>Store Credit</Text>
                <Text style={[styles.storeCreditAmount, { color: colors.text }]}>{formatPrice(storeCreditBalance)}</Text>
                <Text style={[styles.storeCreditPlaces, { color: colors.textSecondary }]}>
                  At{' '}
                  <Text style={{ fontFamily: fontFamily.bold, color: colors.text }}>
                    {storeCreditPlaceCount} Place{storeCreditPlaceCount !== 1 ? 's' : ''}
                  </Text>
                </Text>
              </View>
            </TouchableOpacity>

            <View style={[styles.qrCard, { backgroundColor: colors.card }]}>
              <QRCode
                value={courier.id}
                size={80}
                backgroundColor="transparent"
                color={colors.text}
              />
            </View>
          </View>

          <View style={{ height: 100 }} />
        </ScrollView>
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12 },
  headerBackButton: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontFamily: fontFamily.bold, fontSize: 18 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingTop: 8, paddingHorizontal: 16 },

  // Balance / Money Card
  balanceCard: { borderRadius: layout.cardBorderRadius, padding: layout.cardPadding, ...layout.cardShadow, marginBottom: spacing.md },
  balanceCardTop: { flexDirection: 'row', alignItems: 'center' },
  balanceIconContainer: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  balanceInfo: { flex: 1, marginLeft: 14 },
  balanceLabel: { fontFamily: fontFamily.regular, fontSize: 13, marginBottom: 2 },
  balanceAmount: { fontFamily: fontFamily.bold, fontSize: 28 },
  balanceDescription: { fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 18, marginTop: 12 },

  // Payout button on balance card
  payoutButton: { backgroundColor: '#27d20b', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, marginLeft: 10 },
  payoutButtonText: { fontFamily: fontFamily.semiBold, fontSize: 14, color: '#fff' },

  // Available info
  availableInfoCard: { borderRadius: 10, padding: 10, marginBottom: spacing.lg, borderWidth: 1, alignItems: 'center' },
  availableInfoText: { fontFamily: fontFamily.medium, fontSize: 13 },

  // Connect prompt
  connectPrompt: { borderRadius: 10, padding: 12, marginBottom: spacing.lg, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  connectPromptText: { fontFamily: fontFamily.medium, fontSize: 13, flex: 1 },

  // Store Credit + QR Row
  storeCreditRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg },
  storeCreditCard: { flex: 1, borderRadius: layout.cardBorderRadius, padding: layout.cardPadding, flexDirection: 'row', alignItems: 'center', ...layout.cardShadow },
  storeCreditAmount: { fontFamily: fontFamily.bold, fontSize: 22 },
  storeCreditPlaces: { fontFamily: fontFamily.regular, fontSize: 13, marginTop: 2 },
  qrCard: { width: 120, borderRadius: layout.cardBorderRadius, padding: spacing.lg, alignItems: 'center', justifyContent: 'center', ...layout.cardShadow },

  // Stripe Connect styles
  errorCard: { borderRadius: 10, padding: 12, marginBottom: 16, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  errorText: { fontFamily: fontFamily.medium, fontSize: 13, flex: 1 },
  successCard: { borderRadius: 10, padding: 12, marginBottom: 16, borderWidth: 1, flexDirection: 'row', alignItems: 'flex-start' },
  successTitle: { fontFamily: fontFamily.bold, fontSize: 14 },
  successText: { fontFamily: fontFamily.regular, fontSize: 13, marginTop: 4 },
  connectCard: { borderRadius: layout.cardBorderRadius, padding: layout.cardPadding, ...layout.cardShadow, marginBottom: 16 },
  connectDescription: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 20, marginBottom: 16 },
  connectButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 14, borderRadius: 10 },
  connectButtonText: { fontFamily: fontFamily.semiBold, fontSize: 15 },
  connectedTitle: { fontFamily: fontFamily.bold, fontSize: 16, marginBottom: 12 },
  detailsBox: { borderRadius: 10, padding: 16, borderWidth: 1 },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start' },
  detailLabel: { fontFamily: fontFamily.regular, fontSize: 12 },
  detailValue: { fontFamily: fontFamily.semiBold, fontSize: 14, marginTop: 2 },
  stripeDashboardLink: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, paddingTop: 16, borderTopWidth: 1 },
  stripeDashboardText: { fontFamily: fontFamily.semiBold, fontSize: 14 },
  continueButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 14, borderRadius: 10, borderWidth: 1, marginBottom: 12 },
  continueButtonText: { fontFamily: fontFamily.semiBold, fontSize: 15 },
  disconnectButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 10, borderWidth: 1 },
  disconnectButtonText: { fontFamily: fontFamily.semiBold, fontSize: 14 },

  // Payout screen styles
  payoutScreenSubtitle: { fontFamily: fontFamily.regular, fontSize: 15, lineHeight: 22 },
  inputLabel: { fontFamily: fontFamily.medium, fontSize: 13, marginBottom: 8 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12 },
  inputPrefix: { fontFamily: fontFamily.semiBold, fontSize: 18, marginRight: 4 },
  input: { flex: 1, fontFamily: fontFamily.semiBold, fontSize: 18, padding: 0 },
  inputError: { fontFamily: fontFamily.regular, fontSize: 12, color: '#EF4444', marginTop: 6 },
  payoutBreakdown: { borderTopWidth: 1, marginTop: 20, paddingTop: 16 },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  breakdownLabel: { fontFamily: fontFamily.regular, fontSize: 14 },
  breakdownValue: { fontFamily: fontFamily.regular, fontSize: 14 },
  breakdownLabelBold: { fontFamily: fontFamily.semiBold, fontSize: 15 },
  breakdownValueBold: { fontFamily: fontFamily.bold, fontSize: 16 },
  feeInfoBox: { flexDirection: 'row', gap: 8, borderRadius: 8, padding: 12, marginTop: 16 },
  feeInfoText: { fontFamily: fontFamily.regular, fontSize: 12, flex: 1, lineHeight: 18 },
  confirmPayoutButton: { backgroundColor: '#27d20b', paddingVertical: 16, borderRadius: 10, alignItems: 'center', marginTop: 24 },
  confirmPayoutButtonText: { fontFamily: fontFamily.bold, fontSize: 16, color: '#fff' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalContent: { borderRadius: 16, padding: 24, width: '100%', maxWidth: 380 },
  modalTitle: { fontFamily: fontFamily.bold, fontSize: 18, marginBottom: 12 },
  modalDescription: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 20, marginBottom: 20 },
  modalButtons: { flexDirection: 'row', gap: 12 },
  modalCancelButton: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
  modalCancelText: { fontFamily: fontFamily.semiBold, fontSize: 14 },
  modalDisconnectButton: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#DC2626', alignItems: 'center' },
  modalDisconnectText: { fontFamily: fontFamily.semiBold, fontSize: 14, color: '#fff' },
});
