import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Linking, Modal, RefreshControl, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Wallet, CreditCard, RefreshCw, Banknote, Car, Video, ArrowDownLeft,
  ArrowUpRight, ChevronLeft, ExternalLink, AlertCircle, CheckCircle,
  Mail, X, Info,
} from 'lucide-react-native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { fontFamily } from '../constants/typography';
import { getCourierWalletTransactions, LedgerEntry } from '../services/wallet';
import {
  createStripeAccountLink, getStripeAccountDetails, cancelStripeConnection,
  requestWalletPayout, calculateAvailablePayoutAmount,
} from '../services/stripeConnect';
import { supabase } from '../lib/supabase';
import { CommunityGateScreen } from './CommunityGateScreen';
import { DirectDepositScreen } from './DirectDepositScreen';

const formatPrice = (price: number): string => {
  const absPrice = Math.abs(price);
  const formatted = absPrice.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  return price >= 0 ? formatted : `-${formatted}`;
};
const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
};
const getTransactionIcon = (entry: LedgerEntry) => {
  const refType = entry.referenceType || entry.type || '';
  switch (refType) {
    case 'delivery_request': return <Car size={20} color="#27d20b" />;
    case 'top_up': return <CreditCard size={20} color="#27d20b" />;
    case 'refund': return <RefreshCw size={20} color="#3b82f6" />;
    case 'video_acceptance': return <Video size={20} color="#ec2227" />;
    case 'payout': return <Banknote size={20} color="#f59e0b" />;
    default: return entry.amount >= 0 ? <ArrowDownLeft size={20} color="#27d20b" /> : <ArrowUpRight size={20} color="#ef4444" />;
  }
};

function TransactionItem({ transaction, colors }: { transaction: LedgerEntry; colors: any }) {
  return (
    <View style={[styles.transactionCard, { backgroundColor: colors.card }]}>
      <View style={styles.transactionRow}>
        <View style={styles.transactionInfo}>
          <Text style={[styles.transactionTitle, { color: colors.text }]} numberOfLines={2}>{transaction.description}</Text>
          <Text style={[styles.transactionDate, { color: colors.textSecondary }]}>{formatDate(transaction.date)}</Text>
        </View>
        <View style={styles.transactionAmountContainer}>
          <Text style={[styles.transactionAmount, transaction.amount >= 0 ? styles.amountPositive : styles.amountNegative]}>{transaction.amount >= 0 ? '+' : ''}{formatPrice(transaction.amount)}</Text>
          <Text style={[styles.transactionBalance, { color: colors.textSecondary }]}>Bal: {formatPrice(transaction.balance)}</Text>
        </View>
      </View>
    </View>
  );
}

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

  if (loading) return (<View style={[styles.container, { backgroundColor: isDark ? colors.background : colors.backgroundTertiary }]}><View style={[styles.header, { paddingTop: insets.top + 8 }]}><TouchableOpacity onPress={onBack} style={styles.headerBackButton}><ChevronLeft size={26} color={colors.text} /></TouchableOpacity><Text style={[styles.headerTitle, { color: colors.text }]}>Stripe Express</Text><View style={{ width: 36 }} /></View><View style={styles.loadingContainer}><ActivityIndicator size="large" color={colors.textMuted} /></View></View>);

  return (
    <View style={[styles.container, { backgroundColor: isDark ? colors.background : colors.backgroundTertiary }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}><TouchableOpacity onPress={onBack} style={styles.headerBackButton}><ChevronLeft size={26} color={colors.text} /></TouchableOpacity><Text style={[styles.headerTitle, { color: colors.text }]}>Stripe Express</Text><View style={{ width: 36 }} /></View>
      <ScrollView contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 20 }]} showsVerticalScrollIndicator={false}>
        {error !== '' && (<View style={[styles.errorCard, { backgroundColor: isDark ? '#7F1D1D' : '#FEE2E2', borderColor: isDark ? '#991B1B' : '#FECACA' }]}><AlertCircle size={18} color={isDark ? '#F87171' : '#DC2626'} /><Text style={[styles.errorText, { color: isDark ? '#FCA5A5' : '#991B1B' }]}>{error}</Text></View>)}
        {isFullyConnected && (<View style={[styles.successCard, { backgroundColor: isDark ? '#064E3B' : '#D1FAE5', borderColor: isDark ? '#065F46' : '#A7F3D0' }]}><CheckCircle size={18} color={isDark ? '#34D399' : '#059669'} /><View style={{ flex: 1, marginLeft: 10 }}><Text style={[styles.successTitle, { color: isDark ? '#A7F3D0' : '#065F46' }]}>Stripe Connected!</Text><Text style={[styles.successText, { color: isDark ? '#6EE7B7' : '#047857' }]}>Your bank account is connected. You can now receive payouts.</Text></View></View>)}
        <View style={[styles.connectCard, { backgroundColor: colors.card }]}>
          {!hasStartedOnboarding ? (<><Text style={[styles.connectDescription, { color: colors.textSecondary }]}>To receive payouts, you need to connect a Stripe account. This is a secure process that will allow ChowLocal to transfer your earnings directly to your bank account.</Text><TouchableOpacity style={[styles.connectButton, { opacity: connecting ? 0.6 : 1, backgroundColor: isDark ? '#FFFFFF' : '#000000' }]} onPress={handleConnect} disabled={connecting} activeOpacity={0.8}>{connecting ? <ActivityIndicator size="small" color={isDark ? '#000' : '#fff'} /> : <ExternalLink size={18} color={isDark ? '#000' : '#fff'} />}<Text style={[styles.connectButtonText, { color: isDark ? '#000' : '#fff' }]}>{connecting ? 'Connecting...' : 'Connect Stripe Account'}</Text></TouchableOpacity></>) : (<>
            {accountDetails && (<View style={{ marginBottom: 16 }}><Text style={[styles.connectedTitle, { color: colors.text }]}>Connected Stripe Account</Text><View style={[styles.detailsBox, { backgroundColor: isDark ? colors.surfaceSecondary : '#F9FAFB', borderColor: colors.border }]}>{accountDetails.email && (<View style={styles.detailRow}><Mail size={18} color={colors.textSecondary} /><View style={{ flex: 1, marginLeft: 10 }}><Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Email</Text><Text style={[styles.detailValue, { color: colors.text }]}>{accountDetails.email}</Text></View></View>)}{accountDetails.business_profile?.name && (<View style={[styles.detailRow, { marginTop: 12 }]}><CreditCard size={18} color={colors.textSecondary} /><View style={{ flex: 1, marginLeft: 10 }}><Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Business Name</Text><Text style={[styles.detailValue, { color: colors.text }]}>{accountDetails.business_profile.name}</Text></View></View>)}<View style={[styles.detailRow, { marginTop: 12 }]}><CheckCircle size={18} color={colors.textSecondary} /><View style={{ flex: 1, marginLeft: 10 }}><Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Account Status</Text><Text style={[styles.detailValue, { color: colors.text }]}>{accountDetails.charges_enabled && accountDetails.payouts_enabled ? 'Fully Enabled' : accountDetails.details_submitted ? 'Pending Verification' : 'Setup Incomplete'}</Text></View></View><TouchableOpacity style={[styles.stripeDashboardLink, { borderTopColor: colors.border }]} onPress={() => Linking.openURL('https://connect.stripe.com/app/express')} activeOpacity={0.7}><ExternalLink size={16} color={isDark ? '#FFFFFF' : '#000000'} /><Text style={[styles.stripeDashboardText, { color: isDark ? '#FFFFFF' : '#000000' }]}>View in Stripe Dashboard</Text></TouchableOpacity></View></View>)}
            {!isFullyConnected && (<TouchableOpacity style={[styles.continueButton, { borderColor: colors.border, backgroundColor: isDark ? colors.surfaceSecondary : '#fff' }]} onPress={handleConnect} disabled={connecting} activeOpacity={0.8}>{connecting ? <ActivityIndicator size="small" color={colors.text} /> : <ExternalLink size={18} color={colors.text} />}<Text style={[styles.continueButtonText, { color: colors.text }]}>{connecting ? 'Continuing...' : 'Continue Stripe Setup'}</Text></TouchableOpacity>)}
            <TouchableOpacity style={[styles.disconnectButton, { borderColor: isDark ? '#991B1B' : '#FCA5A5', backgroundColor: isDark ? 'rgba(127,29,29,0.3)' : '#FEF2F2' }]} onPress={() => setShowDisconnectConfirm(true)} disabled={cancelling} activeOpacity={0.8}>{cancelling ? <ActivityIndicator size="small" color={isDark ? '#F87171' : '#DC2626'} /> : null}<Text style={[styles.disconnectButtonText, { color: isDark ? '#F87171' : '#DC2626' }]}>{cancelling ? 'Resetting...' : 'Disconnect & Start Over'}</Text></TouchableOpacity>
          </>)}
        </View>
        {standalone && (<TouchableOpacity style={[styles.connectButton, { backgroundColor: isDark ? '#FFFFFF' : '#000000', marginTop: 16 }]} onPress={onConnected} activeOpacity={0.8}><Wallet size={18} color={isDark ? '#000' : '#fff'} /><Text style={[styles.connectButtonText, { color: isDark ? '#000' : '#fff' }]}>Go To My Wallet</Text></TouchableOpacity>)}
      </ScrollView>
      <Modal visible={showDisconnectConfirm} transparent animationType="fade" onRequestClose={() => setShowDisconnectConfirm(false)}><View style={styles.modalOverlay}><View style={[styles.modalContent, { backgroundColor: colors.card }]}><Text style={[styles.modalTitle, { color: colors.text }]}>Disconnect Stripe Account?</Text><Text style={[styles.modalDescription, { color: colors.textSecondary }]}>Are you sure you want to disconnect your Stripe account and start over? This action cannot be undone and you will need to reconnect to receive payouts.</Text><View style={styles.modalButtons}><TouchableOpacity style={[styles.modalCancelButton, { borderColor: colors.border }]} onPress={() => setShowDisconnectConfirm(false)} activeOpacity={0.8}><Text style={[styles.modalCancelText, { color: colors.text }]}>Cancel</Text></TouchableOpacity><TouchableOpacity style={styles.modalDisconnectButton} onPress={handleDisconnect} activeOpacity={0.8}><Text style={styles.modalDisconnectText}>Disconnect</Text></TouchableOpacity></View></View></View></Modal>
    </View>
  );
}

function PayoutScreen({ onBack, availableAmount, holdDays, onConfirm, processing }: { onBack: () => void; availableAmount: number; holdDays: number; onConfirm: (n: number) => void; processing: boolean }) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [amount, setAmount] = useState(availableAmount.toFixed(2));
  const [error, setError] = useState('');

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
        <TouchableOpacity onPress={onBack} style={styles.headerBackButton}>
          <ChevronLeft size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Payout</Text>
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
              <TextInput
                style={[styles.input, { color: colors.text }]}
                value={amount}
                onChangeText={handleAmountChange}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={colors.textMuted}
                editable={!processing}
              />
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

          <TouchableOpacity
            style={[styles.confirmPayoutButton, { opacity: !isValid || processing ? 0.5 : 1 }]}
            onPress={() => onConfirm(parsedAmount)}
            disabled={!isValid || processing}
            activeOpacity={0.8}
          >
            {processing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.confirmPayoutButtonText}>Confirm Payout</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

export function WalletScreen({ onBack }: { onBack?: () => void }) {
  const { courier, refreshCourier } = useAuth();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [transactions, setTransactions] = useState<LedgerEntry[]>([]);
  const [balance, setBalance] = useState(0);
  const [availableAmount, setAvailableAmount] = useState(0);
  const [holdDays, setHoldDays] = useState(7);
  const [showPayoutScreen, setShowPayoutScreen] = useState(false);
  const [payoutProcessing, setPayoutProcessing] = useState(false);
  const [showStripeConnect, setShowStripeConnect] = useState(false);
  const [showCommunityGate, setShowCommunityGate] = useState(false);
  const [showDirectDeposit, setShowDirectDeposit] = useState(false);

  const stripeConnectStatus = courier?.stripe_connect_status;
  const isStripeConnected = stripeConnectStatus === 'enabled';

  const loadTransactions = useCallback(async () => {
    if (!courier?.id) return;
    try {
      const [txResult, payoutResult] = await Promise.all([getCourierWalletTransactions(courier.id), calculateAvailablePayoutAmount(courier.id)]);
      setTransactions(txResult.transactions); setBalance(txResult.balance); setAvailableAmount(payoutResult.available); setHoldDays(payoutResult.holdDays);
    } catch (e) { console.error('[WalletScreen] Error:', e); }
  }, [courier?.id]);

  useEffect(() => { (async () => { setLoading(true); await loadTransactions(); setLoading(false); })(); }, [loadTransactions]);
  const onRefresh = useCallback(async () => { setRefreshing(true); await Promise.all([loadTransactions(), refreshCourier()]); setRefreshing(false); }, [loadTransactions, refreshCourier]);

  const handlePayoutPress = async () => {
    if (!courier?.id) return;
    // Step 1: Check city_id (courier must have a city set)
    try {
      const { data: custData } = await supabase.from('customer').select('city_id, community_id').eq('id', courier.id).single();
      if (!custData?.city_id && !custData?.community_id) { setShowCommunityGate(true); return; }
    } catch (e) { console.log('[WalletScreen] city check error:', e); }
    // Step 2: If Stripe not connected, always show DirectDeposit first (so courier can verify details)
    if (!isStripeConnected) { setShowDirectDeposit(true); return; }
    // Step 4: Check available amount
    if (availableAmount <= 0) { Alert.alert('No Funds Available', `Funds added to your wallet must remain for ${holdDays} days before they become available for withdrawal.`); return; }
    setShowPayoutScreen(true);
  };

  const handlePayoutConfirm = async (amount: number) => {
    if (!courier?.id) return;
    setPayoutProcessing(true);
    try {
      const r = await requestWalletPayout({ entity_type: 'customer', entity_id: courier.id, amount });
      if (r.success) {
        setShowPayoutScreen(false);
        Alert.alert('Payout Processed', `$${(r.amount || amount).toFixed(2)} has been sent to your Stripe account.${r.fee && r.fee > 0 ? `\nProcessing fee: $${r.fee.toFixed(2)}` : ''}`);
        await loadTransactions();
      } else Alert.alert('Payout Failed', r.error || 'Failed to process payout.');
    } catch (e: any) { Alert.alert('Error', e.message || 'An unexpected error occurred.'); }
    setPayoutProcessing(false);
  };

  const handleStripeConnected = () => { setShowStripeConnect(false); refreshCourier(); loadTransactions(); };
  const handleCommunitySet = () => { setShowCommunityGate(false); refreshCourier(); };
  const handleDirectDepositContinue = () => { setShowDirectDeposit(false); setShowStripeConnect(true); };

  if (showCommunityGate) return <CommunityGateScreen onCommunitySet={handleCommunitySet} />;
  if (showDirectDeposit) return <DirectDepositScreen onBack={() => setShowDirectDeposit(false)} onContinue={handleDirectDepositContinue} />;
  if (showStripeConnect) return <StripeConnectScreen onBack={() => setShowStripeConnect(false)} onConnected={handleStripeConnected} />;
  if (showPayoutScreen) return <PayoutScreen onBack={() => setShowPayoutScreen(false)} availableAmount={availableAmount} holdDays={holdDays} onConfirm={handlePayoutConfirm} processing={payoutProcessing} />;

  const walletIconBg = isDark ? '#374151' : '#1f2937';
  return (
    <View style={[styles.container, { backgroundColor: isDark ? colors.background : colors.backgroundTertiary }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}><TouchableOpacity onPress={onBack} style={styles.headerBackButton}><ChevronLeft size={26} color={colors.text} /></TouchableOpacity><Text style={[styles.headerTitle, { color: colors.text }]}>My Wallet</Text><View style={{ width: 36 }} /></View>
      {loading ? (<View style={styles.loadingContainer}><ActivityIndicator size="large" color={colors.textMuted} /></View>) : (
        <ScrollView contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 20 }]} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textMuted} colors={[colors.textMuted]} />}>
          <View style={[styles.balanceCard, { backgroundColor: colors.card }]}><View style={[styles.balanceIconContainer, { backgroundColor: walletIconBg }]}><Wallet size={24} color="#fff" /></View><View style={styles.balanceInfo}><Text style={[styles.balanceLabel, { color: colors.textSecondary }]}>Balance</Text><Text style={[styles.balanceAmount, { color: colors.text }]}>{formatPrice(balance)}</Text></View><TouchableOpacity style={[styles.payoutButton, !isStripeConnected && styles.payoutButtonSetup]} onPress={handlePayoutPress} activeOpacity={0.8}><Text style={styles.payoutButtonText}>Payout</Text></TouchableOpacity></View>
          {isStripeConnected && availableAmount > 0 && (<View style={[styles.availableInfoCard, { backgroundColor: isDark ? '#064E3B' : '#ECFDF5', borderColor: isDark ? '#065F46' : '#A7F3D0' }]}><Text style={[styles.availableInfoText, { color: isDark ? '#6EE7B7' : '#047857' }]}>${availableAmount.toFixed(2)} available for payout</Text></View>)}
          {!isStripeConnected && balance > 0 && (<TouchableOpacity style={[styles.connectPrompt, { backgroundColor: isDark ? '#78350F' : '#FEF3C7', borderColor: isDark ? '#92400E' : '#FDE68A' }]} onPress={() => setShowStripeConnect(true)} activeOpacity={0.8}><AlertCircle size={16} color={isDark ? '#FBBF24' : '#D97706'} /><Text style={[styles.connectPromptText, { color: isDark ? '#FDE68A' : '#92400E' }]}>Connect your bank account to withdraw your earnings</Text><ChevronLeft size={16} color={isDark ? '#FBBF24' : '#D97706'} style={{ transform: [{ rotate: '180deg' }] }} /></TouchableOpacity>)}
          {transactions.length > 0 && (<View style={styles.sectionHeader}><Text style={[styles.sectionTitle, { color: colors.text }]}>Transaction History</Text></View>)}
          {transactions.length > 0 ? transactions.map((txn) => <TransactionItem key={txn.id} transaction={txn} colors={colors} />) : (<View style={styles.emptyContainer}><Wallet size={48} color={colors.textSecondary} /><Text style={[styles.emptyTitle, { color: colors.text }]}>No Transactions Yet</Text><Text style={[styles.emptyText, { color: colors.textSecondary }]}>Your wallet transactions will appear here as you complete deliveries and earn money.</Text></View>)}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12 },
  headerBackButton: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontFamily: fontFamily.bold, fontSize: 18 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingTop: 8, paddingHorizontal: 16 },
  balanceCard: { borderRadius: 14, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 6, elevation: 3, marginBottom: 12, flexDirection: 'row', alignItems: 'center' },
  balanceIconContainer: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  balanceInfo: { flex: 1, marginLeft: 14 },
  balanceLabel: { fontFamily: fontFamily.regular, fontSize: 13, marginBottom: 2 },
  balanceAmount: { fontFamily: fontFamily.bold, fontSize: 28 },
  payoutButton: { backgroundColor: '#27d20b', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, marginLeft: 10 },
  payoutButtonSetup: { backgroundColor: '#27d20b' },
  payoutButtonText: { fontFamily: fontFamily.semiBold, fontSize: 14, color: '#fff' },
  availableInfoCard: { borderRadius: 10, padding: 10, marginBottom: 16, borderWidth: 1, alignItems: 'center' },
  availableInfoText: { fontFamily: fontFamily.medium, fontSize: 13 },
  connectPrompt: { borderRadius: 10, padding: 12, marginBottom: 16, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  connectPromptText: { fontFamily: fontFamily.medium, fontSize: 13, flex: 1 },
  sectionHeader: { marginBottom: 12 },
  sectionTitle: { fontFamily: fontFamily.bold, fontSize: 18 },
  transactionCard: { borderRadius: 12, padding: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 6, elevation: 3, marginBottom: 10 },
  transactionRow: { flexDirection: 'row', alignItems: 'flex-start' },
  transactionInfo: { flex: 1 },
  transactionTitle: { fontFamily: fontFamily.regular, fontSize: 14, marginBottom: 4 },
  transactionDate: { fontFamily: fontFamily.regular, fontSize: 12 },
  transactionAmountContainer: { alignItems: 'flex-end', marginLeft: 12 },
  transactionAmount: { fontFamily: fontFamily.semiBold, fontSize: 15, marginBottom: 2 },
  amountPositive: { color: '#27d20b' },
  amountNegative: { color: '#ef4444' },
  transactionBalance: { fontFamily: fontFamily.regular, fontSize: 11 },
  emptyContainer: { alignItems: 'center', paddingHorizontal: 24, paddingVertical: 60 },
  emptyTitle: { fontFamily: fontFamily.bold, fontSize: 18, marginTop: 16, marginBottom: 8 },
  emptyText: { fontFamily: fontFamily.regular, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  errorCard: { borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  errorText: { fontFamily: fontFamily.regular, fontSize: 13, flex: 1 },
  successCard: { borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: 1, flexDirection: 'row', alignItems: 'flex-start' },
  successTitle: { fontFamily: fontFamily.semiBold, fontSize: 14, marginBottom: 2 },
  successText: { fontFamily: fontFamily.regular, fontSize: 13 },
  connectCard: { borderRadius: 14, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 6, elevation: 3 },
  connectDescription: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 20, marginBottom: 16 },
  connectButton: { borderRadius: 10, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  connectButtonText: { fontFamily: fontFamily.semiBold, fontSize: 15 },
  connectedTitle: { fontFamily: fontFamily.semiBold, fontSize: 17, marginBottom: 12 },
  detailsBox: { borderRadius: 10, padding: 14, borderWidth: 1 },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start' },
  detailLabel: { fontFamily: fontFamily.medium, fontSize: 12, marginBottom: 2 },
  detailValue: { fontFamily: fontFamily.regular, fontSize: 14 },
  stripeDashboardLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, paddingTop: 12, borderTopWidth: 1 },
  stripeDashboardText: { fontFamily: fontFamily.medium, fontSize: 13 },
  continueButton: { borderRadius: 10, borderWidth: 1, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 10 },
  continueButtonText: { fontFamily: fontFamily.semiBold, fontSize: 15 },
  disconnectButton: { borderRadius: 10, borderWidth: 1, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  disconnectButtonText: { fontFamily: fontFamily.semiBold, fontSize: 15 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  modalContent: { width: '100%', borderRadius: 16, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 10 },
  modalTitle: { fontFamily: fontFamily.bold, fontSize: 18, marginBottom: 8 },
  modalDescription: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 20, marginBottom: 20 },
  modalButtons: { flexDirection: 'row', gap: 10 },
  modalCancelButton: { flex: 1, borderRadius: 10, borderWidth: 1, paddingVertical: 12, alignItems: 'center' },
  modalCancelText: { fontFamily: fontFamily.semiBold, fontSize: 15 },
  modalDisconnectButton: { flex: 1, borderRadius: 10, backgroundColor: '#DC2626', paddingVertical: 12, alignItems: 'center' },
  modalDisconnectText: { fontFamily: fontFamily.semiBold, fontSize: 15, color: '#fff' },
  payoutScreenSubtitle: { fontFamily: fontFamily.regular, fontSize: 14, marginTop: 4 },
  inputLabel: { fontFamily: fontFamily.medium, fontSize: 13, marginBottom: 6 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, height: 48 },
  inputPrefix: { fontFamily: fontFamily.regular, fontSize: 16, marginRight: 4 },
  input: { flex: 1, fontFamily: fontFamily.regular, fontSize: 16, padding: 0 },
  inputError: { fontFamily: fontFamily.regular, fontSize: 12, color: '#EF4444', marginTop: 4 },
  payoutBreakdown: { marginTop: 20, paddingTop: 16, borderTopWidth: 1, gap: 8 },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  breakdownLabel: { fontFamily: fontFamily.regular, fontSize: 14 },
  breakdownValue: { fontFamily: fontFamily.medium, fontSize: 14 },
  breakdownLabelBold: { fontFamily: fontFamily.semiBold, fontSize: 15 },
  breakdownValueBold: { fontFamily: fontFamily.bold, fontSize: 15 },
  feeInfoBox: { flexDirection: 'row', borderRadius: 8, padding: 10, marginTop: 16, gap: 8 },
  feeInfoText: { fontFamily: fontFamily.regular, fontSize: 12, lineHeight: 16, flex: 1 },
  confirmPayoutButton: { backgroundColor: '#27d20b', borderRadius: 10, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  confirmPayoutButtonText: { fontFamily: fontFamily.semiBold, fontSize: 16, color: '#fff' },
});
