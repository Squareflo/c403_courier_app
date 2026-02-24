import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronDown, LogOut, Star, User } from 'lucide-react-native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { fontFamily } from '../constants/typography';
import { spacing } from '../constants/spacing';
import SlideToOnline from '../components/ui/SlideToOnline';
import { getCourierPeriodStats } from '../services/api';
import { updateCourierOnlineStatus } from '../services/api';
import { supabase } from '../lib/supabase';
import { timeAgo } from '../utils/timeAgo';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const IS_SMALL_SCREEN = SCREEN_WIDTH < 500;

const CHOWLOCAL_LOGO = 'https://res.cloudinary.com/chowlocal/image/upload/v1757818122/chowlocal-logo.png';

// ─── Period Options ─────────────────────────────────────────────────────────

type PeriodOption = 'today' | 'last_7' | 'last_30' | 'all_time';

function getSinceDate(period: PeriodOption): string | undefined {
  const now = new Date();
  switch (period) {
    case 'today': {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      return start.toISOString();
    }
    case 'last_7': {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      d.setHours(0, 0, 0, 0);
      return d.toISOString();
    }
    case 'last_30': {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      d.setHours(0, 0, 0, 0);
      return d.toISOString();
    }
    case 'all_time':
      return undefined;
  }
}

function getPeriodLabel(period: PeriodOption): string {
  switch (period) {
    case 'today': return 'Today';
    case 'last_7': return 'Last 7 Days';
    case 'last_30': return 'Last 30 Days';
    case 'all_time': return 'All Time';
  }
}

function formatLargeNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

// ─── Star Rating Component ──────────────────────────────────────────────────

function StarRating({ rating, size = 16 }: { rating: number; size?: number }) {
  const stars = [];
  for (let i = 1; i <= 5; i++) {
    stars.push(
      <Star
        key={i}
        size={size}
        color={i <= Math.round(rating) ? '#FFD700' : '#555'}
        fill={i <= Math.round(rating) ? '#FFD700' : 'none'}
      />
    );
  }
  return <View style={{ flexDirection: 'row', gap: 2 }}>{stars}</View>;
}

// ─── Dashboard Screen ───────────────────────────────────────────────────────

export function DashboardScreen() {
  const { courier, signOut, refreshCourier } = useAuth();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const [refreshing, setRefreshing] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodOption>('last_30');
  const [showPeriodPicker, setShowPeriodPicker] = useState(false);
  const [isGoingOnline, setIsGoingOnline] = useState(false);

  // Stats
  const [stats, setStats] = useState({
    deliveries: 0,
    earned: 0,
    points: 0,
    avgPerDelivery: 0,
    totalKm: 0,
    avgKmPerDelivery: 0,
    earningsPerKm: 0,
  });

  // Recent deliveries with place info
  const [recentDeliveries, setRecentDeliveries] = useState<any[]>([]);
  const [recentPoints, setRecentPoints] = useState<any[]>([]);

  // Profile data
  const profileImage = courier?.profile_picture_url || null;
  const firstName = courier?.first_name || 'Courier';
  const communityRaw = courier?.community || '';
  const cityProvince = communityRaw.includes(',')
    ? communityRaw.split(',').slice(0, 2).map(s => s.trim()).join(', ')
    : communityRaw;

  // Placeholder ratings (no courier_reviews table yet)
  const courierRating = 0;
  const courierReviewCount = 0;

  // ── Data Loading ────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!courier?.id) return;
    try {
      const sinceDate = getSinceDate(selectedPeriod);
      const periodStats = await getCourierPeriodStats(courier.id, sinceDate);
      setStats(periodStats);

      // Load recent deliveries
      const { data: deliveries } = await supabase
        .from('delivery_request')
        .select('id, courier_earnings, delivered_at, points_earned, place:place_id(name, profile_picture_url)')
        .eq('courier_id', courier.id)
        .eq('status', 'delivered')
        .order('delivered_at', { ascending: false })
        .limit(10);
      setRecentDeliveries(deliveries || []);

      // Load recent points
      const { data: points } = await supabase
        .from('delivery_point')
        .select('id, points, created_at, delivery_request:delivery_request_id(place:place_id(name, profile_picture_url))')
        .eq('courier_id', courier.id)
        .order('created_at', { ascending: false })
        .limit(10);
      setRecentPoints(points || []);
    } catch (err) {
      console.error('Error loading dashboard data:', err);
    }
  }, [courier?.id, selectedPeriod]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadData(), refreshCourier()]);
    setRefreshing(false);
  };

  // ── Go Online ───────────────────────────────────────────────────────────

  const handleSlideToOnline = async () => {
    if (!courier?.id || isGoingOnline) return;
    setIsGoingOnline(true);
    try {
      await updateCourierOnlineStatus(courier.id, true);
      await refreshCourier();
      // TODO: Start location tracking, navigate to online mode
    } catch (err) {
      console.error('Error going online:', err);
    } finally {
      setIsGoingOnline(false);
    }
  };

  // ── Helpers ─────────────────────────────────────────────────────────────

  const getPlaceInfo = (item: any) => {
    const place = Array.isArray(item?.place) ? item.place[0] : item?.place;
    return {
      name: place?.name || 'Unknown',
      image: place?.profile_picture_url || null,
    };
  };

  const getNestedPlaceInfo = (item: any) => {
    const dr = Array.isArray(item?.delivery_request) ? item.delivery_request[0] : item?.delivery_request;
    const place = dr ? (Array.isArray(dr.place) ? dr.place[0] : dr.place) : null;
    return {
      name: place?.name || 'Unknown',
      image: place?.profile_picture_url || null,
    };
  };

  // ── Always dark theme for offline dashboard ─────────────────────────────

  const bg = '#000000';
  const cardBg = '#1E1E1E';
  const textColor = '#FFFFFF';
  const textSecColor = '#AAAAAA';

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#ec2227" />}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header: Logo + Dashboard + Logout ── */}
        <View style={styles.header}>
          <Image source={{ uri: CHOWLOCAL_LOGO }} style={styles.headerLogo} />
          <Text style={[styles.headerTitle, { color: textColor }]}>Dashboard</Text>
          <TouchableOpacity onPress={signOut} style={styles.headerAction}>
            <LogOut size={22} color={textColor} />
          </TouchableOpacity>
        </View>

        {/* ── Period Selector (right-aligned) ── */}
        <TouchableOpacity
          style={styles.periodRow}
          onPress={() => setShowPeriodPicker(true)}
          activeOpacity={0.7}
        >
          <Text style={[styles.periodText, { color: textSecColor }]}>{getPeriodLabel(selectedPeriod)}</Text>
          <ChevronDown size={14} color={textSecColor} />
        </TouchableOpacity>

        {/* ── Profile Card + Slide To Go Online ── */}
        <View style={[styles.profileSlideRow, IS_SMALL_SCREEN && styles.profileSlideRowStacked]}>
          {/* Profile Card */}
          <View style={[styles.profileCard, { backgroundColor: cardBg }, IS_SMALL_SCREEN && styles.profileCardFull]}>
            {profileImage ? (
              <Image source={{ uri: profileImage }} style={styles.profileImage} />
            ) : (
              <View style={[styles.profileImage, styles.profilePlaceholder]}>
                <User size={40} color="#666" />
              </View>
            )}
            <View style={styles.profileInfo}>
              <Text style={[styles.profileName, { color: textColor }]} numberOfLines={1}>{firstName}</Text>
              <Text style={[styles.profileCity, { color: textSecColor }]} numberOfLines={1}>{cityProvince}</Text>
              {courierReviewCount > 0 ? (
                <View style={styles.ratingRow}>
                  <Text style={[styles.ratingNumber, { color: '#27d20b' }]}>{courierRating.toFixed(1)}</Text>
                  <StarRating rating={courierRating} size={12} />
                  <Text style={[styles.reviewCount, { color: textSecColor }]}>{courierReviewCount} Reviews</Text>
                </View>
              ) : (
                <View style={styles.ratingRow}>
                  <Text style={{ fontFamily: fontFamily.regular, fontSize: 12, color: '#555' }}>No reviews yet</Text>
                </View>
              )}
            </View>
          </View>

          {/* Slide To Go Online */}
          <View style={[styles.slideContainer, IS_SMALL_SCREEN && styles.slideContainerFull]}>
            <SlideToOnline onSlideComplete={handleSlideToOnline} />
          </View>
        </View>

        {/* ── Stats Row (horizontally scrollable) ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.statsScrollContent}
          style={styles.statsScroll}
        >
          <View style={[styles.statCard, { backgroundColor: cardBg }]}>
            <Text style={[styles.statValue, { color: textColor }]}>{formatLargeNumber(stats.points)}</Text>
            <Text style={[styles.statLabel, { color: textSecColor }]}>Points</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: cardBg }]}>
            <Text style={[styles.statValue, { color: textColor }]}>{stats.deliveries}</Text>
            <Text style={[styles.statLabel, { color: textSecColor }]}>Deliveries</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: cardBg }]}>
            <Text style={[styles.statValue, { color: textColor }]}>${formatLargeNumber(Math.round(stats.earned))}</Text>
            <Text style={[styles.statLabel, { color: textSecColor }]}>Earnings</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: cardBg }]}>
            <Text style={[styles.statValue, { color: textColor }]}>${stats.avgPerDelivery.toFixed(0)}</Text>
            <Text style={[styles.statLabel, { color: textSecColor }]}>Per Delivery</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: cardBg }]}>
            <Text style={[styles.statValue, { color: textColor }]}>{Math.round(stats.totalKm)}</Text>
            <Text style={[styles.statLabel, { color: textSecColor }]}>KM</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: cardBg }]}>
            <Text style={[styles.statValue, { color: textColor }]}>{stats.avgKmPerDelivery.toFixed(1)}</Text>
            <Text style={[styles.statLabel, { color: textSecColor }]}>Per Delivery</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: cardBg }]}>
            <Text style={[styles.statValue, { color: textColor }]}>${stats.earningsPerKm.toFixed(1)}</Text>
            <Text style={[styles.statLabel, { color: textSecColor }]}>Per KM</Text>
          </View>
        </ScrollView>

        {/* ── Latest Reviews Section ── */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: textColor }]}>Latest Reviews</Text>
          <TouchableOpacity>
            <Text style={[styles.viewAllText, { color: textSecColor }]}>View All</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.horizontalListContent}
        >
          {/* Placeholder review cards — will populate when courier_reviews table exists */}
          {[1, 2, 3].map((i) => (
            <View key={i} style={[styles.reviewCard, { backgroundColor: cardBg }]}>
              <Text style={[styles.reviewText, { color: textSecColor }]} numberOfLines={3}>
                Vivamus lacinia pretium dolor sit amet male...
              </Text>
              <View style={{ marginVertical: 8 }}>
                <StarRating rating={4} size={24} />
              </View>
              <Text style={[styles.reviewMeta, { color: textSecColor }]}>
                3 Days Ago by <Text style={{ fontFamily: fontFamily.bold, color: textColor }}>Amanda</Text>
              </Text>
            </View>
          ))}
        </ScrollView>

        {/* ── Recent Points Section ── */}
        {recentPoints.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: textColor }]}>Recent Points</Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalListContent}
            >
              {recentPoints.map((item) => {
                const place = getNestedPlaceInfo(item);
                return (
                  <View key={item.id} style={[styles.recentCard, { backgroundColor: cardBg }]}>
                    {place.image ? (
                      <Image source={{ uri: place.image }} style={styles.recentCardImage} />
                    ) : (
                      <View style={[styles.recentCardImage, { backgroundColor: '#333', alignItems: 'center', justifyContent: 'center' }]}>
                        <User size={20} color="#666" />
                      </View>
                    )}
                    <Text style={[styles.recentCardName, { color: textColor }]} numberOfLines={1}>{place.name}</Text>
                    <Text style={[styles.recentCardTime, { color: textSecColor }]}>{timeAgo(item.created_at)}</Text>
                    <Text style={[styles.recentCardValue, { color: '#27d20b' }]}>+{item.points} pts</Text>
                  </View>
                );
              })}
            </ScrollView>
          </>
        )}

        {/* ── Recent Deliveries Section ── */}
        {recentDeliveries.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: textColor }]}>Recent Deliveries</Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalListContent}
            >
              {recentDeliveries.map((item) => {
                const place = getPlaceInfo(item);
                return (
                  <View key={item.id} style={[styles.recentCard, { backgroundColor: cardBg }]}>
                    {place.image ? (
                      <Image source={{ uri: place.image }} style={styles.recentCardImage} />
                    ) : (
                      <View style={[styles.recentCardImage, { backgroundColor: '#333', alignItems: 'center', justifyContent: 'center' }]}>
                        <User size={20} color="#666" />
                      </View>
                    )}
                    <Text style={[styles.recentCardName, { color: textColor }]} numberOfLines={1}>{place.name}</Text>
                    <Text style={[styles.recentCardTime, { color: textSecColor }]}>{timeAgo(item.delivered_at)}</Text>
                    <Text style={[styles.recentCardValue, { color: '#27d20b' }]}>${(item.courier_earnings || 0).toFixed(2)}</Text>
                  </View>
                );
              })}
            </ScrollView>
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── Period Picker Modal ── */}
      <Modal
        visible={showPeriodPicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowPeriodPicker(false)}
      >
        <View style={[styles.pickerContainer, { backgroundColor: cardBg }]}>
          <View style={styles.pickerHeader}>
            <Text style={[styles.pickerTitle, { color: textColor }]}>Select Period</Text>
            <TouchableOpacity onPress={() => setShowPeriodPicker(false)}>
              <Text style={{ fontFamily: fontFamily.bold, fontSize: 16, color: textSecColor }}>Done</Text>
            </TouchableOpacity>
          </View>
          {(['today', 'last_7', 'last_30', 'all_time'] as PeriodOption[]).map((period) => {
            const isActive = selectedPeriod === period;
            return (
              <TouchableOpacity
                key={period}
                style={[styles.periodOption, isActive && { backgroundColor: textColor }]}
                onPress={() => {
                  setSelectedPeriod(period);
                  setShowPeriodPicker(false);
                }}
              >
                <Text style={[styles.periodOptionText, { color: isActive ? bg : textColor }]}>
                  {getPeriodLabel(period)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerLogo: {
    width: 44,
    height: 44,
    borderRadius: 8,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fontFamily.bold,
    fontSize: 20,
  },
  headerAction: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Period selector
  periodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingVertical: 8,
    gap: 4,
  },
  periodText: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
  },

  // Profile + Slide row
  profileSlideRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    gap: 12,
    marginBottom: spacing.lg,
  },
  profileSlideRowStacked: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  profileCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 14,
    gap: 12,
  },
  profileCardFull: {
    flex: undefined,
    width: '100%',
  },
  profileImage: {
    width: 72,
    height: 72,
    borderRadius: 36,
  },
  profilePlaceholder: {
    backgroundColor: '#333',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInfo: {
    flex: 1,
    gap: 2,
  },
  profileName: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
  },
  profileCity: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  ratingNumber: {
    fontFamily: fontFamily.bold,
    fontSize: 13,
  },
  reviewCount: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
  },

  // Slide container
  slideContainer: {
    width: SCREEN_WIDTH * 0.42,
    maxWidth: 260,
  },
  slideContainerFull: {
    width: '100%',
    maxWidth: undefined,
  },

  // Stats
  statsScroll: {
    marginBottom: spacing.lg,
  },
  statsScrollContent: {
    paddingHorizontal: spacing.lg,
    gap: 10,
  },
  statCard: {
    minWidth: 100,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    fontFamily: fontFamily.bold,
    fontSize: 20,
  },
  statLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    marginTop: 2,
  },

  // Section headers
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
  },
  viewAllText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
  },

  // Horizontal list
  horizontalListContent: {
    paddingHorizontal: spacing.lg,
    gap: 12,
  },

  // Review cards
  reviewCard: {
    width: SCREEN_WIDTH * 0.65,
    maxWidth: 340,
    borderRadius: 12,
    padding: 16,
  },
  reviewText: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    fontStyle: 'italic',
  },
  reviewMeta: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
  },

  // Recent cards (points & deliveries)
  recentCard: {
    width: 140,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    gap: 6,
  },
  recentCardImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  recentCardName: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
    textAlign: 'center',
  },
  recentCardTime: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
  },
  recentCardValue: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
  },

  // Period picker modal
  pickerContainer: {
    flex: 1,
    paddingTop: Platform.OS === 'ios' ? 20 : 16,
    paddingHorizontal: 20,
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  pickerTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 20,
  },
  periodOption: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginBottom: 4,
  },
  periodOptionText: {
    fontFamily: fontFamily.regular,
    fontSize: 16,
  },
});
