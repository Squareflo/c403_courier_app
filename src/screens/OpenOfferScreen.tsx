import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, User, ZapOff } from 'lucide-react-native';
import { useAuth } from '../contexts/AuthContext';
import { fontFamily } from '../constants/typography';
import { supabase } from '../lib/supabase';
import { getCurrentLocation } from '../services/locationService';
import { PlaceCard } from '../components/ui/PlaceCard';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
// Edge functions are called via supabase.functions.invoke() — no raw URL/key needed

// ── Types ────────────────────────────────────────────────────────────────────

interface OpenOfferScreenProps {
  deliveryRequestId: string;
  offerType: 'open' | 'exclusive';
  onBack: () => void;
  /** Called after accept/reject so parent can reload offers */
  onOfferResolved?: () => void;
}

interface PlaceData {
  id: string;
  name: string;
  address_line_1: string | null;
  city: string | null;
  state: string | null;
  profile_picture_url: string | null;
  photos: string[] | null;
  rating: number | null;
  average_rating: number | null;
  total_reviews: number | null;
  phone_number: string | null;
}

interface DeliveryData {
  id: string;
  delivery_number: string | null;
  status: string;
  place_id: string;
  courier_id: string | null;
  pickup_address: string;
  pickup_latitude: number | null;
  pickup_longitude: number | null;
  dropoff_address: string | null;
  dropoff_latitude: number | null;
  dropoff_longitude: number | null;
  delivery_distance_km: number | null;
  delivery_distance_miles: number | null;
  pickup_eta: string | null;
  eta_minutes: number | null;
  points_offered: number | null;
  is_outside_order: boolean | null;
  accepted_by_couriers: any[] | null;
  rejected_by_couriers: any[] | null;
}

interface DeliveryOfferData {
  id: string;
  type: 'open' | 'exclusive';
  status: string;
  expires_at: string | null;
  courier_id: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function calculateDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function calculateMinutesUntilPickup(pickupEta: string | null): number | null {
  if (!pickupEta) return null;
  const now = new Date();
  const eta = new Date(pickupEta);
  return Math.round((eta.getTime() - now.getTime()) / 60000);
}

// ── Component ────────────────────────────────────────────────────────────────

export function OpenOfferScreen({
  deliveryRequestId,
  offerType,
  onBack,
  onOfferResolved,
}: OpenOfferScreenProps) {
  const { courier, refreshCourier } = useAuth();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [delivery, setDelivery] = useState<DeliveryData | null>(null);
  const [place, setPlace] = useState<PlaceData | null>(null);
  const [deliveryOffer, setDeliveryOffer] = useState<DeliveryOfferData | null>(null);
  const [distanceToPickupKm, setDistanceToPickupKm] = useState<number | null>(null);

  // Countdown for exclusive offers
  const [countdown, setCountdown] = useState<number | null>(null);

  // ── Load data ──────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!courier?.id) return;

    try {
      setLoading(true);
      setError(null);

      // 1. Fetch delivery_request with place join
      const { data: drData, error: drError } = await supabase
        .from('delivery_request')
        .select(
          `id, delivery_number, status, place_id, courier_id,
           pickup_address, pickup_latitude, pickup_longitude,
           dropoff_address, dropoff_latitude, dropoff_longitude,
           delivery_distance_km, delivery_distance_miles,
           pickup_eta, eta_minutes, points_offered,
           is_outside_order, accepted_by_couriers, rejected_by_couriers,
           place:place_id (
             id, name, address_line_1, city, state,
             profile_picture_url, photos, rating, average_rating,
             total_reviews, phone_number
           )`,
        )
        .eq('id', deliveryRequestId)
        .single();

      if (drError || !drData) {
        console.error('[OpenOfferScreen] Error loading delivery:', drError);
        setError('Delivery request not found');
        setLoading(false);
        return;
      }

      const raw = drData as any;
      const placeRaw = Array.isArray(raw.place) ? raw.place[0] : raw.place;

      setDelivery(raw as DeliveryData);
      setPlace(placeRaw as PlaceData);

      // 2. Check if another courier already accepted
      if (raw.status === 'accepted_by_courier' && raw.courier_id !== courier.id) {
        setError('accepted_by_another');
        setLoading(false);
        return;
      }

      // 3. Find the delivery_offer for this courier / open
      const { data: offerRows } = await supabase
        .from('delivery_offer')
        .select('id, type, status, expires_at, courier_id')
        .eq('delivery_request_id', deliveryRequestId)
        .eq('status', 'pending')
        .order('offered_at', { ascending: false })
        .limit(5);

      if (offerRows && offerRows.length > 0) {
        // Prefer the one assigned to this courier (exclusive), or the open one
        const exclusive = offerRows.find(
          (o: any) => o.type === 'exclusive' && o.courier_id === courier.id,
        );
        const open = offerRows.find((o: any) => o.type === 'open');
        const relevantOffer = exclusive || open || offerRows[0];
        setDeliveryOffer(relevantOffer as DeliveryOfferData);

        // Countdown for exclusive
        if (relevantOffer.type === 'exclusive' && relevantOffer.expires_at) {
          const expiresAt = new Date(relevantOffer.expires_at);
          const now = new Date();
          const secondsRemaining = Math.max(
            0,
            Math.floor((expiresAt.getTime() - now.getTime()) / 1000),
          );
          setCountdown(secondsRemaining);
        }
      }

      // 4. Calculate distance to pickup using courier's current location
      try {
        const loc = await getCurrentLocation();
        if (loc && raw.pickup_latitude && raw.pickup_longitude) {
          const dist = calculateDistanceKm(
            loc.coords.latitude,
            loc.coords.longitude,
            raw.pickup_latitude,
            raw.pickup_longitude,
          );
          setDistanceToPickupKm(dist);
        }
      } catch (locErr) {
        console.warn('[OpenOfferScreen] Could not get location:', locErr);
        // If we can't get location, try from courier profile
        if (
          courier.current_location_latitude &&
          courier.current_location_longitude &&
          raw.pickup_latitude &&
          raw.pickup_longitude
        ) {
          const dist = calculateDistanceKm(
            courier.current_location_latitude,
            courier.current_location_longitude,
            raw.pickup_latitude,
            raw.pickup_longitude,
          );
          setDistanceToPickupKm(dist);
        }
      }
    } catch (err) {
      console.error('[OpenOfferScreen] Unexpected error:', err);
      setError('Failed to load delivery details');
    } finally {
      setLoading(false);
    }
  }, [courier?.id, deliveryRequestId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Countdown timer (exclusive offers) ─────────────────────────────────────

  useEffect(() => {
    if (countdown === null || countdown === 0) return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(timer);
          handleReject(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [countdown]);

  // ── Poll for "accepted by another" (open offers) ──────────────────────────

  useEffect(() => {
    if (!delivery || delivery.status !== 'waiting_for_courier_to_accept') return;

    const pollInterval = setInterval(async () => {
      try {
        const { data } = await supabase
          .from('delivery_request')
          .select('status, courier_id')
          .eq('id', deliveryRequestId)
          .single();

        if (data?.status === 'accepted_by_courier' && data.courier_id !== courier?.id) {
          setError('accepted_by_another');
          clearInterval(pollInterval);
        }
      } catch (err) {
        console.error('[OpenOfferScreen] Poll error:', err);
      }
    }, 3000);

    return () => clearInterval(pollInterval);
  }, [delivery, deliveryRequestId, courier?.id]);

  // ── Accept ─────────────────────────────────────────────────────────────────

  const handleAccept = async () => {
    if (!courier?.id || !delivery) return;
    setAccepting(true);
    setError(null);

    try {
      // 1. Update delivery_request
      await supabase
        .from('delivery_request')
        .update({
          courier_id: courier.id,
          accepted_by_couriers: [
            ...(delivery.accepted_by_couriers || []),
            { courier_id: courier.id, accepted_at: new Date().toISOString() },
          ],
        })
        .eq('id', deliveryRequestId);

      // 2. Update delivery_offer
      if (deliveryOffer) {
        await supabase
          .from('delivery_offer')
          .update({
            status: 'accepted',
            accepted_at: new Date().toISOString(),
          })
          .eq('id', deliveryOffer.id);
      }

      // 3. Call edge function to update delivery status (matches web exactly)
      const { error: statusError } = await supabase.functions.invoke('update-delivery-status', {
        body: {
          delivery_request_id: deliveryRequestId,
          new_status: 'accepted_by_courier',
        },
      });
      if (statusError) {
        console.error('[OpenOfferScreen] update-delivery-status error:', statusError);
      }

      // 4. Increment courier's accepted count
      const currentAccepted = courier.total_delivery_requests_accepted || 0;
      await supabase
        .from('customer')
        .update({ total_delivery_requests_accepted: currentAccepted + 1 })
        .eq('id', courier.id);

      await refreshCourier();
      onOfferResolved?.();
      onBack();
    } catch (err) {
      console.error('[OpenOfferScreen] Error accepting:', err);
      setError('Failed to accept delivery. Please try again.');
    } finally {
      setAccepting(false);
    }
  };

  // ── Reject ─────────────────────────────────────────────────────────────────

  const handleReject = async (isAutomatic = false) => {
    if (!courier?.id || !delivery) return;
    if (!isAutomatic) setRejecting(true);
    setError(null);

    try {
      // 1. Update delivery_request with rejection
      await supabase
        .from('delivery_request')
        .update({
          rejected_by_couriers: [
            ...(delivery.rejected_by_couriers || []),
            { courier_id: courier.id, rejected_at: new Date().toISOString() },
          ],
        })
        .eq('id', deliveryRequestId);

      // 2. Update delivery_offer status
      if (deliveryOffer) {
        await supabase
          .from('delivery_offer')
          .update({
            status: isAutomatic ? 'timed_out' : 'rejected_by_courier',
            rejected_at: new Date().toISOString(),
          })
          .eq('id', deliveryOffer.id);

        // 3. Assess penalty (exclusive offers only, or manual rejection of open)
        let penaltyReason: string | null = null;
        if (delivery.is_outside_order) {
          penaltyReason = isAutomatic ? null : 'rejected_open';
        } else if (isAutomatic && deliveryOffer.type === 'exclusive') {
          penaltyReason = 'expired_exclusive';
        } else if (!isAutomatic && deliveryOffer.type === 'exclusive') {
          penaltyReason = 'rejected_exclusive';
        } else if (!isAutomatic && deliveryOffer.type === 'open') {
          penaltyReason = 'rejected_open';
        }

        if (penaltyReason) {
          try {
            await supabase.functions.invoke('assess-courier-penalty', {
              body: {
                delivery_offer_id: deliveryOffer.id,
                reason: penaltyReason,
              },
            });
          } catch (penErr) {
            console.error('[OpenOfferScreen] Penalty error:', penErr);
          }
        }

        // 4. Create next sequential offer (for exclusive offers)
        if (deliveryOffer.type === 'exclusive') {
          try {
            await supabase.functions.invoke('create-next-sequential-offer', {
              body: {
                rejected_offer_id: deliveryOffer.id,
              },
            });
          } catch (nextErr) {
            console.error('[OpenOfferScreen] Next offer error:', nextErr);
          }
        }
      }

      // 5. Increment courier's rejected count
      const currentRejected = courier.total_delivery_requests_rejected || 0;
      await supabase
        .from('customer')
        .update({ total_delivery_requests_rejected: currentRejected + 1 })
        .eq('id', courier.id);

      await refreshCourier();
      onOfferResolved?.();
      onBack();
    } catch (err) {
      console.error('[OpenOfferScreen] Error rejecting:', err);
      if (!isAutomatic) {
        setError('Failed to reject delivery. Please try again.');
        setRejecting(false);
      }
    }
  };

  // ── Dark theme ─────────────────────────────────────────────────────────────

  const bg = '#000000';
  const cardBg = '#2a2a2a';
  const textColor = '#FFFFFF';
  const textSecColor = '#9CA3AF';

  const profileImage = courier?.profile_picture_url || null;

  // ── Derived values ─────────────────────────────────────────────────────────

  const deliveryNum = delivery?.delivery_number
    ? `#${delivery.delivery_number}`
    : delivery
    ? `#${delivery.id.slice(-6).toUpperCase()}`
    : '';

  const minutesUntilPickup = calculateMinutesUntilPickup(delivery?.pickup_eta || null);
  const deliveryDistKm = delivery?.delivery_distance_km || null;

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[styles.screen, { backgroundColor: bg, paddingTop: insets.top }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#ec2227" />
        </View>
      </View>
    );
  }

  // ── Accepted by another ────────────────────────────────────────────────────

  if (error === 'accepted_by_another') {
    return (
      <View style={[styles.screen, { backgroundColor: bg, paddingTop: insets.top }]}>
        <View style={styles.centeredMessage}>
          <Text style={[styles.centeredTitle, { color: textColor }]}>
            Delivery Accepted By Another Courier
          </Text>
          <Text style={[styles.centeredSubtitle, { color: textSecColor }]}>
            Another courier has accepted this delivery. You can return to view other available deliveries.
          </Text>
          <TouchableOpacity
            style={[styles.centeredButton, { backgroundColor: '#ec2227' }]}
            onPress={() => {
              onOfferResolved?.();
              onBack();
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.centeredButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────

  if (error && error !== 'accepted_by_another') {
    return (
      <View style={[styles.screen, { backgroundColor: bg, paddingTop: insets.top }]}>
        <View style={styles.centeredMessage}>
          <Text style={[styles.centeredTitle, { color: '#EF4444' }]}>{error}</Text>
          <TouchableOpacity
            style={[styles.centeredButton, { backgroundColor: '#ec2227' }]}
            onPress={onBack}
            activeOpacity={0.7}
          >
            <Text style={styles.centeredButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!delivery) {
    return (
      <View style={[styles.screen, { backgroundColor: bg, paddingTop: insets.top }]}>
        <View style={styles.centeredMessage}>
          <Text style={[styles.centeredTitle, { color: textColor }]}>Delivery not found</Text>
          <TouchableOpacity
            style={[styles.centeredButton, { backgroundColor: '#ec2227' }]}
            onPress={onBack}
            activeOpacity={0.7}
          >
            <Text style={styles.centeredButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const headerTitle = offerType === 'exclusive' ? 'Exclusive Offer' : 'Open Offer';

  return (
    <View style={[styles.screen, { backgroundColor: bg }]}>
      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        {profileImage ? (
          <TouchableOpacity onPress={onBack} activeOpacity={0.7}>
            <Image source={{ uri: profileImage }} style={styles.headerProfileImage} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={onBack}
            activeOpacity={0.7}
            style={[
              styles.headerProfileImage,
              { backgroundColor: '#333', alignItems: 'center', justifyContent: 'center' },
            ]}
          >
            <User size={20} color="#666" />
          </TouchableOpacity>
        )}

        <Text style={styles.headerTitle}>{headerTitle}</Text>

        <TouchableOpacity style={[styles.headerAction, { opacity: 0.3 }]}>
          <ZapOff size={24} color={textColor} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Delivery # + PENDING badge ── */}
        <View style={styles.deliveryRow}>
          <Text style={[styles.deliveryNumber, { color: textColor }]}>
            Delivery {deliveryNum}
          </Text>
          <View style={styles.pendingBadge}>
            <Text style={styles.pendingBadgeText}>PENDING</Text>
          </View>
        </View>

        {/* ── Restaurant card (PlaceCard component) ── */}
        {place && (
          <PlaceCard
            place={place}
            containerStyle={{ marginHorizontal: 0 }}
          />
        )}

        {/* ── To Pickup + Delivery Dist (side by side) ── */}
        <View style={styles.distanceRow}>
          <View style={[styles.distanceCard, { backgroundColor: cardBg }]}>
            <Text style={[styles.distanceLabel, { color: textSecColor }]}>To Pickup</Text>
            <Text style={[styles.distanceValue, { color: textColor }]}>
              {distanceToPickupKm !== null ? `${distanceToPickupKm.toFixed(1)}Km` : '—'}
            </Text>
          </View>
          <View style={[styles.distanceCard, { backgroundColor: cardBg }]}>
            <Text style={[styles.distanceLabel, { color: textSecColor }]}>Delivery Dist.</Text>
            <Text style={[styles.distanceValue, { color: textColor }]}>
              {deliveryDistKm !== null ? `${deliveryDistKm.toFixed(1)}Km` : '—'}
            </Text>
          </View>
        </View>

        {/* ── Points Offered card (full width) ── */}
        <View style={[styles.pointsCard, { backgroundColor: cardBg }]}>
          <Text style={[styles.distanceLabel, { color: textSecColor }]}>Points Offered</Text>
          <Text style={[styles.pointsValue, { color: textColor }]}>
            {Math.round(delivery.points_offered || 0)}
          </Text>
        </View>

        {/* ── Arrive In + REJECT + ACCEPT card ── */}
        <View style={[styles.arriveActionsCard, { backgroundColor: cardBg }]}>
          <View style={styles.arriveActionsRow}>
            <View style={styles.arriveInColumn}>
              <Text style={[styles.distanceLabel, { color: textSecColor }]}>Arrive In</Text>
              <Text style={[styles.arriveInValue, { color: textColor }]}>
                {minutesUntilPickup !== null ? `${Math.abs(minutesUntilPickup)} Min` : '—'}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.rejectButton}
              onPress={() => handleReject(false)}
              disabled={accepting || rejecting}
              activeOpacity={0.7}
            >
              {rejecting ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Text style={styles.rejectButtonText}>REJECT</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.acceptButton}
              onPress={handleAccept}
              disabled={accepting || rejecting}
              activeOpacity={0.7}
            >
              {accepting ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Text style={styles.acceptButtonText}>ACCEPT</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Exclusive countdown ── */}
        {countdown !== null && countdown > 0 && deliveryOffer?.type === 'exclusive' && (
          <Text style={styles.countdownText}>
            You have{' '}
            <Text style={{ color: '#EF4444', fontFamily: fontFamily.bold }}>
              {countdown} seconds
            </Text>{' '}
            to accept or reject before it expires.
          </Text>
        )}

        {/* ── Map placeholder ── */}
        <View style={[styles.mapPlaceholder, { backgroundColor: cardBg }]}>
          <Text style={[styles.mapPlaceholderText, { color: textSecColor }]}>
            Map coming soon
          </Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
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
    paddingBottom: 12,
  },
  headerProfileImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  headerTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  headerAction: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Delivery row
  deliveryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  deliveryNumber: {
    fontFamily: fontFamily.regular,
    fontSize: 22,
  },
  pendingBadge: {
    borderWidth: 1.5,
    borderColor: '#F97316',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 5,
  },
  pendingBadgeText: {
    fontFamily: fontFamily.bold,
    fontSize: 13,
    color: '#F97316',
    letterSpacing: 0.5,
  },

  // Distance cards row (side by side, full width)
  distanceRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  distanceCard: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  distanceLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    marginBottom: 2,
  },
  distanceValue: {
    fontFamily: fontFamily.bold,
    fontSize: 22,
  },

  // Points Offered card (separate, full width)
  pointsCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
  },
  pointsValue: {
    fontFamily: fontFamily.bold,
    fontSize: 22,
  },

  // Arrive In + buttons card
  arriveActionsCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  arriveActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  arriveInColumn: {
    flex: 1,
  },
  arriveInValue: {
    fontFamily: fontFamily.bold,
    fontSize: 22,
  },

  // Buttons
  rejectButton: {
    backgroundColor: '#EF4444',
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectButtonText: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  acceptButton: {
    backgroundColor: '#27d20b',
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptButtonText: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },

  // Countdown text
  countdownText: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 18,
  },

  // Map placeholder
  mapPlaceholder: {
    borderRadius: 16,
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapPlaceholderText: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
  },

  // Centered messages (errors, accepted by another)
  centeredMessage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  centeredTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 20,
    textAlign: 'center',
    marginBottom: 12,
  },
  centeredSubtitle: {
    fontFamily: fontFamily.regular,
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  centeredButton: {
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 40,
    alignItems: 'center',
  },
  centeredButtonText: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
    color: '#FFFFFF',
  },
});
