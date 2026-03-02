import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ChevronLeft,
  Coins,
  TrendingDown,
  TrendingUp,
  Truck,
  Users,
  Zap,
} from 'lucide-react-native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { fontFamily } from '../constants/typography';
import { supabase } from '../lib/supabase';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PointsLedgerEntry {
  id: string;
  courier_id: string;
  entry_timestamp: string;
  points: number;
  description: string;
  reference_type: string | null;
  reference_id: string | null;
  community_id: string | null;
  place_id: string | null;
  delivery_request_id: string | null;
  reason: string | null;
  balance_after: number;
  created_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

const getReasonLabel = (reason: string | null): string => {
  switch (reason) {
    case 'delivery_completed':
      return 'Delivery Completed';
    case 'rejected_exclusive':
      return 'Rejected Exclusive Offer';
    case 'rejected_open':
      return 'Rejected Open Offer';
    case 'expired_exclusive':
      return 'Exclusive Offer Expired';
    case 'referral_signup':
      return 'Referral Bonus';
    case 'performance_bonus':
      return 'Performance Bonus';
    default:
      return '';
  }
};

// ── Transaction Item ──────────────────────────────────────────────────────────

interface PointsItemProps {
  entry: PointsLedgerEntry;
  colors: any;
}

function PointsItem({ entry, colors }: PointsItemProps) {
  const isPositive = entry.points >= 0;
  const reasonLabel = getReasonLabel(entry.reason);

  return (
    <View style={[styles.transactionCard, { backgroundColor: colors.card }]}>
      <View style={styles.transactionRow}>
        <View style={styles.transactionInfo}>
          <Text style={[styles.transactionTitle, { color: colors.text }]} numberOfLines={2}>
            {entry.description}
          </Text>
          {reasonLabel ? (
            <Text style={[styles.transactionReason, { color: colors.textMuted }]}>
              {reasonLabel}
            </Text>
          ) : null}
          <Text style={[styles.transactionDate, { color: colors.textSecondary }]}>
            {formatDate(entry.entry_timestamp)}
          </Text>
        </View>
        <View style={styles.transactionAmountContainer}>
          <Text
            style={[
              styles.transactionAmount,
              isPositive ? styles.amountPositive : styles.amountNegative,
            ]}
          >
            {isPositive ? '+' : ''}{entry.points}
          </Text>
          <Text style={[styles.transactionBalance, { color: colors.textSecondary }]}>
            Bal: {entry.balance_after}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export function PointsScreen({ onBack }: { onBack?: () => void }) {
  const { courier } = useAuth();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [entries, setEntries] = useState<PointsLedgerEntry[]>([]);
  const [netPoints, setNetPoints] = useState(0);

  const loadData = useCallback(async () => {
    if (!courier?.id) return;
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data, error } = await supabase
        .from('courier_points_ledger')
        .select('*')
        .eq('courier_id', courier.id)
        .gte('entry_timestamp', thirtyDaysAgo.toISOString())
        .order('entry_timestamp', { ascending: false });

      if (error) {
        console.error('[PointsScreen] Error loading ledger:', error);
        return;
      }

      const rows = (data || []) as PointsLedgerEntry[];
      setEntries(rows);

      const total = rows.reduce((sum, r) => sum + (r.points || 0), 0);
      setNetPoints(total);
    } catch (err) {
      console.error('[PointsScreen] Error:', err);
    }
  }, [courier?.id]);

  useEffect(() => {
    async function init() {
      setLoading(true);
      await loadData();
      setLoading(false);
    }
    init();
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const pointsIconBg = isDark ? '#374151' : '#1f2937';

  return (
    <View style={[styles.container, { backgroundColor: isDark ? colors.background : colors.backgroundTertiary }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={onBack} style={styles.headerBackButton}>
          <ChevronLeft size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>My Points</Text>
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
            <View style={[styles.balanceIconContainer, { backgroundColor: pointsIconBg }]}>
              <Coins size={24} color="#fff" />
            </View>
            <View style={styles.balanceInfo}>
              <Text style={[styles.balanceLabel, { color: colors.textSecondary }]}>Last 30 Days</Text>
              <Text style={[styles.balanceAmount, { color: colors.text }]}>{netPoints} Points</Text>
            </View>
          </View>

          {/* Points History */}
          {entries.length > 0 && (
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Points History</Text>
            </View>
          )}

          {entries.length > 0 ? (
            entries.map((entry) => (
              <PointsItem key={entry.id} entry={entry} colors={colors} />
            ))
          ) : (
            <View style={styles.emptyContainer}>
              <Coins size={48} color={colors.textSecondary} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No Points Activity</Text>
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                Your points earned and lost from deliveries will appear here.
              </Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

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
    alignItems: 'center',
    justifyContent: 'center',
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
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 6, elevation: 3,
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
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 6, elevation: 3,
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
    marginBottom: 2,
  },
  transactionReason: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    marginBottom: 2,
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
