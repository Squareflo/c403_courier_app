import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Search, User, X } from 'lucide-react-native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { fontFamily } from '../constants/typography';
import { spacing } from '../constants/spacing';
import { supabase } from '../lib/supabase';
import { formatDistance } from '../utils/distance';

const PAGE_SIZE = 20;

interface DeliveryItem {
  id: string;
  delivery_number: string | null;
  courier_earnings: number | null;
  points_earned: number | null;
  delivery_distance_km: number | null;
  delivered_at: string | null;
  dropoff_address: string | null;
  place: { name: string; profile_picture_url: string | null } | null;
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '';
  const now = new Date();
  const d = new Date(dateStr);
  const diffMs = now.getTime() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} Min Ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h Ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d Ago`;
  const months = Math.floor(days / 30);
  return `${months}mo Ago`;
}

interface DeliveriesScreenProps {
  onDeliveryPress?: (deliveryId: string) => void;
}

export function DeliveriesScreen({ onDeliveryPress }: DeliveriesScreenProps) {
  const { courier } = useAuth();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const distUnit = courier?.preferred_distance_unit;

  const [deliveries, setDeliveries] = useState<DeliveryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  const profileImage = courier?.profile_picture_url || null;

  const loadDeliveries = useCallback(async (offset: number = 0) => {
    if (!courier?.id) return;

    try {
      if (offset === 0) setLoading(true);
      else setLoadingMore(true);

      const { data, error } = await supabase
        .from('delivery_request')
        .select('id, delivery_number, courier_earnings, points_earned, delivery_distance_km, delivered_at, dropoff_address, place:place_id(name, profile_picture_url)')
        .eq('courier_id', courier.id)
        .eq('status', 'delivered')
        .order('delivered_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      if (!error && data) {
        const mapped = data.map((d: any) => ({
          ...d,
          place: Array.isArray(d.place) ? d.place[0] : d.place,
        }));

        if (offset === 0) {
          setDeliveries(mapped);
        } else {
          setDeliveries((prev) => [...prev, ...mapped]);
        }
        setHasMore(data.length === PAGE_SIZE);
      }
    } catch (err) {
      console.error('[DeliveriesScreen] Error loading deliveries:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [courier?.id]);

  useEffect(() => {
    loadDeliveries(0);
  }, [loadDeliveries]);

  const handleLoadMore = () => {
    if (!loadingMore && hasMore) {
      loadDeliveries(deliveries.length);
    }
  };

  const renderItem = ({ item }: { item: DeliveryItem }) => {
    const place = item.place;
    const deliveryNum = item.delivery_number || item.id?.slice(-6).toUpperCase();

    return (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: colors.card }]}
        onPress={() => onDeliveryPress?.(item.id)}
        activeOpacity={0.7}
      >
        {place?.profile_picture_url ? (
          <Image source={{ uri: place.profile_picture_url }} style={styles.cardImage} resizeMode="cover" />
        ) : (
          <View style={[styles.cardImage, { backgroundColor: colors.surfaceTertiary, alignItems: 'center', justifyContent: 'center' }]}>
            <User size={24} color={colors.textMuted} />
          </View>
        )}
        <View style={styles.cardContent}>
          <Text style={[styles.cardDeliveryNum, { color: colors.text }]} numberOfLines={1}>
            #{deliveryNum}
          </Text>
          <Text style={[styles.cardPlaceName, { color: colors.text }]} numberOfLines={1}>
            {place?.name || 'Unknown Place'}
          </Text>
          <View style={styles.cardMeta}>
            <Text style={[styles.cardMetaText, { color: colors.textSecondary }]}>{timeAgo(item.delivered_at)}</Text>
            <Text style={[styles.cardMetaText, { color: colors.textSecondary }]}>{formatDistance(item.delivery_distance_km, distUnit)}</Text>
            <Text style={[styles.cardMetaText, { color: colors.textSecondary }]}>${(item.courier_earnings || 0).toFixed(2)}</Text>
            <Text style={[styles.cardMetaText, { color: colors.textSecondary }]}>{Math.round(item.points_earned || 0)} Points</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderFooter = () => {
    if (!loadingMore) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color={colors.textMuted} />
      </View>
    );
  };

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
        <Text style={[styles.headerTitle, { color: colors.text }]}>Deliveries</Text>
        <TouchableOpacity style={styles.headerAction} onPress={() => { setShowSearch(s => !s); if (showSearch) setSearchQuery(''); }}>
          {showSearch ? <X size={22} color={colors.text} /> : <Search size={22} color={colors.text} />}
        </TouchableOpacity>
      </View>



      {showSearch && (
        <View style={[styles.searchContainer, { backgroundColor: colors.background }]}>
          <TextInput
            style={[styles.searchInput, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]}
            placeholder="Search by place name or delivery #..."
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
          />
        </View>
      )}

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.textMuted} />
        </View>
      ) : deliveries.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No deliveries yet</Text>
        </View>
      ) : (
        <FlatList
          data={searchQuery.trim() ? deliveries.filter((d) => {
            const q = searchQuery.toLowerCase();
            const place = d.place?.name?.toLowerCase() || '';
            const num = (d.delivery_number || '').toLowerCase();
            const addr = (d.dropoff_address || '').toLowerCase();
            return place.includes(q) || num.includes(q) || addr.includes(q);
          }) : deliveries}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={renderFooter}
          showsVerticalScrollIndicator={false}
        />
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
  headerAction: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    height: 2,
    width: '100%',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontFamily: fontFamily.regular,
    fontSize: 16,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 40,
    gap: 10,
  },
  card: {
    flexDirection: 'row',
    borderRadius: 12,
    overflow: 'hidden',
  },
  cardImage: {
    width: 100,
    height: '100%',
    minHeight: 90,
  },
  cardContent: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    justifyContent: 'center',
    gap: 3,
  },
  cardDeliveryNum: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
  },
  cardPlaceName: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
  },
  cardMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 4,
  },
  cardMetaText: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  searchInput: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  footerLoader: {
    paddingVertical: 20,
    alignItems: 'center',
  },
});
