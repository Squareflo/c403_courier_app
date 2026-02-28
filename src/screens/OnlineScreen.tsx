import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { Moon, Sun, User, ZapOff } from 'lucide-react-native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { fontFamily } from '../constants/typography';
import { spacing } from '../constants/spacing';
import { supabase } from '../lib/supabase';
import { updateCourierOnlineStatus, getCourierPeriodStats } from '../services/api';
import { formatDistance, formatDistanceRound, getDistanceUnit, getPerDistanceLabel } from '../utils/distance';
import {
  startLocationTracking,
  stopLocationTracking,
  getCurrentLocation,
} from '../services/locationService';
import { useButtonFeedback } from '../hooks/useButtonFeedback';
import SlideToOffline from '../components/ui/SlideToOffline';
import { OfferCard } from '../components/ui/OfferCard';
import { OpenOffersSection } from '../components/ui/OpenOffersSection';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Types ──────────────────────────────────────────────────────────────────

interface DeliveryOffer {
  id: string;
  delivery_data: any;
  offer_data: any;
  place_name: string;
  customer_name: string;
}

interface TodayStats {
  deliveries: number;
  earned: number;
  points: number;
  avgPerDelivery: number;
  totalKm: number;
  avgKmPerDelivery: number;
  earningsPerKm: number;
}

interface CompletedDelivery {
  id: string;
  delivery_number: string | null;
  courier_earnings: number | null;
  points_earned: number | null;
  delivery_distance_km: number | null;
  delivered_at: string | null;
  place: { name: string; profile_picture_url: string | null } | null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '';
  const now = new Date();
  const d = new Date(dateStr);
  const diffMs = now.getTime() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatLargeNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

function calculateMinutesUntilPickup(pickupEta: string | null): number | null {
  if (!pickupEta) return null;
  const now = new Date();
  const eta = new Date(pickupEta);
  return Math.round((eta.getTime() - now.getTime()) / 60000);
}

function formatOnlineTime(seconds: number): string {
  if (seconds < 60) return `${seconds}Sec`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}Min`;
  const hours = Math.floor(minutes / 60);
  const remainingMin = minutes % 60;
  return remainingMin > 0 ? `${hours}Hr ${remainingMin}Min` : `${hours}Hr`;
}

// ─── Online Screen ──────────────────────────────────────────────────────────

interface OnlineScreenProps {
  onGoOffline: () => void;
  onOfferPress?: (deliveryRequestId: string, offerType: 'open' | 'exclusive') => void;
  onAcceptedDeliveryPress?: (deliveryRequestId: string) => void;
}

export function OnlineScreen({ onGoOffline, onOfferPress, onAcceptedDeliveryPress }: OnlineScreenProps) {
  const { courier, refreshCourier } = useAuth();
  const { colors, isDark, toggleTheme } = useTheme();
  const { tapFeedback } = useButtonFeedback();
  const insets = useSafeAreaInsets();

  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showOfflineModal, setShowOfflineModal] = useState(false);

  // Stats
  const [stats, setStats] = useState<TodayStats>({
    deliveries: 0,
    earned: 0,
    points: 0,
    avgPerDelivery: 0,
    totalKm: 0,
    avgKmPerDelivery: 0,
    earningsPerKm: 0,
  });

  // Offers — only open offers (exclusive offers are handled by MainLayout forced screen)
  const [openOffers, setOpenOffers] = useState<any[]>([]);
  const [acceptedDeliveries, setAcceptedDeliveries] = useState<any[]>([]);
  const distUnit = courier?.preferred_distance_unit;
  const [completedDeliveries, setCompletedDeliveries] = useState<CompletedDelivery[]>([]);

  // Online timer
  const [onlineSeconds, setOnlineSeconds] = useState(0);
  const onlineTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wentOnlineAtRef = useRef<Date>(new Date());

  // Location tracking ref
  const locationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Load offers via RPC ─────────────────────────────────────────────────

  const loadOffers = useCallback(async () => {
    if (!courier?.id) return;

    try {
      const { data, error } = await supabase.rpc('get_courier_delivery', {
        courier_id_param: courier.id,
      });

      if (error) {
        console.error('[OnlineScreen] Error fetching offers:', error);
        setOpenOffers([]);
        return;
      }

      if (!data || data.length === 0) {
        console.log('[OnlineScreen] No offers available');
        setOpenOffers([]);
        return;
      }

      console.log(`[OnlineScreen] RPC returned ${data.length} offer(s)`);

      // Only show open offers — exclusive offers are handled by MainLayout forced screen
      const open = data.filter((r: any) => r.offer_data?.type === 'open');

      if (open.length > 0) {
        // Deduplicate by delivery_request id to prevent duplicate key errors
        const uniqueOffers = new Map();
        open.forEach((r: any) => {
          if (!uniqueOffers.has(r.delivery_data.id)) {
            uniqueOffers.set(r.delivery_data.id, {
              ...r.delivery_data,
              place_name: r.place_name,
              place_profile_picture_url: r.place_profile_picture_url,
              customer_name: r.customer_name,
              place_address_line_1: r.place_address_line_1,
              place_rating: r.place_rating,
              place_total_reviews: r.place_total_reviews,
              delivery_offer: r.offer_data,
            });
          }
        });
        setOpenOffers(Array.from(uniqueOffers.values()));
      } else {
        setOpenOffers([]);
      }
    } catch (err) {
      console.error('[OnlineScreen] Error loading offers:', err);
      setOpenOffers([]);
    }
  }, [courier?.id]);

  // ── Load accepted (in-progress) deliveries ──────────────────────────────

  const loadAcceptedDeliveries = useCallback(async () => {
    if (!courier?.id) return;

    try {
      const { data, error } = await supabase
        .from('delivery_request')
        .select('id, delivery_number, status, pickup_address, dropoff_address, courier_earnings, pickup_eta, drop_off_eta, delivery_distance_km, points_offered, place:place_id(name, profile_picture_url)')
        .eq('courier_id', courier.id)
        .in('status', ['accepted_by_courier', 'arrived_at_pickup', 'en_route', 'arrived_at_dropoff'])
        .order('accepted_by_courier_at', { ascending: false })
        .limit(5);

      if (!error && data) {
        setAcceptedDeliveries(data);
      }
    } catch (err) {
      console.error('[OnlineScreen] Error loading accepted deliveries:', err);
    }
  }, [courier?.id]);

  // ── Load completed deliveries for today ─────────────────────────────────

  const loadCompletedDeliveries = useCallback(async () => {
    if (!courier?.id) return;

    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from('delivery_request')
        .select('id, delivery_number, courier_earnings, points_earned, delivery_distance_km, delivered_at, place:place_id(name, profile_picture_url)')
        .eq('courier_id', courier.id)
        .eq('status', 'delivered')
        .gte('delivered_at', todayStart.toISOString())
        .order('delivered_at', { ascending: false })
        .limit(20);

      if (!error && data) {
        setCompletedDeliveries(
          data.map((d: any) => ({
            ...d,
            place: Array.isArray(d.place) ? d.place[0] : d.place,
          }))
        );
      }
    } catch (err) {
      console.error('[OnlineScreen] Error loading completed deliveries:', err);
    }
  }, [courier?.id]);

  // ── Load today's stats ──────────────────────────────────────────────────

  const loadStats = useCallback(async () => {
    if (!courier?.id) return;

    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const periodStats = await getCourierPeriodStats(courier.id, todayStart.toISOString());
      setStats(periodStats);
    } catch (err) {
      console.error('[OnlineScreen] Error loading stats:', err);
    }
  }, [courier?.id]);

  // ── Load all data ───────────────────────────────────────────────────────

  const loadAllData = useCallback(async () => {
    await Promise.all([loadStats(), loadOffers(), loadAcceptedDeliveries(), loadCompletedDeliveries()]);
  }, [loadStats, loadOffers, loadAcceptedDeliveries, loadCompletedDeliveries]);

  // ── Initial load ────────────────────────────────────────────────────────

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await loadAllData();
      setLoading(false);
    };
    init();
  }, [loadAllData]);

  // ── Online timer ────────────────────────────────────────────────────────

  useEffect(() => {
    wentOnlineAtRef.current = new Date();
    onlineTimerRef.current = setInterval(() => {
      const diff = Math.floor((Date.now() - wentOnlineAtRef.current.getTime()) / 1000);
      setOnlineSeconds(diff);
    }, 1000);

    return () => {
      if (onlineTimerRef.current) clearInterval(onlineTimerRef.current);
    };
  }, []);

  // ── Location tracking (every 30s) ──────────────────────────────────────

  useEffect(() => {
    const updateLocation = async () => {
      if (!courier?.id) return;
      try {
        const loc = await getCurrentLocation();
        if (loc) {
          await supabase
            .from('customer')
            .update({
              current_location_latitude: loc.latitude,
              current_location_longitude: loc.longitude,
            })
            .eq('id', courier.id);
        }
      } catch (err) {
        console.warn('[OnlineScreen] Location update error:', err);
      }
    };

    updateLocation();
    locationIntervalRef.current = setInterval(updateLocation, 30000);

    return () => {
      if (locationIntervalRef.current) clearInterval(locationIntervalRef.current);
    };
  }, [courier?.id]);

  // ── Realtime subscription for delivery offers ──────────────────────────

  useEffect(() => {
    if (!courier?.id) return;

    console.log('[OnlineScreen] Setting up Realtime subscription for offers');

    const subscription = supabase
      .channel(`courier-offers-${courier.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'delivery_offer',
        },
        (payload: any) => {
          console.log('[OnlineScreen] Realtime event:', payload.eventType);

          if (payload.eventType === 'INSERT' && payload.new.status === 'pending') {
            console.log('[OnlineScreen] New offer detected!');
            loadOffers();
          } else if (payload.eventType === 'UPDATE' && payload.new.status !== 'pending') {
            console.log('[OnlineScreen] Offer status changed, reloading');
            loadOffers();
            loadAcceptedDeliveries();
          } else if (payload.eventType === 'DELETE') {
            loadOffers();
          }
        }
      )
      .subscribe((status: string) => {
        console.log('[OnlineScreen] Realtime subscription:', status);
      });

    return () => {
      console.log('[OnlineScreen] Cleaning up Realtime subscription');
      subscription.unsubscribe();
    };
  }, [courier?.id, loadOffers, loadAcceptedDeliveries]);

  // ── Pull to refresh ─────────────────────────────────────────────────────

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadAllData(), refreshCourier()]);
    setRefreshing(false);
  };

  // ── Go Offline ──────────────────────────────────────────────────────────

  const hasActiveDeliveries = acceptedDeliveries.length > 0;

  const handleGoOffline = async () => {
    if (hasActiveDeliveries || !courier?.id) return;

    try {
      await updateCourierOnlineStatus(courier.id, false);
      await refreshCourier();
      onGoOffline();
    } catch (err) {
      console.error('[OnlineScreen] Error going offline:', err);
    }
  };

  // ── ZapOff icon press ───────────────────────────────────────────────────

  const handleZapOffPress = () => {
    tapFeedback();
    if (hasActiveDeliveries) {
      setShowOfflineModal(true);
    } else {
      handleGoOffline();
    }
  };

  // ── Theme toggle ────────────────────────────────────────────────────────

  const handleThemeToggle = () => {
    tapFeedback();
    toggleTheme();
  };

  // ── Offer card press ────────────────────────────────────────────────────

  const handleOfferPress = (offer: any) => {
    tapFeedback();
    const offerType = offer.delivery_offer?.type === 'exclusive' ? 'exclusive' : 'open';
    console.log('[OnlineScreen] Offer pressed:', offer.id, 'type:', offerType);
    onOfferPress?.(offer.id, offerType as 'open' | 'exclusive');
  };

  // ── Accepted delivery press ─────────────────────────────────────────────

  const handleAcceptedPress = (deliveryId: string) => {
    tapFeedback();
    console.log('[OnlineScreen] Accepted delivery pressed:', deliveryId);
    onAcceptedDeliveryPress?.(deliveryId);
  };

  // ── Theme-aware colors ──────────────────────────────────────────────────

  const bg = colors.backgroundSecondary;
  const cardBg = colors.card;
  const textColor = colors.text;
  const textSecColor = colors.textTertiary;

  const profileImage = courier?.profile_picture_url || null;
  const totalOffers = openOffers.length;

  if (loading) {
    return (
      <View style={[styles.screen, { backgroundColor: bg, paddingTop: insets.top }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: bg }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 8 }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header: Profile pic + "● Online" + Theme toggle + ZapOff ── */}
        <View style={styles.header}>
          {profileImage ? (
            <Image source={{ uri: profileImage }} style={styles.headerProfileImage} />
          ) : (
            <View style={[styles.headerProfileImage, { backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center' }]}>
              <User size={20} color={colors.textMuted} />
            </View>
          )}

          <View style={styles.headerCenter}>
            <View style={styles.onlineDot} />
            <Text style={[styles.onlineText, { color: textColor }]}>Online</Text>
          </View>

          <View style={styles.headerRight}>
            <TouchableOpacity
              style={styles.headerAction}
              onPress={handleThemeToggle}
              activeOpacity={0.7}
            >
              {isDark ? (
                <Sun size={22} color={textColor} />
              ) : (
                <Moon size={22} color={textColor} />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.headerAction, hasActiveDeliveries && { opacity: 0.3 }]}
              onPress={handleZapOffPress}
              activeOpacity={0.7}
            >
              <ZapOff size={24} color={textColor} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── "Today" label ── */}
        <Text style={[styles.todayLabel, { color: textColor }]}>Today</Text>

        {/* ── Stats Row (horizontal scroll) ── */}
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
            <Text style={[styles.statValue, { color: textColor }]}>{formatDistanceRound(stats.totalKm, distUnit)}</Text>
            <Text style={[styles.statLabel, { color: textSecColor }]}>{getDistanceUnit(distUnit)}</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: cardBg }]}>
            <Text style={[styles.statValue, { color: textColor }]}>{formatDistance(stats.avgKmPerDelivery, distUnit)}</Text>
            <Text style={[styles.statLabel, { color: textSecColor }]}>Per Delivery</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: cardBg }]}>
            <Text style={[styles.statValue, { color: textColor }]}>${stats.earningsPerKm.toFixed(1)}</Text>
            <Text style={[styles.statLabel, { color: textSecColor }]}>{getPerDistanceLabel(distUnit)}</Text>
          </View>
        </ScrollView>

        {/* ── Accepted Deliveries Section (uses OfferCard, same as open offers) ── */}
        {acceptedDeliveries.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: textColor }]}>Accepted</Text>
            </View>
            {acceptedDeliveries.map((delivery) => {
              const place = Array.isArray(delivery.place) ? delivery.place[0] : delivery.place;
              return (
                <OfferCard
                  key={delivery.id}
                  placeName={place?.name || 'Unknown Place'}
                  placeImage={place?.profile_picture_url || null}
                  points={delivery.points_offered || 0}
                  distanceKm={delivery.delivery_distance_km || 0}
                  pickupEta={delivery.pickup_eta}
                  onPress={() => handleAcceptedPress(delivery.id)}
                  status={delivery.status}
                  distanceUnit={distUnit}
                />
              );
            })}
          </>
        )}

        {/* ── Open Offers Section (shared component) ── */}
        <OpenOffersSection
          offers={openOffers}
          onOfferPress={handleOfferPress}
        />

        {/* ── Completed Deliveries Today (horizontal slider) ── */}
        {completedDeliveries.length > 0 && (
          <>
            <View style={[styles.sectionHeader, { marginTop: spacing.xl }]}>
              <Text style={[styles.sectionTitle, { color: textColor }]}>
                Completed
              </Text>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.completedScrollContent}
            >
              {completedDeliveries.map((delivery) => (
                <TouchableOpacity
                  key={delivery.id}
                  style={[styles.completedCard, { backgroundColor: cardBg, minWidth: SCREEN_WIDTH < 400 ? SCREEN_WIDTH / 1.3 : SCREEN_WIDTH / 3 }]}
                  onPress={() => handleAcceptedPress(delivery.id)}
                  activeOpacity={0.7}
                >
                  {delivery.place?.profile_picture_url ? (
                    <Image source={{ uri: delivery.place.profile_picture_url }} style={styles.completedCardImage} />
                  ) : (
                    <View style={[styles.completedCardImage, { backgroundColor: isDark ? '#1a1a1a' : '#E5E7EB', alignItems: 'center', justifyContent: 'center' }]}>
                      <User size={20} color={textSecColor} />
                    </View>
                  )}
                  <View style={styles.completedCardContent}>
                    <Text style={[styles.completedPlace, { color: textColor }]} numberOfLines={1}>
                      {delivery.place?.name || 'Unknown'}
                    </Text>
                    <Text style={[styles.completedDetail, { color: textSecColor }]} numberOfLines={1}>
                      Earned ${(delivery.courier_earnings || 0).toFixed(2)} {'•'} {timeAgo(delivery.delivered_at)}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        )}

        {/* ── Go Offline Section (hidden when active deliveries) ── */}
        {!hasActiveDeliveries && (
          <View style={styles.offlineSection}>
            <Text style={[styles.offlinePromptText, { color: textSecColor }]}>
              Not available to do deliveries, or just need a break?
            </Text>

            <SlideToOffline onSlideComplete={handleGoOffline} />
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── Can't go offline modal ── */}
      <Modal
        visible={showOfflineModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowOfflineModal(false)}
      >
        <View style={[styles.modalOverlay, { backgroundColor: colors.modalOverlay }]}>
          <View style={[styles.modalContent, { backgroundColor: colors.modalBackground }]}>
            <Text style={[styles.modalTitle, { color: textColor }]}>Can't Go Offline</Text>
            <Text style={[styles.modalText, { color: textSecColor }]}>
              You have active deliveries. Complete all your deliveries before going offline.
            </Text>
            <TouchableOpacity
              style={[styles.modalButton, { backgroundColor: colors.primary }]}
              onPress={() => { tapFeedback(); setShowOfflineModal(false); }}
              activeOpacity={0.7}
            >
              <Text style={styles.modalButtonText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  headerProfileImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  headerCenter: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  onlineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#27d20b',
  },
  onlineText: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerAction: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Today label
  todayLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 22,
    paddingHorizontal: 16,
    marginBottom: 12,
  },

  // Stats
  statsScroll: {
    marginBottom: spacing.lg,
  },
  statsScrollContent: {
    paddingHorizontal: 16,
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
    paddingHorizontal: 16,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontFamily: fontFamily.regular,
    fontSize: 20,
  },
  viewAllText: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
  },

  // Completed deliveries slider
  completedScrollContent: {
    paddingHorizontal: 16,
    gap: 10,
  },
  completedCard: {
    borderRadius: 12,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  completedCardImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  completedCardContent: {
    flex: 1,
    gap: 1,
  },
  completedPlace: {
    fontFamily: fontFamily.semiBold,
    fontSize: 13,
  },
  completedDetail: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
  },

  // Offline section
  offlineSection: {
    paddingHorizontal: 16,
    marginTop: spacing.xl,
  },
  offlinePromptText: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    marginBottom: 16,
    lineHeight: 20,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  modalContent: {
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
  },
  modalTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 20,
    marginBottom: 12,
  },
  modalText: {
    fontFamily: fontFamily.regular,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  modalButton: {
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 40,
    alignItems: 'center',
  },
  modalButtonText: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
    color: '#FFFFFF',
  },
});
