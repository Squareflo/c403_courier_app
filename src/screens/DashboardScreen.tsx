import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { AlertTriangle, ChevronDown, Clock, LogOut, Moon, Star, Sun, User, X } from 'lucide-react-native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { fontFamily } from '../constants/typography';
import { convertDistance, getDistanceUnit, getPerDistanceLabel, getPerDeliveryDistanceLabel } from '../utils/distance';
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

interface DashboardScreenProps {
  onWentOnline?: () => void;
  onDeliveryPress?: (deliveryId: string) => void;
  /** If provided, shows a stripped-down "application pending" dashboard */
  applicationData?: any;
}

export function DashboardScreen({ onWentOnline, onDeliveryPress, applicationData }: DashboardScreenProps) {
  const { courier, signOut, refreshCourier } = useAuth();
  const { colors, isDark, toggleTheme } = useTheme();
  const insets = useSafeAreaInsets();

  const isApplicationMode = !!applicationData;

  const [refreshing, setRefreshing] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodOption>('last_30');
  const [showPeriodPicker, setShowPeriodPicker] = useState(false);
  const [isGoingOnline, setIsGoingOnline] = useState(false);
  const [showGoOnlineModal, setShowGoOnlineModal] = useState(false);
  const [minSessionMinutes, setMinSessionMinutes] = useState(60);

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
  const [courierReviews, setCourierReviews] = useState<any[]>([]);

  const [freshProfilePic, setFreshProfilePic] = useState<string | null>(null);
  const [cityProvince, setCityProvince] = useState('');

  // In application mode, fetch fresh profile picture from DB since auth context may be stale
  useEffect(() => {
    if (!isApplicationMode || !courier?.id) return;
    (async () => {
      const { data } = await supabase
        .from('customer')
        .select('profile_picture_url')
        .eq('id', courier.id)
        .single();
      if (data?.profile_picture_url) setFreshProfilePic(data.profile_picture_url);
    })();
  }, [isApplicationMode, courier?.id]);

  // Fetch city name and min session duration for display
  useEffect(() => {
    const cityId = courier?.city_id;
    if (!cityId) {
      if (isApplicationMode && applicationData?.community) {
        const raw = applicationData.community;
        setCityProvince(raw.includes(',') ? raw.split(',').slice(0, 2).map((s: string) => s.trim()).join(', ') : raw);
      }
      return;
    }
    (async () => {
      const { data } = await supabase
        .from('city')
        .select('name, min_courier_session_minutes, state_province:state_province_id(code)')
        .eq('id', cityId)
        .single();
      if (data) {
        const sp = data.state_province as any;
        setCityProvince(sp?.code ? `${data.name}, ${sp.code}` : data.name || '');
        if (data.min_courier_session_minutes) {
          setMinSessionMinutes(data.min_courier_session_minutes);
        }
      }
    })();
  }, [courier?.city_id, isApplicationMode, applicationData?.community]);

  // Profile data
  const profileImage = (isApplicationMode ? freshProfilePic : null) || courier?.profile_picture_url || null;
  const firstName = isApplicationMode ? (applicationData.first_name || 'Courier') : (courier?.first_name || 'Courier');
  const lastName = isApplicationMode ? (applicationData.last_name || '') : (courier?.last_name || '');
  const fullName = lastName ? `${firstName} ${lastName}` : firstName;
  const distUnit = courier?.preferred_distance_unit;

  // Computed from real courier_review data
  const courierReviewCount = courierReviews.length;
  const courierRating = courierReviewCount > 0
    ? courierReviews.reduce((sum: number, r: any) => sum + r.rating, 0) / courierReviewCount
    : 0;

  // Application status
  const appStatusLabel = applicationData?.status === 'approved' ? 'APPROVED' : applicationData?.status === 'rejected' ? 'APPLICATION REJECTED' : 'APPLICATION PENDING';
  const appStatusColor = applicationData?.status === 'approved' ? '#22C55E' : applicationData?.status === 'rejected' ? '#EF4444' : '#F97316';

  // ── Data Loading ────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!courier?.id || isApplicationMode) return;
    try {
      const sinceDate = getSinceDate(selectedPeriod);
      const periodStats = await getCourierPeriodStats(courier.id, sinceDate);
      setStats(periodStats);

      // Load recent deliveries
      const { data: deliveries } = await supabase
        .from('delivery_request')
        .select('id, courier_earnings, delivered_at, points_earned, place:place_id(name, profile_picture_url, cover_image_url, photos)')
        .eq('courier_id', courier.id)
        .eq('status', 'delivered')
        .order('delivered_at', { ascending: false })
        .limit(10);
      setRecentDeliveries(deliveries || []);

      // Load recent points from ledger (includes both earnings and penalties)
      const { data: points } = await supabase
        .from('courier_points_ledger')
        .select('id, points, reason, created_at, delivery_request:delivery_request_id(place:place_id(name, profile_picture_url, cover_image_url, photos))')
        .eq('courier_id', courier.id)
        .order('created_at', { ascending: false })
        .limit(10);
      setRecentPoints(points || []);

      // Load courier reviews
      const { data: reviews } = await supabase
        .from('courier_review')
        .select('id, rating, review_text, created_at, customer:customer_id(first_name)')
        .eq('courier_id', courier.id)
        .order('created_at', { ascending: false })
        .limit(10);
      setCourierReviews(reviews || []);
    } catch (err) {
      console.error('Error loading dashboard data:', err);
    }
  }, [courier?.id, selectedPeriod, isApplicationMode]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadData(), refreshCourier()]);
    setRefreshing(false);
  };

  // ── Go Online ───────────────────────────────────────────────────────────

  const handleSlideToOnline = () => {
    if (!courier?.id || isGoingOnline) return;
    setShowGoOnlineModal(true);
  };

  const confirmGoOnline = async () => {
    setShowGoOnlineModal(false);
    if (!courier?.id || isGoingOnline) return;
    setIsGoingOnline(true);
    try {
      await updateCourierOnlineStatus(courier.id, true);
      await refreshCourier();
      onWentOnline?.();
    } catch (err: any) {
      console.error('Error going online:', err);
      Alert.alert('Cannot Go Online', err.message || 'An error occurred. Please try again later.');
    } finally {
      setIsGoingOnline(false);
    }
  };

  // ── Helpers ─────────────────────────────────────────────────────────────

  const getPlaceInfo = (item: any) => {
    const place = Array.isArray(item?.place) ? item.place[0] : item?.place;
    return {
      name: place?.name || 'Unknown',
      image: place?.profile_picture_url || place?.cover_image_url || (place?.photos && place.photos.length > 0 ? place.photos[0] : null),
    };
  };

  const getNestedPlaceInfo = (item: any) => {
    const dr = Array.isArray(item?.delivery_request) ? item.delivery_request[0] : item?.delivery_request;
    const place = dr ? (Array.isArray(dr.place) ? dr.place[0] : dr.place) : null;
    return {
      name: place?.name || 'Unknown',
      image: place?.profile_picture_url || place?.cover_image_url || (place?.photos && place.photos.length > 0 ? place.photos[0] : null),
    };
  };

  // ── Handle delivery card press ──────────────────────────────────────────

  const handleDeliveryPress = (deliveryId: string) => {
    if (onDeliveryPress) {
      onDeliveryPress(deliveryId);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <View style={[styles.screen, { backgroundColor: colors.backgroundSecondary }]}>
      {/* ── Header (matches manager app exactly) ── */}
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.backgroundSecondary, borderBottomWidth: 0 }]}>
        <Image source={{ uri: CHOWLOCAL_LOGO }} style={styles.logo} resizeMode="contain" />
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <View style={[styles.headerTitleWrap, { paddingTop: insets.top + 8 }]}>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Dashboard</Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          {!isApplicationMode && (
            <TouchableOpacity onPress={toggleTheme} hitSlop={8} style={styles.headerButton}>
              {isDark ? <Sun size={22} color={colors.text} /> : <Moon size={22} color={colors.text} />}
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Profile Card (RestaurantCard style — image touches left/top/bottom) ── */}
        <View style={[styles.profileCardOuter, { backgroundColor: colors.card }]}>
          <View style={styles.profileCardInner}>
            {profileImage ? (
              <Image source={{ uri: profileImage }} style={styles.profileImage} resizeMode="cover" />
            ) : (
              <View style={[styles.profileImagePlaceholder, { backgroundColor: colors.surfaceTertiary }]}>
                <User size={40} color={colors.textMuted} />
              </View>
            )}
            <View style={styles.profileInfo}>
              <Text style={[styles.profileName, { color: colors.text }]} numberOfLines={1}>{fullName}</Text>
              <Text style={[styles.profileCity, { color: colors.textSecondary }]} numberOfLines={1}>{cityProvince}</Text>
              {isApplicationMode ? (
                <View style={[styles.appBadge, { backgroundColor: appStatusColor }]}>
                  <Text style={styles.appBadgeText}>{appStatusLabel}</Text>
                </View>
              ) : courierReviewCount > 0 ? (
                <View style={styles.ratingRow}>
                  <Text style={[styles.ratingNumber, { color: '#FFD700' }]}>{courierRating.toFixed(1)}</Text>
                  <StarRating rating={courierRating} size={12} />
                  <Text style={[styles.reviewCount, { color: colors.textSecondary }]}>{courierReviewCount} Reviews</Text>
                </View>
              ) : (
                <View style={styles.ratingRow}>
                  <Text style={{ fontFamily: fontFamily.regular, fontSize: 12, color: colors.textMuted }}>No reviews yet</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* ── Application mode: stop here — no stats, no slide, no deliveries ── */}
        {isApplicationMode && <View style={{ height: 40 }} />}

        {/* ── Normal mode content below ── */}
        {!isApplicationMode && (
          <>
            {/* ── Slide To Go Online ── */}
            <View style={styles.slideContainer}>
              <SlideToOnline onSlideComplete={handleSlideToOnline} />
            </View>

            {/* ── My Stats heading + Period selector ── */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 10 }}>
              <Text style={[styles.sectionTitle, { color: colors.text, fontFamily: fontFamily.regular }]}>My Stats</Text>
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                onPress={() => setShowPeriodPicker(true)}
                activeOpacity={0.7}
                hitSlop={8}
              >
                <Text style={[styles.periodLabel, { color: colors.textSecondary }]}>{getPeriodLabel(selectedPeriod)}</Text>
                <ChevronDown size={14} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* ── Stats Row (horizontally scrollable) ── */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.statsScrollContent}
              style={styles.statsScroll}
            >
              <View style={[styles.statCard, { backgroundColor: colors.card }]}>
                <Text style={[styles.statValue, { color: colors.text }]}>{formatLargeNumber(stats.points)}</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Points</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: colors.card }]}>
                <Text style={[styles.statValue, { color: colors.text }]}>{stats.deliveries}</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Deliveries</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: colors.card }]}>
                <Text style={[styles.statValue, { color: colors.text }]}>${formatLargeNumber(Math.round(stats.earned))}</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Earnings</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: colors.card }]}>
                <Text style={[styles.statValue, { color: colors.text }]}>${stats.avgPerDelivery.toFixed(0)}</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Per Delivery</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: colors.card }]}>
                <Text style={[styles.statValue, { color: colors.text }]}>{convertDistance(stats.totalKm, distUnit)}</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{getDistanceUnit(distUnit)}</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: colors.card }]}>
                <Text style={[styles.statValue, { color: colors.text }]}>{convertDistance(stats.avgKmPerDelivery, distUnit)}</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{getPerDeliveryDistanceLabel(distUnit)}</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: colors.card }]}>
                <Text style={[styles.statValue, { color: colors.text }]}>${(stats.totalKm > 0 ? stats.earned / Number(convertDistance(stats.totalKm, distUnit, 2)) : 0).toFixed(1)}</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{getPerDistanceLabel(distUnit)}</Text>
              </View>
            </ScrollView>

            {/* ── Recent Deliveries Section ── */}
            {recentDeliveries.length > 0 && (
              <>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { color: colors.text, fontFamily: fontFamily.regular }]}>Recent Deliveries</Text>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.horizontalListContent}
                >
                  {recentDeliveries.map((item) => {
                    const place = getPlaceInfo(item);
                    return (
                      <TouchableOpacity
                        key={item.id}
                        style={[styles.deliveryCard, { backgroundColor: colors.card, ...(recentDeliveries.length === 1 ? { width: SCREEN_WIDTH - 32, maxWidth: SCREEN_WIDTH - 32 } : {}) }]}
                        onPress={() => handleDeliveryPress(item.id)}
                        activeOpacity={0.7}
                      >
                        {place.image ? (
                          <Image source={{ uri: place.image }} style={styles.deliveryCardImage} />
                        ) : (
                          <View style={[styles.deliveryCardImage, { backgroundColor: colors.surfaceTertiary, alignItems: 'center', justifyContent: 'center' }]}>
                            <User size={20} color={colors.textMuted} />
                          </View>
                        )}
                        <View style={styles.deliveryCardContent}>
                          <Text style={[styles.deliveryCardName, { color: colors.text }]} numberOfLines={1}>{place.name}</Text>
                          <Text style={[styles.deliveryCardTime, { color: colors.textSecondary }]} numberOfLines={1}>Earned ${(item.courier_earnings || 0).toFixed(2)} • {timeAgo(item.delivered_at)}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </>
            )}

            {/* ── Latest Reviews Section (only if reviews exist) ── */}
            {courierReviews.length > 0 && (
              <>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>Latest Reviews</Text>
                  <TouchableOpacity>
                    <Text style={[styles.viewAllText, { color: colors.textSecondary }]}>View All</Text>
                  </TouchableOpacity>
                </View>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.horizontalListContent}
                >
                  {courierReviews.map((review: any) => {
                    const reviewDate = new Date(review.created_at);
                    const now = new Date();
                    const diffMs = now.getTime() - reviewDate.getTime();
                    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                    const timeAgo = diffDays === 0 ? 'Today' : diffDays === 1 ? '1 Day Ago' : `${diffDays} Days Ago`;
                    const customerName = review.customer?.first_name || 'Customer';
                    return (
                      <View key={review.id} style={[styles.reviewCard, { backgroundColor: colors.card, ...(courierReviews.length === 1 ? { width: SCREEN_WIDTH - 32, maxWidth: SCREEN_WIDTH - 32 } : {}) }]}>
                        <Text style={[styles.reviewText, { color: colors.textSecondary }]} numberOfLines={3}>
                          {review.review_text}
                        </Text>
                        <View style={{ marginVertical: 8 }}>
                          <StarRating rating={review.rating} size={24} />
                        </View>
                        <Text style={[styles.reviewMeta, { color: colors.textSecondary }]}>
                          {timeAgo} by <Text style={{ fontFamily: fontFamily.bold, color: colors.text }}>{customerName}</Text>
                        </Text>
                      </View>
                    );
                  })}
                </ScrollView>
              </>
            )}

            <View style={{ height: 40 }} />
          </>
        )}
      </ScrollView>

      {/* ── Period Picker Modal ── */}
      {!isApplicationMode && (
        <Modal
          visible={showPeriodPicker}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setShowPeriodPicker(false)}
        >
          <View style={[styles.pickerContainer, { backgroundColor: colors.background }]}>
            <View style={[styles.pickerHeader, { borderBottomColor: colors.border, borderBottomWidth: 1 }]}>
              <Text style={[styles.pickerTitle, { color: colors.text }]}>Select Period</Text>
              <TouchableOpacity onPress={() => setShowPeriodPicker(false)}>
                <X size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12 }}>
              {(['today', 'last_7', 'last_30', 'all_time'] as PeriodOption[]).map((period) => {
                const isActive = selectedPeriod === period;
                return (
                  <TouchableOpacity
                    key={period}
                    style={[
                      styles.periodOption,
                      {
                        backgroundColor: isActive ? colors.text : 'transparent',
                      },
                    ]}
                    onPress={() => {
                      setSelectedPeriod(period);
                      setShowPeriodPicker(false);
                    }}
                  >
                    <Text style={[styles.periodOptionText, { color: isActive ? colors.background : colors.text }]}>
                      {getPeriodLabel(period)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </Modal>
      )}

      {/* ── Go Online Confirmation Modal ── */}
      <Modal
        visible={showGoOnlineModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowGoOnlineModal(false)}
      >
        <View style={goOnlineModalStyles.overlay}>
          <View style={[goOnlineModalStyles.container, { backgroundColor: colors.card }]}>
            <View style={goOnlineModalStyles.iconRow}>
              <View style={goOnlineModalStyles.iconCircle}>
                <Clock size={28} color="#fff" />
              </View>
            </View>

            <Text style={[goOnlineModalStyles.title, { color: colors.text }]}>
              Ready to go on standby?
            </Text>

            <Text style={[goOnlineModalStyles.body, { color: colors.textSecondary }]}>
              By going online you're committing to be available for at least{' '}
              <Text style={{ fontFamily: fontFamily.bold, color: colors.text }}>
                {minSessionMinutes} minutes
              </Text>
              . Once online, you won't be able to go offline until this time has passed.
            </Text>

            <Text style={[goOnlineModalStyles.body, { color: colors.textSecondary, marginTop: 8 }]}>
              You're free to accept or reject any offers during this time. However, each rejection during a session carries an increasing point penalty.
            </Text>

            <View style={[goOnlineModalStyles.note, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#f5f5f5' }]}>
              <AlertTriangle size={16} color={colors.textMuted} />
              <Text style={[goOnlineModalStyles.noteText, { color: colors.textMuted }]}>
                We cannot guarantee you'll receive offers during this time.
              </Text>
            </View>

            <TouchableOpacity
              style={goOnlineModalStyles.confirmButton}
              onPress={confirmGoOnline}
              activeOpacity={0.8}
            >
              <Text style={goOnlineModalStyles.confirmButtonText}>
                Yes, Go Online
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={goOnlineModalStyles.cancelButton}
              onPress={() => setShowGoOnlineModal(false)}
              activeOpacity={0.7}
            >
              <Text style={[goOnlineModalStyles.cancelButtonText, { color: colors.textSecondary }]}>
                Not right now
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const goOnlineModalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  container: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
  },
  iconRow: {
    marginBottom: 16,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#27d20b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: 20,
    textAlign: 'center',
    marginBottom: 12,
  },
  body: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  noteText: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    flex: 1,
  },
  confirmButton: {
    backgroundColor: '#27d20b',
    borderRadius: 12,
    paddingVertical: 14,
    width: '100%',
    alignItems: 'center',
    marginTop: 20,
  },
  confirmButtonText: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
    color: '#fff',
  },
  cancelButton: {
    paddingVertical: 12,
    marginTop: 4,
  },
  cancelButtonText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
  },
});

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },

  // Header — matches manager app exactly
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    paddingHorizontal: 16,
  },
  logo: {
    width: 40,
    height: 40,
    borderRadius: 8,
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 12,
  },
  headerTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
    textAlign: 'center',
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  // Period selector — matches manager app exactly
  periodSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
    gap: 4,
  },
  periodLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
  },

  // Profile Card — RestaurantCard style (image touches left/top/bottom)
  profileCardOuter: {
    borderRadius: 14,
    marginHorizontal: 16,
    marginBottom: 12,
    marginTop: 8,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 6,
      },
      android: {
        elevation: 3,
      },
      default: {},
    }),
  },
  profileCardInner: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: 14,
    overflow: 'hidden',
  },
  profileImage: {
    width: 92,
    height: '100%',
    minHeight: 86,
  },
  profileImagePlaceholder: {
    width: 92,
    minHeight: 86,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInfo: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    justifyContent: 'center',
    gap: 2,
  },
  profileName: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
    marginBottom: 2,
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

  // Application status badge
  appBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 6,
  },
  appBadgeText: {
    fontFamily: fontFamily.bold,
    fontSize: 11,
    color: '#FFF',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },

  // Slide container — full width below profile card
  slideContainer: {
    paddingHorizontal: 16,
    marginBottom: spacing.lg,
  },

  // Stats
  statsScroll: {
    marginBottom: spacing.lg,
  },
  statsScrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 10,
  },
  statCard: {
    minWidth: 100,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 6, elevation: 3,
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
    paddingHorizontal: 16,
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
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 12,
  },

  // Review cards
  reviewCard: {
    width: SCREEN_WIDTH * 0.65,
    maxWidth: 340,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 6, elevation: 3,
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
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 6, elevation: 3,
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

  // Recent Deliveries cards (horizontal layout)
  deliveryCard: {
    borderRadius: 12,
    padding: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 6, elevation: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: SCREEN_WIDTH < 400 ? SCREEN_WIDTH / 1.3 : SCREEN_WIDTH / 3,
  },
  deliveryCardImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  deliveryCardContent: {
    flex: 1,
    gap: 1,
  },
  deliveryCardName: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
  },
  deliveryCardTime: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
  },
  deliveryCardValue: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
  },

  // Period picker modal
  pickerContainer: {
    flex: 1,
    paddingTop: Platform.OS === 'ios' ? 20 : 16,
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  pickerTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
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
