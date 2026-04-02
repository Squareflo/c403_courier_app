import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, ActivityIndicator,
  StyleSheet, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { fontFamily } from '../../constants/typography';
import { spacing, layout } from '../../constants/spacing';
import { supabase } from '../../lib/supabase';

interface DisplayItem {
  id: string;
  type: string;
  date: string;
  amount: number;
  description: string;
  balance: number;
  sortTime: number;
}

const formatPrice = (price: number): string => {
  return Math.abs(price).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
};

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const formatTime = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

const getStreetFromAddress = (fullAddress: string | null): string => {
  if (!fullAddress) return '';
  const parts = fullAddress.split(',');
  return parts[0]?.trim() || fullAddress;
};

const cleanTopUpDescription = (description: string | null): string => {
  if (!description) return 'Wallet Top Up';
  const cleaned = description.replace(/^Customer had \$[\d.,]+\s*Wallet Balance\s*-\s*/i, '');
  return cleaned || 'Wallet Top Up';
};

const cleanVideoAcceptanceDescription = (description: string | null): string => {
  if (!description) return 'Video Accepted';
  let cleaned = description.replace(/^Payment received\s*-\s*/i, '');
  cleaned = cleaned.replace(/Video\s*#\s*/gi, 'Video #');
  return cleaned || 'Video Accepted';
};

interface Props {
  courierId: string;
  onBack: () => void;
}

export function WalletPayments({ courierId, onBack }: Props) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [transactions, setTransactions] = useState<DisplayItem[]>([]);
  const [initialLoad, setInitialLoad] = useState(true);

  const fetchTransactions = useCallback(async () => {
    try {
      const { data: walletId, error: walletError } = await supabase
        .rpc('get_or_create_wallet', { p_wallet_type: 'customer', p_entity_id: courierId });
      if (walletError || !walletId) { console.error('Error getting wallet:', walletError); return; }

      // Get all ledger entries
      let entries: any[] = [];
      let from = 0;
      const pageSize = 1000;
      while (true) {
        const { data: batch, error: batchError } = await supabase
          .from('ledger_entries')
          .select('*')
          .or(`debit_account_id.eq.${walletId},credit_account_id.eq.${walletId}`)
          .order('entry_timestamp', { ascending: true })
          .range(from, from + pageSize - 1);
        if (batchError) { console.error('Error loading ledger entries:', batchError); return; }
        entries = entries.concat(batch || []);
        if (!batch || batch.length < pageSize) break;
        from += pageSize;
      }

      // Categorize entries
      const topUpEntries: any[] = [];
      const refundEntries: any[] = [];
      const videoAcceptanceEntries: any[] = [];
      const deliveryRequestEntries: any[] = [];
      const cashBackEntries: any[] = [];
      const referralCommissionEntries: any[] = [];
      const payoutEntries: any[] = [];
      const orderEntriesByRefId: Record<string, { entries: any[]; timestamp: string }> = {};
      const otherEntries: any[] = [];

      (entries || []).forEach((entry) => {
        const refType = entry.reference_type || '';
        if (refType === 'top_up' || refType === 'place_wallet_top_up') topUpEntries.push(entry);
        else if (refType === 'refund') refundEntries.push(entry);
        else if (refType === 'video_acceptance') videoAcceptanceEntries.push(entry);
        else if (refType === 'delivery_request') deliveryRequestEntries.push(entry);
        else if (refType === 'referral_commission') referralCommissionEntries.push(entry);
        else if (refType === 'payout') payoutEntries.push(entry);
        else if (refType === 'order') {
          const isCashBack = entry.description?.toLowerCase().includes('cash back') && entry.credit_account_id === walletId;
          if (isCashBack) cashBackEntries.push(entry);
          else {
            const refId = entry.reference_id;
            if (!orderEntriesByRefId[refId]) orderEntriesByRefId[refId] = { entries: [], timestamp: entry.entry_timestamp };
            orderEntriesByRefId[refId].entries.push(entry);
          }
        } else otherEntries.push(entry);
      });

      // Collect order IDs
      const orderIds: string[] = [...Object.keys(orderEntriesByRefId)];
      [...cashBackEntries, ...referralCommissionEntries, ...otherEntries].forEach(e => {
        if (e.reference_id && !orderIds.includes(e.reference_id)) orderIds.push(e.reference_id);
      });

      // Fetch order details
      let ordersMap: Record<string, any> = {};
      let ordersByShortId: Record<string, any> = {};
      if (orderIds.length > 0) {
        const { data: orders } = await supabase
          .from('order')
          .select('id, short_id, total, mode, place_id, order_number, subtotal, place:place_id (id, name, address_line_1, city, state)')
          .in('id', orderIds);
        (orders || []).forEach((order: any) => {
          ordersMap[order.id] = order;
          if (order.short_id) ordersByShortId[order.short_id.toUpperCase()] = order;
          if (order.order_number) ordersByShortId[order.order_number.toUpperCase()] = order;
        });
        const ordersWithoutPlace = Object.values(ordersMap).filter((o: any) => o.place_id && !o.place);
        if (ordersWithoutPlace.length > 0) {
          const missingPlaceIds = [...new Set(ordersWithoutPlace.map((o: any) => o.place_id))] as string[];
          const { data: places } = await supabase.from('place').select('id, name, address_line_1, city, state').in('id', missingPlaceIds);
          if (places) {
            const pm: Record<string, any> = {};
            places.forEach((p: any) => { pm[p.id] = p; });
            Object.keys(ordersMap).forEach(oid => {
              const o = ordersMap[oid];
              if (o.place_id && !o.place && pm[o.place_id]) {
                ordersMap[oid] = { ...o, place: pm[o.place_id] };
                if (o.short_id) ordersByShortId[o.short_id.toUpperCase()] = ordersMap[oid];
                if (o.order_number) ordersByShortId[o.order_number.toUpperCase()] = ordersMap[oid];
              }
            });
          }
        }
      }

      // Fetch delivery request details
      const deliveryRequestsMap: Record<string, any> = {};
      const deliveryRequestIds = deliveryRequestEntries.map(e => e.reference_id).filter(Boolean);
      if (deliveryRequestIds.length > 0) {
        const { data: drs } = await supabase
          .from('delivery_request')
          .select('id, delivery_number, place_id, pickup_address, dropoff_address, delivery_distance_km, delivery_distance_miles, place:place_id (id, name, address_line_1)')
          .in('id', deliveryRequestIds);
        (drs || []).forEach((dr: any) => { deliveryRequestsMap[dr.id] = dr; });
        const drsWithoutPlace = Object.values(deliveryRequestsMap).filter((dr: any) => dr.place_id && !dr.place);
        if (drsWithoutPlace.length > 0) {
          const missingIds = [...new Set(drsWithoutPlace.map((dr: any) => dr.place_id))] as string[];
          const { data: places } = await supabase.from('place').select('id, name, address_line_1').in('id', missingIds);
          if (places) {
            const pm: Record<string, any> = {};
            places.forEach((p: any) => { pm[p.id] = p; });
            Object.keys(deliveryRequestsMap).forEach(drId => {
              const dr = deliveryRequestsMap[drId];
              if (dr.place_id && !dr.place && pm[dr.place_id]) deliveryRequestsMap[drId] = { ...dr, place: pm[dr.place_id] };
            });
          }
        }
      }

      const findOrderByDescription = (description: string | null) => {
        const match = description?.match(/Order\s*#\s*([A-Z0-9]+)/i);
        if (match?.[1]) return ordersByShortId[match[1].toUpperCase()] || null;
        return null;
      };

      // Build display items with running balance
      let runningBalance = 0;
      const displayItems: DisplayItem[] = [];

      const allItems: any[] = [
        ...topUpEntries.map(e => ({ type: 'top_up', entry: e, timestamp: e.entry_timestamp })),
        ...refundEntries.map(e => ({ type: 'refund', entry: e, timestamp: e.entry_timestamp })),
        ...videoAcceptanceEntries.map(e => ({ type: 'video_acceptance', entry: e, timestamp: e.entry_timestamp })),
        ...deliveryRequestEntries.map(e => ({ type: 'delivery_request', entry: e, timestamp: e.entry_timestamp })),
        ...cashBackEntries.map(e => ({ type: 'cash_back', entry: e, timestamp: e.entry_timestamp })),
        ...referralCommissionEntries.map(e => ({ type: 'referral_commission', entry: e, timestamp: e.entry_timestamp })),
        ...payoutEntries.map(e => ({ type: 'payout', entry: e, timestamp: e.entry_timestamp })),
        ...otherEntries.map(e => ({ type: 'other', entry: e, timestamp: e.entry_timestamp })),
        ...Object.entries(orderEntriesByRefId).map(([orderId, group]) => ({ type: 'order', orderId, group, timestamp: group.timestamp })),
      ];

      allItems.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      allItems.forEach(item => {
        if (item.type === 'order') {
          const orderId = item.orderId;
          const group = item.group;
          const order = ordersMap[orderId];
          let netAmount = 0;
          group.entries.forEach((entry: any) => {
            const isCredit = entry.credit_account_id === walletId;
            netAmount += isCredit ? parseFloat(entry.amount) : -parseFloat(entry.amount);
          });
          runningBalance += netAmount;
          let orderShortId = order?.order_number || order?.short_id;
          if (!orderShortId && group.entries.length > 0) {
            const match = group.entries[0].description?.match(/Order\s*#\s*([A-Z0-9]+)/i);
            if (match?.[1]) orderShortId = match[1].toUpperCase();
          }
          if (!orderShortId) orderShortId = orderId.slice(-8).toUpperCase();
          let description = `Order #${orderShortId}`;
          if (order?.place) {
            description = `Order #${orderShortId} - ${order.place.name || 'Unknown Place'}`;
            if (order.place.address_line_1) description += ` (${order.place.address_line_1})`;
          }
          displayItems.push({ id: orderId, type: 'order', date: group.timestamp, amount: netAmount, description, balance: runningBalance, sortTime: new Date(group.timestamp).getTime() });
        } else {
          const entry = item.entry;
          const isCredit = entry.credit_account_id === walletId;
          const isDebit = entry.debit_account_id === walletId;
          if (isCredit && isDebit) return;
          const amount = isCredit ? parseFloat(entry.amount) : -parseFloat(entry.amount);
          runningBalance += amount;
          let description = entry.description || 'Transaction';

          if (item.type === 'top_up') description = cleanTopUpDescription(entry.description);
          else if (item.type === 'video_acceptance') description = cleanVideoAcceptanceDescription(entry.description);
          else if (item.type === 'delivery_request') {
            const dr = deliveryRequestsMap[entry.reference_id];
            if (dr) {
              const deliveryNumber = dr.delivery_number?.toUpperCase() || entry.reference_id?.slice(-8).toUpperCase() || 'Unknown';
              const placeName = dr.place?.name || 'Unknown Place';
              const pickupStreet = getStreetFromAddress(dr.pickup_address);
              const dropoffStreet = getStreetFromAddress(dr.dropoff_address);
              let distanceStr = '';
              if (dr.delivery_distance_km) distanceStr = `${parseFloat(dr.delivery_distance_km).toFixed(1)} km`;
              else if (dr.delivery_distance_miles) distanceStr = `${parseFloat(dr.delivery_distance_miles).toFixed(1)} mi`;
              description = `Delivery #${deliveryNumber} - ${placeName}`;
              if (pickupStreet && dropoffStreet) description += ` from ${pickupStreet} to ${dropoffStreet}`;
              else if (dropoffStreet) description += ` to ${dropoffStreet}`;
              if (distanceStr) description += ` (${distanceStr})`;
            }
          } else if (item.type === 'cash_back') {
            const order = ordersMap[entry.reference_id];
            const orderShortId = order?.order_number || order?.short_id || entry.reference_id?.slice(-8).toUpperCase() || 'Unknown';
            description = `Member Cash Back - Order #${orderShortId}`;
          } else if (item.type === 'referral_commission') {
            const order = ordersMap[entry.reference_id];
            const orderShortId = order?.order_number || order?.short_id || entry.reference_id?.slice(-8).toUpperCase() || 'Unknown';
            let commissionDetails = 'Referral Commission';
            const descParts = entry.description?.split(' - ');
            if (descParts?.length > 1) {
              const lastPart = descParts[descParts.length - 1];
              if (lastPart.includes('Referral Commission')) commissionDetails = lastPart;
            }
            const cleanedDetails = commissionDetails.replace(/🎉\s*/g, '').trim();
            description = `Order #${orderShortId}`;
            if (order?.place) description = `Order #${orderShortId} from ${order.place.name || 'Unknown Place'}${order.place.city ? ` (${order.place.city})` : ''}`;
            description += ` - ${cleanedDetails}`;
          } else if (item.type === 'other') {
            let order = ordersMap[entry.reference_id] || findOrderByDescription(description);
            if (order) {
              const orderShortId = order.order_number || order.short_id || entry.reference_id?.slice(-8).toUpperCase() || 'Unknown';
              const isSimple = /^Order\s*#\s*[A-Z0-9]+$/i.test(description?.trim() || '');
              if (isSimple && order.place) {
                description = `Order #${orderShortId} - ${order.place.name || 'Unknown Place'}`;
                if (order.place.address_line_1) description += ` (${order.place.address_line_1})`;
              }
            }
          }

          displayItems.push({ id: entry.id, type: item.type, date: entry.entry_timestamp, amount, description, balance: runningBalance, sortTime: new Date(entry.entry_timestamp).getTime() });
        }
      });

      displayItems.sort((a, b) => b.sortTime - a.sortTime);
      setTransactions(displayItems);
    } catch (err) {
      console.error('Error fetching transactions:', err);
    }
  }, [courierId]);

  React.useEffect(() => {
    setLoading(true);
    fetchTransactions().finally(() => { setLoading(false); setInitialLoad(false); });
  }, [fetchTransactions]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchTransactions();
    setRefreshing(false);
  }, [fetchTransactions]);

  const bgColor = isDark ? colors.background : '#f5f5f5';
  const cardBg = isDark ? colors.card : '#fff';
  const textColor = isDark ? colors.text : '#000';
  const subtextColor = isDark ? colors.text + '99' : '#666';

  const [expandedId, setExpandedId] = useState<string | null>(null);

  const renderTransaction = ({ item }: { item: DisplayItem }) => {
    const isPositive = item.amount >= 0;
    const isExpanded = expandedId === item.id;

    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => setExpandedId(isExpanded ? null : item.id)}
        style={[styles.txnCard, { backgroundColor: cardBg }]}
      >
        <View style={styles.txnRow}>
          <View style={styles.txnLeft}>
            <Text style={[styles.txnDescription, { color: textColor }]} numberOfLines={isExpanded ? undefined : 2}>
              {item.description}
            </Text>
            <Text style={[styles.txnDate, { color: subtextColor }]}>
              {formatDate(item.date)} at {formatTime(item.date)}
            </Text>
          </View>
          <View style={styles.txnRight}>
            <Text style={[styles.txnAmount, { color: isPositive ? '#16a34a' : textColor }]}>
              {isPositive ? '+' : '-'}{formatPrice(item.amount)}
            </Text>
            <Text style={[styles.txnBalance, { color: subtextColor }]}>
              Bal: ${item.balance.toFixed(2)}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: bgColor }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={onBack} style={styles.headerBackButton}>
          <ChevronLeft size={26} color={textColor} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: textColor }]}>Payments</Text>
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
            Your wallet transactions will appear here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={transactions}
          keyExtractor={(item) => item.id}
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
  txnCard: { padding: spacing.lg, borderRadius: layout.cardBorderRadius, ...layout.cardShadow },
  txnRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  txnLeft: { flex: 1, marginRight: spacing.md },
  txnDescription: { fontFamily: fontFamily.semiBold, fontSize: 14, marginBottom: 2 },
  txnDate: { fontFamily: fontFamily.regular, fontSize: 12 },
  txnRight: { alignItems: 'flex-end' },
  txnAmount: { fontFamily: fontFamily.bold, fontSize: 16, marginBottom: 2 },
  txnBalance: { fontFamily: fontFamily.regular, fontSize: 11 },
  separator: { height: spacing.sm },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxxl },
  emptyTitle: { fontFamily: fontFamily.bold, fontSize: 20, marginBottom: spacing.sm },
  emptySubtitle: { fontFamily: fontFamily.regular, fontSize: 15, textAlign: 'center' },
});
