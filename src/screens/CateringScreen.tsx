import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Search, UtensilsCrossed, X } from 'lucide-react-native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { fontFamily } from '../constants/typography';
import { supabase } from '../lib/supabase';

const PAGE_SIZE = 20;

interface CateringRequest {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone_number: string;
  event_date: string;
  event_time: string | null;
  event_venue: string;
  number_of_guests: number;
  budget_per_guest: string | null;
  occasion: string;
  more_information: string;
  status: string;
  created_at: string;
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

function formatEventDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getStatusColor(status: string): { bg: string; text: string } {
  switch (status.toLowerCase()) {
    case 'new':
      return { bg: '#EFF6FF', text: '#2563EB' };
    case 'confirmed':
    case 'accepted':
      return { bg: '#F0FDF4', text: '#16A34A' };
    case 'cancelled':
    case 'rejected':
      return { bg: '#FEF2F2', text: '#DC2626' };
    case 'completed':
      return { bg: '#F0FDF4', text: '#16A34A' };
    default:
      return { bg: '#F3F4F6', text: '#6B7280' };
  }
}

interface CateringScreenProps {
  onBack?: () => void;
}

export function CateringScreen({ onBack }: CateringScreenProps) {
  const { courier } = useAuth();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const [requests, setRequests] = useState<CateringRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [placeIds, setPlaceIds] = useState<string[]>([]);

  // Fetch the courier's associated place IDs
  useEffect(() => {
    async function fetchPlaceIds() {
      if (!courier?.id) return;
      const { data, error } = await supabase
        .from('customer')
        .select('my_places, place_owner_for, place_manager_for, place_staff_for')
        .eq('id', courier.id)
        .single();

      if (!error && data) {
        const ids = new Set<string>();
        [data.my_places, data.place_owner_for, data.place_manager_for, data.place_staff_for].forEach((arr: string[] | null) => {
          if (Array.isArray(arr)) arr.forEach((id: string) => ids.add(id));
        });
        setPlaceIds(Array.from(ids));
      } else {
        setPlaceIds([]);
        setLoading(false);
      }
    }
    fetchPlaceIds();
  }, [courier?.id]);

  const loadRequests = useCallback(async (offset: number = 0) => {
    if (placeIds.length === 0) {
      setLoading(false);
      return;
    }

    try {
      if (offset === 0) setLoading(true);
      else setLoadingMore(true);

      const { data, error } = await supabase
        .from('catering_quote_request')
        .select('id, first_name, last_name, email, phone_number, event_date, event_time, event_venue, number_of_guests, budget_per_guest, occasion, more_information, status, created_at, place:place_id(name, profile_picture_url)')
        .in('place_id', placeIds)
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      if (!error && data) {
        const mapped = data.map((d: any) => ({
          ...d,
          place: Array.isArray(d.place) ? d.place[0] : d.place,
        }));

        if (offset === 0) {
          setRequests(mapped);
        } else {
          setRequests((prev) => [...prev, ...mapped]);
        }
        setHasMore(data.length === PAGE_SIZE);
      }
    } catch (err) {
      console.error('[CateringScreen] Error loading requests:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [placeIds]);

  useEffect(() => {
    if (placeIds.length > 0) {
      loadRequests(0);
    }
  }, [loadRequests, placeIds]);

  const handleLoadMore = () => {
    if (!loadingMore && hasMore) {
      loadRequests(requests.length);
    }
  };

  const renderItem = ({ item }: { item: CateringRequest }) => {
    const place = item.place;
    const customerName = `${item.first_name} ${item.last_name}`.trim();
    const statusColors = getStatusColor(item.status);

    return (
      <View style={[styles.card, { backgroundColor: colors.card }]}>
        {place?.profile_picture_url ? (
          <Image source={{ uri: place.profile_picture_url }} style={styles.cardImage} resizeMode="cover" />
        ) : (
          <View style={[styles.cardImage, { backgroundColor: colors.surfaceTertiary, alignItems: 'center', justifyContent: 'center' }]}>
            <UtensilsCrossed size={24} color={colors.textMuted} />
          </View>
        )}
        <View style={styles.cardContent}>
          <View style={styles.cardTopRow}>
            <Text style={[styles.cardName, { color: colors.text }]} numberOfLines={1}>
              {customerName}
            </Text>
            <View style={[styles.statusBadge, { backgroundColor: statusColors.bg }]}>
              <Text style={[styles.statusText, { color: statusColors.text }]}>
                {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
              </Text>
            </View>
          </View>
          <Text style={[styles.cardPlaceName, { color: colors.text }]} numberOfLines={1}>
            {place?.name || 'Unknown Place'}
          </Text>
          <View style={styles.cardMeta}>
            <Text style={[styles.cardMetaText, { color: colors.textSecondary }]}>{timeAgo(item.created_at)}</Text>
            <Text style={[styles.cardMetaText, { color: colors.textSecondary }]}>{formatEventDate(item.event_date)}</Text>
            <Text style={[styles.cardMetaText, { color: colors.textSecondary }]}>{item.number_of_guests} Guests</Text>
            <Text style={[styles.cardMetaText, { color: colors.textSecondary }]}>{item.occasion}</Text>
          </View>
        </View>
      </View>
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
    <View style={[styles.container, { backgroundColor: isDark ? colors.background : colors.backgroundTertiary }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={onBack} style={styles.headerBackButton}>
          <ChevronLeft size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Catering</Text>
        <TouchableOpacity style={styles.headerAction} onPress={() => { setShowSearch(s => !s); if (showSearch) setSearchQuery(''); }}>
          {showSearch ? <X size={22} color={colors.text} /> : <Search size={22} color={colors.text} />}
        </TouchableOpacity>
      </View>

      {showSearch && (
        <View style={[styles.searchContainer, { backgroundColor: isDark ? colors.background : colors.backgroundTertiary }]}>
          <TextInput
            style={[styles.searchInput, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]}
            placeholder="Search by name, venue, or occasion..."
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
      ) : placeIds.length === 0 ? (
        <View style={styles.emptyContainer}>
          <UtensilsCrossed size={48} color={colors.textMuted} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No Places Linked</Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            You don't have any places associated with your account yet.
          </Text>
        </View>
      ) : requests.length === 0 ? (
        <View style={styles.emptyContainer}>
          <UtensilsCrossed size={48} color={colors.textMuted} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No Catering Requests</Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Catering requests from your customers will appear here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={searchQuery.trim() ? requests.filter((r) => {
            const q = searchQuery.toLowerCase();
            const name = `${r.first_name} ${r.last_name}`.toLowerCase();
            const venue = (r.event_venue || '').toLowerCase();
            const occasion = (r.occasion || '').toLowerCase();
            const placeName = (r.place?.name || '').toLowerCase();
            return name.includes(q) || venue.includes(q) || occasion.includes(q) || placeName.includes(q);
          }) : requests}
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
  headerAction: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
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
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
    marginTop: 4,
  },
  emptyText: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    textAlign: 'center',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 40,
    gap: 10,
  },
  card: {
    flexDirection: 'row',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
    borderRadius: 12,
  },
  cardImage: {
    overflow: 'hidden',
    width: 100,
    height: '100%',
    minHeight: 90,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
  },
  cardContent: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    justifyContent: 'center',
    gap: 3,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardName: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
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
