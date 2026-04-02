import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, ActivityIndicator, StyleSheet, RefreshControl, TouchableOpacity,
} from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/ThemeContext';
import { fontFamily } from '../../constants/typography';
import { spacing } from '../../constants/spacing';
import { supabase } from '../../lib/supabase';
import { TransactionCard } from '../../components/ui/TransactionCard';

interface Transaction {
  id: string;
  place_id: string;
  place_name: string;
  amount: number;
  type: string;
  created_at: string;
  description: string | null;
  video_id: string | null;
  order_id: string | null;
}

interface Props {
  courierId: string;
  onBack: () => void;
}

export function WalletCreditTransactions({ courierId, onBack }: Props) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  const fetchTransactions = useCallback(async () => {
    try {
      const { data: entries } = await supabase
        .from('store_credit_ledger_entry')
        .select(`
          id, place_id, amount, type, description, video_id, order_id, created_at,
          place:place_id ( name )
        `)
        .eq('customer_id', courierId)
        .order('created_at', { ascending: false });

      if (!entries || entries.length === 0) { setTransactions([]); return; }

      const txns: Transaction[] = entries.map((entry: any) => {
        const place = Array.isArray(entry.place) ? entry.place[0] : entry.place;
        return {
          id: entry.id,
          place_id: entry.place_id,
          place_name: place?.name || 'Unknown Place',
          amount: parseFloat(entry.amount) || 0,
          type: entry.type,
          created_at: entry.created_at,
          description: entry.description || null,
          video_id: entry.video_id || null,
          order_id: entry.order_id || null,
        };
      });
      setTransactions(txns);
    } catch (err) {
      console.error('Error fetching credit transactions:', err);
    }
  }, [courierId]);

  React.useEffect(() => {
    setLoading(true);
    fetchTransactions().finally(() => setLoading(false));
  }, [fetchTransactions]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchTransactions();
    setRefreshing(false);
  }, [fetchTransactions]);

  const bgColor = isDark ? colors.background : '#f5f5f5';
  const textColor = isDark ? colors.text : '#000';
  const subtextColor = isDark ? colors.text + '99' : '#666';

  const renderTransaction = ({ item }: { item: Transaction }) => (
    <TransactionCard
      placeName={item.place_name}
      placeId={item.place_id}
      amount={item.amount}
      type={item.type}
      date={item.created_at}
      description={item.description}
      videoId={item.video_id}
      orderId={item.order_id}
    />
  );

  return (
    <View style={[styles.container, { backgroundColor: bgColor }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={onBack} style={styles.headerBackButton}>
          <ChevronLeft size={26} color={textColor} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: textColor }]}>Credit Transactions</Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={textColor} />
        </View>
      ) : transactions.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={[styles.emptyTitle, { color: textColor }]}>No Transactions Yet</Text>
          <Text style={[styles.emptySubtitle, { color: subtextColor }]}>
            Your store credit transactions will appear here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={transactions}
          keyExtractor={item => item.id}
          renderItem={renderTransaction}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 20 }]}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12 },
  headerBackButton: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontFamily: fontFamily.bold, fontSize: 18 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { padding: spacing.lg },
  separator: { height: spacing.sm },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxxl },
  emptyTitle: { fontFamily: fontFamily.bold, fontSize: 20, marginBottom: spacing.sm },
  emptySubtitle: { fontFamily: fontFamily.regular, fontSize: 15, textAlign: 'center' },
});
