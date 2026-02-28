import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Wallet,
  CreditCard,
  RefreshCw,
  Banknote,
  Car,
  Video,
  User,
  ArrowDownLeft,
  ArrowUpRight,
} from 'lucide-react-native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { fontFamily } from '../constants/typography';
import { spacing } from '../constants/spacing';
import { getCourierWalletTransactions, LedgerEntry } from '../services/wallet';

const formatPrice = (price: number): string => {
  const absPrice = Math.abs(price);
  const formatted = absPrice.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
  return price >= 0 ? formatted : `-${formatted}`;
};

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

const getTransactionIcon = (entry: LedgerEntry) => {
  const refType = entry.referenceType || entry.type || '';
  switch (refType) {
    case 'delivery_request':
      return <Car size={20} color="#22c55e" />;
    case 'top_up':
      return <CreditCard size={20} color="#22c55e" />;
    case 'refund':
      return <RefreshCw size={20} color="#3b82f6" />;
    case 'video_acceptance':
      return <Video size={20} color="#ec2227" />;
    case 'payout':
      return <Banknote size={20} color="#f59e0b" />;
    default:
      return entry.amount >= 0
        ? <ArrowDownLeft size={20} color="#22c55e" />
        : <ArrowUpRight size={20} color="#ef4444" />;
  }
};

interface TransactionItemProps {
  transaction: LedgerEntry;
  colors: any;
}

function TransactionItem({ transaction, colors }: TransactionItemProps) {
  return (
    <View style={[styles.transactionCard, { backgroundColor: colors.card }]}>
      <View style={styles.transactionRow}>
        <View style={styles.transactionInfo}>
          <Text style={[styles.transactionTitle, { color: colors.text }]} numberOfLines={2}>
            {transaction.description}
          </Text>
          <Text style={[styles.transactionDate, { color: colors.textSecondary }]}>
            {formatDate(transaction.date)}
          </Text>
        </View>
        <View style={styles.transactionAmountContainer}>
          <Text
            style={[
              styles.transactionAmount,
              transaction.amount >= 0 ? styles.amountPositive : styles.amountNegative,
            ]}
          >
            {transaction.amount >= 0 ? '+' : ''}{formatPrice(transaction.amount)}
          </Text>
          <Text style={[styles.transactionBalance, { color: colors.textSecondary }]}>
            Bal: {formatPrice(transaction.balance)}
          </Text>
        </View>
      </View>
    </View>
  );
}

export function WalletScreen() {
  const { courier } = useAuth();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [transactions, setTransactions] = useState<LedgerEntry[]>([]);
  const [balance, setBalance] = useState(0);

  const profileImage = courier?.profile_picture_url || null;

  const loadTransactions = useCallback(async () => {
    if (!courier?.id) return;
    try {
      const { transactions: txns, balance: walletBalance } = await getCourierWalletTransactions(courier.id);
      setTransactions(txns);
      setBalance(walletBalance);
    } catch (error) {
      console.error('[WalletScreen] Error loading transactions:', error);
    }
  }, [courier?.id]);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      await loadTransactions();
      setLoading(false);
    }
    fetchData();
  }, [loadTransactions]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadTransactions();
    setRefreshing(false);
  }, [loadTransactions]);

  const walletIconBg = isDark ? '#374151' : '#1f2937';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        {profileImage ? (
          <Image source={{ uri: profileImage }} style={styles.headerProfileImage} />
        ) : (
          <View style={[styles.headerProfileImage, { backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center' }]}>
            <User size={20} color={colors.textMuted} />
          </View>
        )}
        <Text style={[styles.headerTitle, { color: colors.text }]}>My Wallet</Text>
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
          {/* Balance Card */}
          <View style={[styles.balanceCard, { backgroundColor: colors.card }]}>
            <View style={[styles.balanceIconContainer, { backgroundColor: walletIconBg }]}>
              <Wallet size={24} color="#fff" />
            </View>
            <View style={styles.balanceInfo}>
              <Text style={[styles.balanceLabel, { color: colors.textSecondary }]}>Balance</Text>
              <Text style={[styles.balanceAmount, { color: colors.text }]}>{formatPrice(balance)}</Text>
            </View>
          </View>

          {/* Transaction History */}
          {transactions.length > 0 && (
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Transaction History</Text>
            </View>
          )}

          {transactions.length > 0 ? (
            transactions.map((txn) => (
              <TransactionItem key={txn.id} transaction={txn} colors={colors} />
            ))
          ) : (
            <View style={styles.emptyContainer}>
              <Wallet size={48} color={colors.textSecondary} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No Transactions Yet</Text>
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                Your wallet transactions will appear here as you complete deliveries and earn money.
              </Text>
            </View>
          )}
        </ScrollView>
      )}
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
  headerProfileImage: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fontFamily.bold,
    fontSize: 18,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingTop: 8,
    paddingHorizontal: 16,
  },

  // Balance Card
  balanceCard: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  balanceIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  balanceInfo: {
    flex: 1,
    marginLeft: 14,
  },
  balanceLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    marginBottom: 2,
  },
  balanceAmount: {
    fontFamily: fontFamily.bold,
    fontSize: 28,
  },

  // Section Header
  sectionHeader: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
  },

  // Transaction Card
  transactionCard: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  transactionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  transactionInfo: {
    flex: 1,
  },
  transactionTitle: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    marginBottom: 4,
  },
  transactionDate: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
  },
  transactionAmountContainer: {
    alignItems: 'flex-end',
    marginLeft: 12,
  },
  transactionAmount: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    marginBottom: 2,
  },
  amountPositive: {
    color: '#22c55e',
  },
  amountNegative: {
    color: '#ef4444',
  },
  transactionBalance: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
  },

  // Empty State
  emptyContainer: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 60,
  },
  emptyTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});
