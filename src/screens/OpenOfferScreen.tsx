import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { Audio } from 'expo-av';
import { ChevronLeft, User, X, ZapOff } from 'lucide-react-native';
import { useAuth } from '../contexts/AuthContext';
import { fontFamily } from '../constants/typography';
import { supabase } from '../lib/supabase';
import { getCurrentLocation } from '../services/locationService';
import { PlaceCard } from '../components/ui/PlaceCard';
import { useTheme } from '../contexts/ThemeContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ── Map marker icons ─────────────────────────────────────────────────────────

const MARKER_COURIER =
  'https://res.cloudinary.com/chowlocal/image/upload/v1772022321/map-icon-green-courier_nrnxkv.png';
const MARKER_PICKUP =
  'https://res.cloudinary.com/chowlocal/image/upload/v1772021304/map-icon-purple-place_slcoj1.png';
const MARKER_DROPOFF =
  'https://res.cloudinary.com/chowlocal/image/upload/v1772029798/customer-drop-off-location_gsvl82.png';

const REJECT_SOUND_URL =
  'https://res.cloudinary.com/chowlocal/video/upload/v1772032715/quick-fart_pelyey.wav';

const ACCEPT_SOUND_URL =
  'https://res.cloudinary.com/chowlocal/video/upload/v1772033249/196571__ecfike__yeeeeeaaaahh-yeah_dsiwmp.wav';

// ── Dark mode map style ──────────────────────────────────────────────────────

const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#242f3e' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#242f3e' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#746855' }] },
  {
    featureType: 'administrative.locality',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#d59563' }],
  },
  {
    featureType: 'poi',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#d59563' }],
  },
  {
    featureType: 'poi',
    elementType: 'labels.icon',
    stylers: [{ visibility: 'off' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'geometry',
    stylers: [{ color: '#263c3f' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#6b9a76' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: '#38414e' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#212a37' }],
  },
  {
    featureType: 'road',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#9ca5b3' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry',
    stylers: [{ color: '#746855' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#1f2835' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#f3d19c' }],
  },
  {
    featureType: 'transit',
    elementType: 'geometry',
    stylers: [{ color: '#2f3948' }],
  },
  {
    featureType: 'transit.station',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#d59563' }],
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#17263c' }],
  },
  {
    featureType: 'water',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#515c6d' }],
  },
  {
    featureType: 'water',
    elementType: 'labels.text.stroke',
    stylers: [{ color: '#17263c' }],
  },
];

// ── Types ────────────────────────────────────────────────────────────────────

interface OpenOfferScreenProps {
  deliveryRequestId: string;
  offerType: 'open' | 'exclusive';
  onBack: () => void;
  /** Called after accept/reject so parent can reload offers */
  onOfferResolved?: () => void;
  /**
   * When true, the screen cannot be dismissed — no back button.
   * Used for exclusive offers that must be accepted/rejected/expired.
   */
  isForced?: boolean;
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

interface CoordPoint {
  latitude: number;
  longitude: number;
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
  isForced = false,
}: OpenOfferScreenProps) {
  const { courier, refreshCourier } = useAuth();
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView | null>(null);
  const fullscreenMapRef = useRef<MapView | null>(null);

  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMapFullscreen, setShowMapFullscreen] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  const [delivery, setDelivery] = useState<DeliveryData | null>(null);
  const [place, setPlace] = useState<PlaceData | null>(null);
  const [deliveryOffer, setDeliveryOffer] = useState<DeliveryOfferData | null>(null);
  const [distanceToPickupKm, setDistanceToPickupKm] = useState<number | null>(null);
  const [courierLocation, setCourierLocation] = useState<CoordPoint | null>(null);

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

      // Show screen immediately — GPS loads in background
      setLoading(false);

      // 4. Background: get courier location
      loadCourierLocation(raw);
    } catch (err) {
      console.error('[OpenOfferScreen] Unexpected error:', err);
      setError('Failed to load delivery details');
      setLoading(false);
    }
  }, [courier?.id, deliveryRequestId]);

  /** Background task: GPS location (never blocks UI) */
  const loadCourierLocation = useCallback(
    async (raw: any) => {
      let courierLoc: CoordPoint | null = null;

      // Try GPS first
      try {
        const loc = await getCurrentLocation();
        if (loc) {
          courierLoc = {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          };
        }
      } catch (locErr) {
        console.warn('[OpenOfferScreen] GPS unavailable:', locErr);
      }

      // Fallback to courier profile location
      if (
        !courierLoc &&
        courier?.current_location_latitude &&
        courier?.current_location_longitude
      ) {
        courierLoc = {
          latitude: courier.current_location_latitude,
          longitude: courier.current_location_longitude,
        };
      }

      if (courierLoc) {
        setCourierLocation(courierLoc);

        // Calculate straight-line distance to pickup
        if (raw.pickup_latitude && raw.pickup_longitude) {
          const dist = calculateDistanceKm(
            courierLoc.latitude,
            courierLoc.longitude,
            raw.pickup_latitude,
            raw.pickup_longitude,
          );
          setDistanceToPickupKm(dist);
        }
      }
    },
    [courier?.current_location_latitude, courier?.current_location_longitude],
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Fit map when map is ready AND/OR courier location changes ─────────────

  useEffect(() => {
    if (!mapReady || !delivery) return;

    const coords: CoordPoint[] = [];
    if (courierLocation) coords.push(courierLocation);
    if (delivery.pickup_latitude && delivery.pickup_longitude) {
      coords.push({ latitude: delivery.pickup_latitude, longitude: delivery.pickup_longitude });
    }
    if (delivery.dropoff_latitude && delivery.dropoff_longitude) {
      coords.push({ latitude: delivery.dropoff_latitude, longitude: delivery.dropoff_longitude });
    }

    if (coords.length >= 2 && mapRef.current) {
      setTimeout(() => {
        mapRef.current?.fitToCoordinates(coords, {
          edgePadding: { top: 60, right: 60, bottom: 60, left: 60 },
          animated: true,
        });
      }, 400);
    }
  }, [mapReady, courierLocation, delivery]);

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

    // Play accept sound
    try {
      const { sound } = await Audio.Sound.createAsync({ uri: ACCEPT_SOUND_URL });
      await sound.playAsync();
      sound.setOnPlaybackStatusUpdate((status: any) => {
        if (status.didJustFinish) sound.unloadAsync();
      });
    } catch (soundErr) {
      console.warn('[OpenOfferScreen] Accept sound error:', soundErr);
    }

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
    if (!isAutomatic) {
      setRejecting(true);
      // Play reject sound
      try {
        const { sound } = await Audio.Sound.createAsync({ uri: REJECT_SOUND_URL });
        await sound.playAsync();
        // Auto-unload after playback
        sound.setOnPlaybackStatusUpdate((status: any) => {
          if (status.didJustFinish) sound.unloadAsync();
        });
      } catch (soundErr) {
        console.warn('[OpenOfferScreen] Reject sound error:', soundErr);
      }
    }
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

  // Map coordinates
  const pickupCoord =
    delivery?.pickup_latitude && delivery?.pickup_longitude
      ? { latitude: delivery.pickup_latitude, longitude: delivery.pickup_longitude }
      : null;

  const dropoffCoord =
    delivery?.dropoff_latitude && delivery?.dropoff_longitude
      ? { latitude: delivery.dropoff_latitude, longitude: delivery.dropoff_longitude }
      : null;

  // Fallback region before fitToCoordinates runs
  const fallbackRegion = pickupCoord
    ? {
        latitude: pickupCoord.latitude,
        longitude: pickupCoord.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      }
    : {
        latitude: 50.4452,
        longitude: -104.6189,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      };

  // Collect all valid coords for fitToCoordinates
  const allMapCoords: CoordPoint[] = [];
  if (courierLocation) allMapCoords.push(courierLocation);
  if (pickupCoord) allMapCoords.push(pickupCoord);
  if (dropoffCoord) allMapCoords.push(dropoffCoord);

  // ── Shared map markers renderer ────────────────────────────────────────────

  const renderMapMarkers = () => (
    <>
      {pickupCoord && (
        <Marker
          key="marker-pickup"
          identifier="marker-pickup"
          coordinate={pickupCoord}
          title={place?.name || 'Pickup'}
          zIndex={1}
        >
          <Image
            source={{ uri: MARKER_PICKUP }}
            style={{ width: 40, height: 40 }}
            resizeMode="contain"
          />
        </Marker>
      )}
      {dropoffCoord && (
        <Marker
          key="marker-dropoff"
          identifier="marker-dropoff"
          coordinate={dropoffCoord}
          title={delivery?.dropoff_address || 'Dropoff'}
          zIndex={2}
        >
          <Image
            source={{ uri: MARKER_DROPOFF }}
            style={{ width: 40, height: 40 }}
            resizeMode="contain"
          />
        </Marker>
      )}
      {courierLocation && (
        <Marker
          key="marker-courier"
          identifier="marker-courier"
          coordinate={courierLocation}
          title="You"
          anchor={{ x: 0.5, y: 0.5 }}
          zIndex={3}
        >
          <Image
            source={{ uri: MARKER_COURIER }}
            style={{ width: 40, height: 40 }}
            resizeMode="contain"
          />
        </Marker>
      )}
    </>
  );

  /** Fit all markers on the given map ref */
  const fitMap = (ref: MapView | null) => {
    if (!ref || allMapCoords.length < 2) return;
    setTimeout(() => {
      ref.fitToCoordinates(allMapCoords, {
        edgePadding: { top: 60, right: 60, bottom: 60, left: 60 },
        animated: false,
      });
    }, 300);
  };

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
            Another courier has accepted this delivery. You can return to view other available
            deliveries.
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
          {!isForced && (
            <TouchableOpacity
              style={[styles.centeredButton, { backgroundColor: '#ec2227' }]}
              onPress={onBack}
              activeOpacity={0.7}
            >
              <Text style={styles.centeredButtonText}>Go Back</Text>
            </TouchableOpacity>
          )}
          {isForced && (
            <TouchableOpacity
              style={[styles.centeredButton, { backgroundColor: '#ec2227', marginTop: 12 }]}
              onPress={loadData}
              activeOpacity={0.7}
            >
              <Text style={styles.centeredButtonText}>Retry</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  if (!delivery) {
    return (
      <View style={[styles.screen, { backgroundColor: bg, paddingTop: insets.top }]}>
        <View style={styles.centeredMessage}>
          <Text style={[styles.centeredTitle, { color: textColor }]}>Delivery not found</Text>
          {!isForced && (
            <TouchableOpacity
              style={[styles.centeredButton, { backgroundColor: '#ec2227' }]}
              onPress={onBack}
              activeOpacity={0.7}
            >
              <Text style={styles.centeredButtonText}>Go Back</Text>
            </TouchableOpacity>
          )}
          {isForced && (
            <TouchableOpacity
              style={[styles.centeredButton, { backgroundColor: '#ec2227', marginTop: 12 }]}
              onPress={loadData}
              activeOpacity={0.7}
            >
              <Text style={styles.centeredButtonText}>Retry</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  const headerTitle = offerType === 'exclusive' ? 'Exclusive Offer' : 'Open Offer';

  return (
    <View style={[styles.screen, { backgroundColor: bg }]}>
      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        {isForced ? (
          // Forced mode: show profile pic but NOT tappable (no back navigation)
          profileImage ? (
            <Image source={{ uri: profileImage }} style={styles.headerProfileImage} />
          ) : (
            <View
              style={[
                styles.headerProfileImage,
                { backgroundColor: '#333', alignItems: 'center', justifyContent: 'center' },
              ]}
            >
              <User size={20} color="#666" />
            </View>
          )
        ) : (
          // Normal mode: tappable profile pic acts as back button
          profileImage ? (
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
          )
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
          <PlaceCard place={place} containerStyle={{ marginHorizontal: 0 }} />
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

        {/* ── Map (locked – tap to expand) ── */}
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => setShowMapFullscreen(true)}
          style={[styles.mapContainer, { backgroundColor: cardBg }]}
        >
          <MapView
            ref={mapRef}
            style={styles.map}
            provider={PROVIDER_GOOGLE}
            initialRegion={fallbackRegion}
            showsUserLocation={false}
            showsMyLocationButton={false}
            customMapStyle={DARK_MAP_STYLE}
            scrollEnabled={false}
            zoomEnabled={false}
            rotateEnabled={false}
            pitchEnabled={false}
            toolbarEnabled={false}
            pointerEvents="none"
            onMapReady={() => setMapReady(true)}
          >
            {renderMapMarkers()}
          </MapView>
          <View style={styles.mapTapHint}>
            <Text style={styles.mapTapHintText}>Tap to expand</Text>
          </View>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── Fullscreen Map Modal ── */}
      <Modal
        visible={showMapFullscreen}
        animationType="slide"
        onRequestClose={() => setShowMapFullscreen(false)}
      >
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <MapView
            ref={fullscreenMapRef}
            style={{ flex: 1 }}
            provider={PROVIDER_GOOGLE}
            initialRegion={fallbackRegion}
            showsUserLocation={false}
            showsMyLocationButton={false}
            customMapStyle={DARK_MAP_STYLE}
            onMapReady={() => fitMap(fullscreenMapRef.current)}
          >
            {renderMapMarkers()}
          </MapView>
          <TouchableOpacity
            style={[
              styles.mapCloseButton,
              { top: insets.top + 12, backgroundColor: isDark ? '#FFFFFF' : '#000000' },
            ]}
            onPress={() => setShowMapFullscreen(false)}
            activeOpacity={0.8}
          >
            <X size={20} color={isDark ? '#000000' : '#FFFFFF'} strokeWidth={2.5} />
          </TouchableOpacity>
        </View>
      </Modal>
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

  // Map
  mapContainer: {
    borderRadius: 16,
    overflow: 'hidden',
    height: 280,
  },
  map: {
    flex: 1,
  },
  mapTapHint: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  mapTapHintText: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: '#FFFFFF',
  },
  mapCloseButton: {
    position: 'absolute',
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
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
