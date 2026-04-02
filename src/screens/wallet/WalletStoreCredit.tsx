import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  StyleSheet, RefreshControl, Image,
} from 'react-native';
import { Coins, Wallet, ChevronLeft } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/ThemeContext';
import { fontFamily } from '../../constants/typography';
import { spacing, layout } from '../../constants/spacing';
import { supabase } from '../../lib/supabase';
import { SectionHeader } from '../../components/ui/SectionHeader';
import { TransactionCard } from '../../components/ui/TransactionCard';

interface PlaceBalance {
  place_id: string;
  place_name: string;
  place_address: string;
  place_image: string | null;
  balance: number;
}

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

const formatPrice = (price: number): string => {
  return price.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
};

interface Props {
  courierId: string;
  onBack: () => void;
  onViewAllTransactions: () => void;
}

export function WalletStoreCredit({ courierId, onBack, onViewAllTransactions }: Props) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [placeBalances, setPlaceBalances] = useState<PlaceBalance[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  const fetchData = useCallback(async () => {
    try {
      const { data: entries } = await supabase
        .from('store_credit_ledger_entry')
        .select(`
          id, place_id, amount, balance_after, type, description, video_id, order_id, created_at,
          place:place_id ( name, address_line_1, profile_picture_url, photos )
        `)
        .eq('customer_id', courierId)
        .order('created_at', { ascending: false });

      if (!entries || entries.length === 0) {
        setPlaceBalances([]);
        setTransactions([]);
        return;
      }

      const placeMap = new Map<string, PlaceBalance>();
      for (const entry of entries) {
        if (!placeMap.has(entry.place_id)) {
          const place = Array.isArray(entry.place) ? entry.place[0] : entry.place;
          const placeName = (place as any)?.name || 'Unknown Place';
          const placeAddress = (place as any)?.address_line_1 || '';
          const placeImage = (place as any)?.profile_picture_url ||
            ((place as any)?.photos && (place as any).photos.length > 0 ? (place as any).photos[0] : null);
          placeMap.set(entry.place_id, {
            place_id: entry.place_id,
            place_name: placeName,
            place_address: placeAddress,
            place_image: placeImage,
            balance: parseFloat(entry.balance_after as string) || 0,
          });
        }
      }

      const balances = Array.from(placeMap.values()).filter(p => p.balance > 0).sort((a, b) => b.balance - a.balance);
      setPlaceBalances(balances);

      const recentTxns: Transaction[] = entries.slice(0, 20).map((entry: any) => {
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
      setTransactions(recentTxns);
    } catch (err) {
      console.error('Error fetching store credit data:', err);
    }
  }, [courierId]);

  React.useEffect(() => {
    setLoading(true);
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  const bgColor = isDark ? colors.background : '#f5f5f5';
  const cardBg = isDark ? colors.card : '#fff';
  const textColor = isDark ? colors.text : '#000';
  const subtextColor = isDark ? colors.text + '99' : '#666';

  return (
    <View style={[styles.container, { backgroundColor: bgColor }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={onBack} style={styles.headerBackButton}>
          <ChevronLeft size={26} color={textColor} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: textColor }]}>Store Credit</Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={textColor} />
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 20 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {placeBalances.length > 0 && (
            <View style={styles.section}>
              <SectionHeader title="Credit Banked At" showViewAll={false} style={{ paddingHorizontal: 0 }} />
              {placeBalances.length === 1 ? (
                <View style={[styles.placeCard, { backgroundColor: cardBg, width: '100%' }]}>
                  <View style={styles.placeImageContainer}>
                    {placeBalances[0].place_image ? (
                      <Image source={{ uri: placeBalances[0].place_image }} style={styles.placeImage} />
                    ) : (
                      <View style={[styles.placeImagePlaceholder, { backgroundColor: isDark ? colors.border : '#e5e5e5' }]}>
                        <Coins size={32} color={subtextColor} />
                      </View>
                    )}
                  </View>
                  <View style={styles.placeInfo}>
                    <Text style={[styles.placeName, { color: textColor }]} numberOfLines={1}>{placeBalances[0].place_name}</Text>
                    <Text style={[styles.placeAddress, { color: subtextColor }]} numberOfLines={1}>{placeBalances[0].place_address}</Text>
                    <View style={styles.placeBalanceRow}>
                      <Wallet size={14} color={subtextColor} />
                      <Text style={[styles.placeBalance, { color: subtextColor }]}>
                        <Text style={styles.placeBalanceAmount}>{formatPrice(placeBalances[0].balance)}</Text> Available
                      </Text>
                    </View>
                  </View>
                </View>
              ) : (
                <View style={styles.horizontalScrollWrapper}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalScrollContent}>
                    {placeBalances.map(place => (
                      <View key={place.place_id} style={[styles.placeCard, { backgroundColor: cardBg }]}>
                        <View style={styles.placeImageContainer}>
                          {place.place_image ? (
                            <Image source={{ uri: place.place_image }} style={styles.placeImage} />
                          ) : (
                            <View style={[styles.placeImagePlaceholder, { backgroundColor: isDark ? colors.border : '#e5e5e5' }]}>
                              <Coins size={32} color={subtextColor} />
                            </View>
                          )}
                        </View>
                        <View style={styles.placeInfo}>
                          <Text style={[styles.placeName, { color: textColor }]} numberOfLines={1}>{place.place_name}</Text>
                          <Text style={[styles.placeAddress, { color: subtextColor }]} numberOfLines={1}>{place.place_address}</Text>
                          <View style={styles.placeBalanceRow}>
                            <Wallet size={14} color={subtextColor} />
                            <Text style={[styles.placeBalance, { color: subtextColor }]}>
                              <Text style={styles.placeBalanceAmount}>{formatPrice(place.balance)}</Text> Available
                            </Text>
                          </View>
                        </View>
                      </View>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>
          )}

          {transactions.length > 0 && (
            <View style={styles.section}>
              <SectionHeader title="Recent Transactions" showViewAll={true} onViewAllPress={onViewAllTransactions} style={{ paddingHorizontal: 0 }} />
              <View style={styles.transactionList}>
                {transactions.map(txn => (
                  <TransactionCard
                    key={txn.id}
                    placeName={txn.place_name}
                    placeId={txn.place_id}
                    amount={txn.amount}
                    type={txn.type}
                    date={txn.created_at}
                    description={txn.description}
                    videoId={txn.video_id}
                    orderId={txn.order_id}
                  />
                ))}
              </View>
            </View>
          )}

          {placeBalances.length === 0 && transactions.length === 0 && (
            <View style={styles.emptyState}>
              <Coins size={48} color={subtextColor} />
              <Text style={[styles.emptyTitle, { color: textColor }]}>No Store Credit Yet</Text>
              <Text style={[styles.emptySubtitle, { color: subtextColor }]}>
                Order from places that offer store credit to start earning rewards.
              </Text>
            </View>
          )}
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
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollView: { flex: 1 },
  scrollContent: { padding: spacing.lg },
  section: { marginBottom: spacing.xl },
  horizontalScrollWrapper: { marginHorizontal: -spacing.lg },
  horizontalScrollContent: { paddingLeft: spacing.lg, gap: spacing.md, paddingBottom: spacing.sm },
  placeCard: { width: 280, borderRadius: layout.cardBorderRadius, flexDirection: 'row', ...layout.cardShadow },
  placeImageContainer: { width: 110, height: 110, borderTopLeftRadius: layout.cardBorderRadius, borderBottomLeftRadius: layout.cardBorderRadius, overflow: 'hidden' },
  placeImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  placeImagePlaceholder: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  placeInfo: { flex: 1, padding: spacing.md, justifyContent: 'center' },
  placeName: { fontFamily: fontFamily.bold, fontSize: 16, marginBottom: 2 },
  placeAddress: { fontFamily: fontFamily.regular, fontSize: 13, marginBottom: spacing.xs },
  placeBalanceRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  placeBalance: { fontFamily: fontFamily.regular, fontSize: 14 },
  placeBalanceAmount: { fontFamily: fontFamily.bold },
  transactionList: { gap: spacing.sm },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing['5xl'] },
  emptyTitle: { fontFamily: fontFamily.bold, fontSize: 20, marginTop: spacing.lg, marginBottom: spacing.sm },
  emptySubtitle: { fontFamily: fontFamily.regular, fontSize: 15, textAlign: 'center', paddingHorizontal: spacing.xxxl },
});
