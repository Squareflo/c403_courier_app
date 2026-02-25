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
import { User, ZapOff } from 'lucide-react-native';
import { useAuth } from '../contexts/AuthContext';
import { fontFamily } from '../constants/typography';
import { spacing } from '../constants/spacing';
import { supabase } from '../lib/supabase';
import { updateCourierOnlineStatus, getCourierPeriodStats } from '../services/api';
import {
  startLocationTracking,
  stopLocationTracking,
  getCurrentLocation,
} from '../services/locationService';
import { useButtonFeedback } from '../hooks/useButtonFeedback';

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

// ─── Helpers ────────────────────────────────────────────────────────────────

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
  const [rejectedOffers, setRejectedOffers] = useState<any[]>([]);
  const [acceptedDeliveries, setAcceptedDeliveries] = useState<any[]>([]);

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
        setOpenOffers(
          open.map((r: any) => ({
            ...r.delivery_data,
            place_name: r.place_name,
            customer_name: r.customer_name,
            delivery_offer: r.offer_data,
          }))
        );
      } else {
        setOpenOffers([]);
      }
    } catch (err) {
      console.error('[OnlineScreen] Error loading offers:', err);
      setOpenOffers([]);
    }
  }, [courier?.id]);

  // ── Load previously rejected open offers that are still available ───────

  const loadRejectedOffers = useCallback(async () => {
    if (!courier?.id) return;

    try {
      // Find delivery_requests where:
      // 1. Status is still waiting_for_courier_to_accept (unclaimed)
      // 2. This courier's ID is in rejected_by_couriers JSONB array
      // No need to check delivery_offer — the offer row status changes to rejected
      // but the delivery_request itself is still open for acceptance
      const { data, error } = await supabase
        .from('delivery_request')
        .select(
          `id, delivery_number, status, pickup_address, pickup_eta,
           delivery_distance_km, points_offered,
           rejected_by_couriers,
           place:place_id (name, profile_picture_url)`
        )
        .eq('status', 'waiting_for_courier_to_accept')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error || !data) {
        console.error('[OnlineScreen] Error loading rejected offers:', error);
        setRejectedOffers([]);
        return;
      }

      // Filter in JS — check if courier's ID appears in rejected_by_couriers
      const rejected = data.filter((dr: any) => {
        const rejectedList = dr.rejected_by_couriers || [];
        return (
          Array.isArray(rejectedList) &&
          rejectedList.some((r: any) => r.courier_id === courier.id)
        );
      });

      // Exclude any that already appear in the openOffers list (no duplicates)
      const openOfferIds = new Set(openOffers.map((o: any) => o.id));
      const filtered = rejected.filter((dr: any) => !openOfferIds.has(dr.id));

      setRejectedOffers(
        filtered.map((dr: any) => {
          const place = Array.isArray(dr.place) ? dr.place[0] : dr.place;
          return {
            ...dr,
            place_name: place?.name || 'Unknown',
          };
        })
      );
    } catch (err) {
      console.error('[OnlineScreen] Error loading rejected offers:', err);
      setRejectedOffers([]);
    }
  }, [courier?.id, openOffers]);

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
    await Promise.all([loadStats(), loadOffers(), loadAcceptedDeliveries()]);
  }, [loadStats, loadOffers, loadAcceptedDeliveries]);

  // ── Load rejected offers after openOffers are loaded ────────────────────

  useEffect(() => {
    loadRejectedOffers();
  }, [openOffers]);

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
              current_location_latitude: loc.coords.latitude,
              current_location_longitude: loc.coords.longitude,
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

  // ── Offer card press ────────────────────────────────────────────────────

  const handleOfferPress = (offer: any) => {
    tapFeedback();
    const offerType = offer.delivery_offer?.type === 'exclusive' ? 'exclusive' : 'open';
    console.log('[OnlineScreen] Offer pressed:', offer.id, 'type:', offerType);
    onOfferPress?.(offer.id, offerType as 'open' | 'exclusive');
  };

  // ── Rejected offer press (re-open the offer detail screen) ──────────────

  const handleRejectedOfferPress = (offer: any) => {
    tapFeedback();
    console.log('[OnlineScreen] Rejected offer pressed:', offer.id);
    onOfferPress?.(offer.id, 'open');
  };

  // ── Accepted delivery press ─────────────────────────────────────────────

  const handleAcceptedPress = (deliveryId: string) => {
    tapFeedback();
    console.log('[OnlineScreen] Accepted delivery pressed:', deliveryId);
    onAcceptedDeliveryPress?.(deliveryId);
  };

  // ── Always dark theme colors ────────────────────────────────────────────

  const bg = '#000000';
  const cardBg = '#2a2a2a';
  const textColor = '#FFFFFF';
  const textSecColor = '#9CA3AF';

  const profileImage = courier?.profile_picture_url || null;
  const totalOffers = openOffers.length;
  const totalRejected = rejectedOffers.length;

  if (loading) {
    return (
      <View style={[styles.screen, { backgroundColor: bg, paddingTop: insets.top }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#ec2227" />
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
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#ec2227" />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header: Profile pic + "● Online" + ZapOff ── */}
        <View style={styles.header}>
          {profileImage ? (
            <Image source={{ uri: profileImage }} style={styles.headerProfileImage} />
          ) : (
            <View style={[styles.headerProfileImage, { backgroundColor: '#333', alignItems: 'center', justifyContent: 'center' }]}>
              <User size={20} color="#666" />
            </View>
          )}

          <View style={styles.headerCenter}>
            <View style={styles.onlineDot} />
            <Text style={styles.onlineText}>Online</Text>
          </View>

          <TouchableOpacity
            style={[styles.headerAction, hasActiveDeliveries && { opacity: 0.3 }]}
            onPress={handleZapOffPress}
            activeOpacity={0.7}
          >
            <ZapOff size={24} color={textColor} />
          </TouchableOpacity>
        </View>

        {/* ── "Today" label ── */}
        <Text style={styles.todayLabel}>Today</Text>

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

        {/* ── Accepted Deliveries Section (shown first) ── */}
        {acceptedDeliveries.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: textColor }]}>Accepted</Text>
            </View>
            {acceptedDeliveries.map((delivery) => {
              const place = Array.isArray(delivery.place) ? delivery.place[0] : delivery.place;
              return (
                <TouchableOpacity
                  key={delivery.id}
                  style={[styles.offerCard, { backgroundColor: cardBg }]}
                  activeOpacity={0.7}
                  onPress={() => handleAcceptedPress(delivery.id)}
                >
                  <View style={styles.offerCardContent}>
                    <View style={styles.offerInfo}>
                      <Text style={[styles.offerPoints, { color: textColor }]}>
                        {Math.round(delivery.points_offered || 0).toLocaleString()} Points
                      </Text>
                      <Text style={[styles.offerDeliveryNumber, { color: textSecColor }]}>
                        {place?.name || 'Unknown Place'}
                      </Text>
                      <Text style={[styles.offerDistance, { color: textSecColor }]}>
                        {(delivery.delivery_distance_km || 0).toFixed(1)}KM Away
                      </Text>
                    </View>
                    {renderArriveInBadge(delivery.pickup_eta)}
                  </View>
                </TouchableOpacity>
              );
            })}
          </>
        )}

        {/* ── Open Offers Section ── */}
        <View style={[styles.sectionHeader, acceptedDeliveries.length > 0 && { marginTop: spacing.xl }]}>
          <Text style={[styles.sectionTitle, { color: textColor }]}>
            {totalOffers} Open Offer{totalOffers !== 1 ? 's' : ''}
          </Text>
          {totalOffers > 0 && (
            <TouchableOpacity>
              <Text style={[styles.viewAllText, { color: textSecColor }]}>View All</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Open Offers (vertical list) — exclusive offers never shown here */}
        {openOffers.map((offer) => (
          <TouchableOpacity
            key={offer.id}
            style={[styles.offerCard, { backgroundColor: cardBg }]}
            onPress={() => handleOfferPress(offer)}
            activeOpacity={0.7}
          >
            <View style={styles.offerCardContent}>
              <View style={styles.offerInfo}>
                <Text style={[styles.offerPoints, { color: textColor }]}>
                  {Math.round(offer.points_offered || 0).toLocaleString()} Points
                </Text>
                <Text style={[styles.offerDeliveryNumber, { color: textSecColor }]}>
                  {offer.place_name || `Delivery #${offer.delivery_number || offer.id?.slice(-6).toUpperCase()}`}
                </Text>
                <Text style={[styles.offerDistance, { color: textSecColor }]}>
                  {(offer.delivery_distance_km || 0).toFixed(1)}KM Away
                </Text>
              </View>
              {renderArriveInBadge(offer.pickup_eta)}
            </View>
          </TouchableOpacity>
        ))}

        {/* No offers empty state */}
        {totalOffers === 0 && (
          <Text style={styles.noOffersText}>Sorry, you have no open offers.</Text>
        )}

        {/* ── Previously Rejected Section ── */}
        {totalRejected > 0 && (
          <>
            <View style={[styles.sectionHeader, { marginTop: spacing.xl }]}>
              <Text style={[styles.sectionTitle, { color: textColor }]}>
                {totalRejected} Previously Rejected
              </Text>
            </View>

            <Text style={styles.rejectedSubtext}>
              You rejected these offers but they're still available. Tap to view again.
            </Text>

            {rejectedOffers.map((offer) => (
              <TouchableOpacity
                key={offer.id}
                style={[styles.offerCard, { backgroundColor: cardBg, borderLeftWidth: 3, borderLeftColor: '#EF4444' }]}
                onPress={() => handleRejectedOfferPress(offer)}
                activeOpacity={0.7}
              >
                <View style={styles.offerCardContent}>
                  <View style={styles.offerInfo}>
                    <Text style={[styles.offerPoints, { color: textColor }]}>
                      {Math.round(offer.points_offered || 0).toLocaleString()} Points
                    </Text>
                    <Text style={[styles.offerDeliveryNumber, { color: textSecColor }]}>
                      {offer.place_name || `Delivery #${offer.delivery_number || offer.id?.slice(-6).toUpperCase()}`}
                    </Text>
                    <Text style={[styles.offerDistance, { color: textSecColor }]}>
                      {(offer.delivery_distance_km || 0).toFixed(1)}KM Away
                    </Text>
                  </View>
                  {renderArriveInBadge(offer.pickup_eta)}
                </View>
              </TouchableOpacity>
            ))}
          </>
        )}

        {/* ── Online Timer + Go Offline (hidden when active deliveries) ── */}
        {!hasActiveDeliveries && (
          <View style={styles.offlineSection}>
            <Text style={styles.onlineTimerText}>
              <Text style={{ fontFamily: fontFamily.semiBold }}>
                You've been online for {formatOnlineTime(onlineSeconds)}.
              </Text>
              {'  '}
              <Text style={{ color: textSecColor }}>Need to take a break?</Text>
            </Text>

            <TouchableOpacity
              style={styles.goOfflineButton}
              onPress={() => { tapFeedback(); handleGoOffline(); }}
              activeOpacity={0.7}
            >
              <Text style={styles.goOfflineButtonText}>GO OFFLINE</Text>
            </TouchableOpacity>
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
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Can't Go Offline</Text>
            <Text style={styles.modalText}>
              You have active deliveries. Complete all your deliveries before going offline.
            </Text>
            <TouchableOpacity
              style={styles.modalButton}
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

// ─── Helper: Arrive In Badge (used for BOTH offers and accepted) ────────────

function renderArriveInBadge(pickupEta: string | null) {
  const minutes = calculateMinutesUntilPickup(pickupEta);
  if (minutes === null) return null;

  const isLate = minutes < 0;
  const bgColor = isLate ? '#ec2227' : '#27d20b';

  return (
    <View style={[styles.arriveInBadge, { backgroundColor: bgColor }]}>
      <Text style={styles.arriveInBadgeLabel}>Arrive In</Text>
      <Text style={styles.arriveInBadgeValue}>
        {minutes} Min
      </Text>
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
    flexDirection: 'row',
    alignItems: 'center',
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
    color: '#FFFFFF',
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
    color: '#FFFFFF',
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

  // Offer cards (shared for offers AND accepted deliveries)
  offerCard: {
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
  },
  offerCardHorizontal: {
    marginHorizontal: 0,
    marginRight: 12,
    width: SCREEN_WIDTH * 0.75,
    maxWidth: 400,
  },
  offerCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  offerInfo: {
    flex: 1,
    gap: 2,
  },
  offerPoints: {
    fontFamily: fontFamily.regular,
    fontSize: 16,
  },
  offerDeliveryNumber: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
  },
  offerDistance: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
  },
  offersScrollContent: {
    paddingHorizontal: 16,
  },

  // Arrive In badge (green/red)
  arriveInBadge: {
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 90,
  },
  arriveInBadgeLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: '#FFFFFF',
  },
  arriveInBadgeValue: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
    color: '#FFFFFF',
  },

  // No offers
  noOffersText: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: '#6B7280',
    paddingHorizontal: 16,
    marginTop: 4,
  },

  // Rejected offers subtext
  rejectedSubtext: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: '#9CA3AF',
    paddingHorizontal: 16,
    marginBottom: 12,
    lineHeight: 18,
  },

  // Offline section
  offlineSection: {
    paddingHorizontal: 16,
    marginTop: spacing.xl,
  },
  onlineTimerText: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: '#FFFFFF',
    marginBottom: 16,
    lineHeight: 20,
  },
  goOfflineButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    width: SCREEN_WIDTH * 0.55,
    maxWidth: 300,
  },
  goOfflineButtonDisabled: {
    opacity: 0.4,
  },
  goOfflineButtonText: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
    color: '#000000',
    letterSpacing: 1,
  },
  cantGoOfflineText: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: '#EF4444',
    marginTop: 8,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  modalContent: {
    backgroundColor: '#2a2a2a',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
  },
  modalTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 20,
    color: '#FFFFFF',
    marginBottom: 12,
  },
  modalText: {
    fontFamily: fontFamily.regular,
    fontSize: 15,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  modalButton: {
    backgroundColor: '#ec2227',
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
