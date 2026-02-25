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
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { ChevronLeft, Phone, X, ZapOff } from 'lucide-react-native';
import { useAuth } from '../contexts/AuthContext';
import { fontFamily } from '../constants/typography';
import { supabase } from '../lib/supabase';
import { getCurrentLocation } from '../services/locationService';
import { PlaceCard } from '../components/ui/PlaceCard';
import { useTheme } from '../contexts/ThemeContext';
import { useButtonFeedback } from '../hooks/useButtonFeedback';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// —— Map marker icons ————————————————————————————————————————————

const MARKER_COURIER =
  'https://res.cloudinary.com/chowlocal/image/upload/v1772022321/map-icon-green-courier_nrnxkv.png';
const MARKER_PICKUP =
  'https://res.cloudinary.com/chowlocal/image/upload/v1772021304/map-icon-purple-place_slcoj1.png';
const MARKER_DROPOFF =
  'https://res.cloudinary.com/chowlocal/image/upload/v1772029798/customer-drop-off-location_gsvl82.png';
const DEFAULT_CUSTOMER_AVATAR =
  'https://res.cloudinary.com/chowlocal/image/upload/v1768914448/9187604_treelj.png';

// —— Types ——————————————————————————————————————————————————————————

interface ActiveDeliveryScreenProps {
  deliveryRequestId: string;
  onBack: () => void;
  onDeliveryCompleted?: () => void;
  onOfferPress?: (deliveryRequestId: string, offerType: 'open' | 'exclusive') => void;
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

interface CustomerData {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone_number: string | null;
  profile_picture_url: string | null;
}

interface DeliveryData {
  id: string;
  delivery_number: string | null;
  order_number: string | null;
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
  drop_off_eta: string | null;
  eta_minutes: number | null;
  points_offered: number | null;
  courier_earnings: number | null;
  is_outside_order: boolean | null;
  outside_order_delivery_customer_name: string | null;
  outside_order_delivery_customer_phone_number: string | null;
}

interface RouteCoord {
  latitude: number;
  longitude: number;
}

// —— Helpers ————————————————————————————————————————————————————

/** Extract just the street address part (strip city, state, zip, country) */
function formatStreetAddress(fullAddress: string | null): string {
  if (!fullAddress) return '—';
  // Split on comma, take just the first part (street address)
  const parts = fullAddress.split(',');
  return parts[0]?.trim() || '—';
}

function calculateDistanceKm(
  lat1: number, lon1: number, lat2: number, lon2: number,
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

function calculateMinutesUntil(eta: string | null): number | null {
  if (!eta) return null;
  const now = new Date();
  const target = new Date(eta);
  return Math.round((target.getTime() - now.getTime()) / 60000);
}

function decodePolyline(encoded: string): RouteCoord[] {
  const points: RouteCoord[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let b: number;
    let shift = 0;
    let result = 0;

    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;

    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    points.push({
      latitude: lat / 1e5,
      longitude: lng / 1e5,
    });
  }

  return points;
}

function calculateMinutesUntilPickup(pickupEta: string | null): number | null {
  if (!pickupEta) return null;
  const now = new Date();
  const eta = new Date(pickupEta);
  return Math.round((eta.getTime() - now.getTime()) / 60000);
}

// —— Badge colors ———————————————————————————————————————————

const STATUS_COLORS: Record<string, string> = {
  accepted_by_courier: '#1f48ff',
  arrived_at_pickup: '#8B5CF6',
  en_route: '#ffd21f',
  arrived_at_dropoff: '#06B6D4',
  delivered: '#22C55E',
};

const STATUS_LABELS: Record<string, string> = {
  accepted_by_courier: 'ACCEPTED',
  arrived_at_pickup: 'AT PICKUP',
  en_route: 'EN ROUTE',
  arrived_at_dropoff: 'AT DROPOFF',
  delivered: 'DELIVERED',
};

// —— Dark mode map style ———————————————————————————————————————

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

// —— Button width constant so AT PICKUP and DIRECTIONS match ————————

const ACTION_BTN_WIDTH = 140;

// —— Arrive In Badge (reused from OnlineScreen) ————————————————————

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

// —— Component ————————————————————————————————————————————————

export function ActiveDeliveryScreen({
  deliveryRequestId,
  onBack,
  onDeliveryCompleted,
  onOfferPress,
}: ActiveDeliveryScreenProps) {
  const { courier, refreshCourier } = useAuth();
  const { isDark } = useTheme();
  const { tapFeedback } = useButtonFeedback();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView | null>(null);
  const fullscreenMapRef = useRef<MapView | null>(null);

  const [loading, setLoading] = useState(true);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showOfflineModal, setShowOfflineModal] = useState(false);
  const [showMapFullscreen, setShowMapFullscreen] = useState(false);

  const [delivery, setDelivery] = useState<DeliveryData | null>(null);
  const [place, setPlace] = useState<PlaceData | null>(null);
  const [customer, setCustomer] = useState<CustomerData | null>(null);
  const [distanceToPickupKm, setDistanceToPickupKm] = useState<number | null>(null);
  const [distanceToDropoffKm, setDistanceToDropoffKm] = useState<number | null>(null);
  const [courierLocation, setCourierLocation] = useState<RouteCoord | null>(null);
  const [routeCoords, setRouteCoords] = useState<RouteCoord[]>([]);

  // —— Open Offers state (exclusive offers handled by MainLayout forced screen) ——
  const [openOffers, setOpenOffers] = useState<any[]>([]);

  // —— Load delivery data ——————————————————————————————————————

  const loadData = useCallback(async () => {
    if (!courier?.id) return;

    try {
      setLoading(true);
      setError(null);

      const { data: drData, error: drError } = await supabase
        .from('delivery_request')
        .select(
          `id, delivery_number, order_number, status, place_id, courier_id,
           pickup_address, pickup_latitude, pickup_longitude,
           dropoff_address, dropoff_latitude, dropoff_longitude,
           delivery_distance_km, delivery_distance_miles,
           pickup_eta, drop_off_eta, eta_minutes, points_offered,
           courier_earnings, is_outside_order,
           outside_order_delivery_customer_name,
           outside_order_delivery_customer_phone_number,
           place:place_id (
             id, name, address_line_1, city, state,
             profile_picture_url, photos, rating, average_rating,
             total_reviews, phone_number
           ),
           customer:customer_id (
             id, first_name, last_name, phone_number, profile_picture_url
           )`,
        )
        .eq('id', deliveryRequestId)
        .single();

      if (drError || !drData) {
        console.error('[ActiveDelivery] Error loading delivery:', drError);
        setError('Delivery not found');
        setLoading(false);
        return;
      }

      const raw = drData as any;
      const placeRaw = Array.isArray(raw.place) ? raw.place[0] : raw.place;
      const customerRaw = Array.isArray(raw.customer) ? raw.customer[0] : raw.customer;

      setDelivery(raw as DeliveryData);
      setPlace(placeRaw as PlaceData);
      setCustomer(customerRaw as CustomerData || null);

      // ✅ Show screen immediately — GPS + route load in background
      setLoading(false);

      // Background: get courier location + route (non-blocking)
      loadLocationAndRoute(raw);
    } catch (err) {
      console.error('[ActiveDelivery] Unexpected error:', err);
      setError('Failed to load delivery details');
      setLoading(false);
    }
  }, [courier?.id, deliveryRequestId]);

  /** Background task: GPS location + route polyline (never blocks UI) */
  const loadLocationAndRoute = useCallback(async (raw: any) => {
    let courierLoc: RouteCoord | null = null;

    // Try GPS first, fall back to stored location
    try {
      const loc = await getCurrentLocation();
      if (loc) {
        courierLoc = {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        };
      }
    } catch (locErr) {
      console.warn('[ActiveDelivery] GPS unavailable, using stored location:', locErr);
    }

    // Fallback to courier profile location
    if (!courierLoc && courier?.current_location_latitude && courier?.current_location_longitude) {
      courierLoc = {
        latitude: courier.current_location_latitude,
        longitude: courier.current_location_longitude,
      };
    }

    if (!courierLoc) return;

    setCourierLocation(courierLoc);

    // Calculate straight-line distance to pickup
    if (raw.pickup_latitude && raw.pickup_longitude) {
      const dist = calculateDistanceKm(
        courierLoc.latitude, courierLoc.longitude,
        raw.pickup_latitude, raw.pickup_longitude,
      );
      setDistanceToPickupKm(dist);
    }

    // Calculate straight-line distance to dropoff
    if (raw.dropoff_latitude && raw.dropoff_longitude) {
      const distDrop = calculateDistanceKm(
        courierLoc.latitude, courierLoc.longitude,
        raw.dropoff_latitude, raw.dropoff_longitude,
      );
      setDistanceToDropoffKm(distDrop);
    }
  }, [courier?.current_location_latitude, courier?.current_location_longitude]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // —— Fit map when courier location arrives ——————————————————————

  useEffect(() => {
    if (!courierLocation || !delivery) return;

    const coords: RouteCoord[] = [courierLocation];
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
  }, [courierLocation, delivery]);

  // —— Load open offers via RPC ————————————————————————————————————

  const loadOffers = useCallback(async () => {
    if (!courier?.id) return;

    try {
      const { data, error } = await supabase.rpc('get_courier_delivery', {
        courier_id_param: courier.id,
      });

      if (error) {
        console.error('[ActiveDelivery] Error fetching offers:', error);
        setOpenOffers([]);
        return;
      }

      if (!data || data.length === 0) {
        setOpenOffers([]);
        return;
      }

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
      console.error('[ActiveDelivery] Error loading offers:', err);
      setOpenOffers([]);
    }
  }, [courier?.id]);

  // Load offers on mount
  useEffect(() => {
    loadOffers();
  }, [loadOffers]);

  // —— Realtime subscription for delivery offers ——————————————————

  useEffect(() => {
    if (!courier?.id) return;

    const subscription = supabase
      .channel(`active-delivery-offers-${courier.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'delivery_offer',
        },
        (payload: any) => {
          console.log('[ActiveDelivery] Realtime offer event:', payload.eventType);
          loadOffers();
        }
      )
      .subscribe((status: string) => {
        console.log('[ActiveDelivery] Offers subscription:', status);
      });

    return () => {
      subscription.unsubscribe();
    };
  }, [courier?.id, loadOffers]);

  // —— Fetch route from Google Directions API via edge function ————————

  const fetchRoute = async (origin: RouteCoord, destination: RouteCoord) => {
    try {
      console.log('[ActiveDelivery] Fetching route from', origin, 'to', destination);
      const { data, error } = await supabase.functions.invoke('get-driving-distance', {
        body: {
          origin_lat: origin.latitude,
          origin_lng: origin.longitude,
          destination_lat: destination.latitude,
          destination_lng: destination.longitude,
          include_polyline: true,
        },
      });

      console.log('[ActiveDelivery] Route response:', JSON.stringify(data)?.slice(0, 300), 'error:', error);

      if (!error && data?.polyline) {
        const decoded = decodePolyline(data.polyline);
        console.log('[ActiveDelivery] Decoded polyline points:', decoded.length);
        setRouteCoords(decoded);
      } else if (!error && data?.routes?.[0]?.overview_polyline?.points) {
        const decoded = decodePolyline(data.routes[0].overview_polyline.points);
        console.log('[ActiveDelivery] Decoded routes polyline points:', decoded.length);
        setRouteCoords(decoded);
      } else {
        console.warn('[ActiveDelivery] No polyline in response');
      }
    } catch (err) {
      console.warn('[ActiveDelivery] Could not fetch route:', err);
    }
  };

  // —— Refresh minutes timer —————————————————————————————————————

  const [minutesUntilPickup, setMinutesUntilPickup] = useState<number | null>(null);
  const [minutesUntilDropoff, setMinutesUntilDropoff] = useState<number | null>(null);

  useEffect(() => {
    if (!delivery?.pickup_eta) return;

    const update = () => setMinutesUntilPickup(calculateMinutesUntil(delivery.pickup_eta));
    update();
    const interval = setInterval(update, 30000);
    return () => clearInterval(interval);
  }, [delivery?.pickup_eta]);

  useEffect(() => {
    if (!delivery?.drop_off_eta) return;

    const update = () => setMinutesUntilDropoff(calculateMinutesUntil(delivery.drop_off_eta));
    update();
    const interval = setInterval(update, 30000);
    return () => clearInterval(interval);
  }, [delivery?.drop_off_eta]);

  // —— Status update: Arrived at Pickup ——————————————————————————

  const handleArrivedAtPickup = async () => {
    if (!delivery) return;
    setUpdatingStatus(true);
    setError(null);

    try {
      const { error: statusError } = await supabase.functions.invoke('update-delivery-status', {
        body: {
          delivery_request_id: deliveryRequestId,
          new_status: 'arrived_at_pickup',
        },
      });

      if (statusError) {
        console.error('[ActiveDelivery] Status update error:', statusError);
        setError('Failed to update status. Please try again.');
      } else {
        await loadData();
      }
    } catch (err) {
      console.error('[ActiveDelivery] Error updating status:', err);
      setError('Failed to update status. Please try again.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  // —— Status update: Received order (mark en_route) ——————————————

  const handleReceivedOrder = async () => {
    if (!delivery) return;
    setUpdatingStatus(true);
    setError(null);

    try {
      const { error: statusError } = await supabase.functions.invoke('update-delivery-status', {
        body: {
          delivery_request_id: deliveryRequestId,
          new_status: 'en_route',
        },
      });

      if (statusError) {
        console.error('[ActiveDelivery] Status update error:', statusError);
        setError('Failed to update status. Please try again.');
      } else {
        await loadData();
      }
    } catch (err) {
      console.error('[ActiveDelivery] Error updating status:', err);
      setError('Failed to update status. Please try again.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  // —— Open directions to DROPOFF in Google Maps ——————————————————

  const handleDirectionsToDropoff = () => {
    if (!delivery?.dropoff_latitude || !delivery?.dropoff_longitude) return;

    const destination = `${delivery.dropoff_latitude},${delivery.dropoff_longitude}`;
    let url = `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`;

    if (courierLocation) {
      url += `&origin=${courierLocation.latitude},${courierLocation.longitude}`;
    }

    Linking.openURL(url);
  };

  // —— Status update: Arrived at dropoff ————————————————————————————

  const handleArrivedAtDropoff = async () => {
    if (!delivery) return;
    setUpdatingStatus(true);
    setError(null);

    try {
      const { error: statusError } = await supabase.functions.invoke('update-delivery-status', {
        body: {
          delivery_request_id: deliveryRequestId,
          new_status: 'arrived_at_dropoff',
        },
      });

      if (statusError) {
        console.error('[ActiveDelivery] Status update error:', statusError);
        setError('Failed to update status. Please try again.');
      } else {
        await loadData();
      }
    } catch (err) {
      console.error('[ActiveDelivery] Error updating status:', err);
      setError('Failed to update status. Please try again.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  // —— Call customer ——————————————————————————————————————————————

  const handleCallCustomer = () => {
    const phone = delivery?.is_outside_order === true
      ? delivery?.outside_order_delivery_customer_phone_number
      : customer?.phone_number;
    if (!phone) {
      Alert.alert('No Phone Number', 'Phone number not available for this customer.');
      return;
    }
    Linking.openURL(`tel:${phone}`);
  };

  // —— Open directions in Google Maps ——————————————————————————————

  const handleDirections = () => {
    if (!place || !delivery?.pickup_latitude || !delivery?.pickup_longitude) return;

    const destination = `${delivery.pickup_latitude},${delivery.pickup_longitude}`;
    let url = `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`;

    if (courierLocation) {
      url += `&origin=${courierLocation.latitude},${courierLocation.longitude}`;
    }

    Linking.openURL(url);
  };

  // —— Call restaurant ———————————————————————————————————————————

  const handleCallRestaurant = () => {
    if (!place?.phone_number) {
      Alert.alert('No Phone Number', 'Phone number not available for this restaurant.');
      return;
    }
    Linking.openURL(`tel:${place.phone_number}`);
  };

  // —— Handle offer press ————————————————————————————————————————

  const handleOfferPress = (offer: any) => {
    const offerType = offer.delivery_offer?.type === 'exclusive' ? 'exclusive' : 'open';
    console.log('[ActiveDelivery] Offer pressed:', offer.id, 'type:', offerType);
    onOfferPress?.(offer.id, offerType as 'open' | 'exclusive');
  };

  // —— Dark theme ————————————————————————————————————————————————

  const bg = '#000000';
  const cardBg = '#2a2a2a';
  const textColor = '#FFFFFF';
  const textSecColor = '#9CA3AF';

  // —— Derived values ————————————————————————————————————————————

  const deliveryNum = delivery?.delivery_number
    ? `#${delivery.delivery_number}`
    : delivery
    ? `#${delivery.id.slice(-6).toUpperCase()}`
    : '';

  const orderNum = delivery?.order_number
    ? `#${delivery.order_number}`
    : '';

  const badgeColor = STATUS_COLORS[delivery?.status || ''] || '#6B7280';
  const badgeLabel = STATUS_LABELS[delivery?.status || ''] || delivery?.status || '';

  const totalOffers = openOffers.length;

  // Determine customer info (regular order vs outside order)
  const isOutsideOrder = delivery?.is_outside_order === true;
  const customerName = isOutsideOrder
    ? (delivery?.outside_order_delivery_customer_name || 'Customer')
    : (customer?.first_name || 'Customer');
  const customerPhone = isOutsideOrder
    ? (delivery?.outside_order_delivery_customer_phone_number || null)
    : (customer?.phone_number || null);
  const customerPhoto = isOutsideOrder ? null : (customer?.profile_picture_url || null);

  const isAtPickup = delivery?.status === 'arrived_at_pickup';
  const isEnRoute = delivery?.status === 'en_route';

  // —— Loading ———————————————————————————————————————————————————

  if (loading) {
    return (
      <View style={[styles.screen, { backgroundColor: bg, paddingTop: insets.top }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#ec2227" />
        </View>
      </View>
    );
  }

  // —— Error —————————————————————————————————————————————————————

  if (error || !delivery) {
    return (
      <View style={[styles.screen, { backgroundColor: bg, paddingTop: insets.top }]}>
        <View style={styles.centeredMessage}>
          <Text style={[styles.centeredTitle, { color: '#EF4444' }]}>
            {error || 'Delivery not found'}
          </Text>
          <TouchableOpacity
            style={[styles.centeredButton, { backgroundColor: '#ec2227' }]}
            onPress={() => { tapFeedback(); onBack(); }}
            activeOpacity={0.7}
          >
            <Text style={styles.centeredButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // —— Map coordinates ————————————————————————————————————————————

  const pickupCoord = delivery.pickup_latitude && delivery.pickup_longitude
    ? { latitude: delivery.pickup_latitude, longitude: delivery.pickup_longitude }
    : null;

  const dropoffCoord = delivery.dropoff_latitude && delivery.dropoff_longitude
    ? { latitude: delivery.dropoff_latitude, longitude: delivery.dropoff_longitude }
    : null;

  // Show pickup marker when heading to pickup, dropoff marker when heading to customer
  const isHeadingToDropoff = delivery.status === 'arrived_at_pickup'
    || delivery.status === 'en_route_to_customer'
    || delivery.status === 'arrived_at_dropoff';

  const destinationCoord = isHeadingToDropoff ? (dropoffCoord || pickupCoord) : pickupCoord;
  const destinationLabel = isHeadingToDropoff
    ? (delivery.dropoff_address || 'Dropoff')
    : (place?.name || 'Pickup');

  // Fallback region before fitToCoordinates runs
  const fallbackCenter = (isAtPickup || isEnRoute) && courierLocation
    ? courierLocation
    : pickupCoord;
  const fallbackRegion = fallbackCenter
    ? {
        latitude: fallbackCenter.latitude,
        longitude: fallbackCenter.longitude,
        latitudeDelta: 0.03,
        longitudeDelta: 0.03,
      }
    : {
        latitude: 50.4452,
        longitude: -104.6189,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      };

  // Collect all visible coords for fitToCoordinates
  const allMapCoords: RouteCoord[] = [];
  if (courierLocation) allMapCoords.push(courierLocation);
  if (!isAtPickup && !isEnRoute && pickupCoord) allMapCoords.push(pickupCoord);
  if (dropoffCoord) allMapCoords.push(dropoffCoord);

  /** Fit all markers on the given map ref */
  const fitMap = (ref: MapView | null) => {
    if (!ref) return;
    if (allMapCoords.length >= 2) {
      setTimeout(() => {
        ref.fitToCoordinates(allMapCoords, {
          edgePadding: { top: 60, right: 60, bottom: 60, left: 60 },
          animated: false,
        });
      }, 300);
    } else if (allMapCoords.length === 1) {
      // Single marker (e.g. courier only at pickup) — just animate to it
      setTimeout(() => {
        ref.animateToRegion({
          latitude: allMapCoords[0].latitude,
          longitude: allMapCoords[0].longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }, 0);
      }, 300);
    }
  };

  // —— Shared map markers renderer ————————————————————————————————

  const renderMapMarkers = () => (
    <>
      {/* Show pickup marker only when heading to pickup (not at pickup yet) */}
      {!isAtPickup && !isEnRoute && pickupCoord && (
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
          title={delivery.dropoff_address || 'Dropoff'}
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

  return (
    <View style={[styles.screen, { backgroundColor: bg }]}>
      {/* —— Header —— */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => { tapFeedback(); onBack(); }} activeOpacity={0.7} style={styles.headerBackButton}>
          <ChevronLeft size={28} color={textColor} />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>
          {orderNum ? `Order ${orderNum}` : `Delivery ${deliveryNum}`}
        </Text>

        <TouchableOpacity
          style={[styles.headerAction, { opacity: 0.3 }]}
          onPress={() => { tapFeedback(); setShowOfflineModal(true); }}
          activeOpacity={0.7}
        >
          <ZapOff size={24} color={textColor} />
        </TouchableOpacity>
      </View>

      {/* —— Offline modal —— */}
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
              You have an active delivery. Complete your delivery before going offline.
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

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* —— Delivery # + Status badge —— */}
        <View style={styles.deliveryRow}>
          <Text style={[styles.deliveryNumber, { color: textColor }]}>
            Delivery {deliveryNum}
          </Text>
          <View style={[styles.statusBadge, { borderColor: badgeColor }]}>
            <Text style={[styles.statusBadgeText, { color: badgeColor }]}>{badgeLabel}</Text>
          </View>
        </View>

        {/* ═══ STATUS: arrived_at_pickup ═══ */}
        {isAtPickup ? (
          <>
            {/* —— Customer card (full width, photo wraps left/top/bottom edge) —— */}
            <TouchableOpacity
              onPress={() => { tapFeedback(); handleCallCustomer(); }}
              activeOpacity={0.7}
              style={[styles.customerCard, { backgroundColor: cardBg }]}
            >
              <Image
                source={{ uri: customerPhoto || DEFAULT_CUSTOMER_AVATAR }}
                style={styles.customerPhoto}
              />
              <View style={styles.customerInfo}>
                <Text style={[styles.cardLabel, { color: textSecColor }]}>Customer</Text>
                <Text style={[styles.customerName, { color: textColor }]} numberOfLines={1}>
                  {customerName}
                </Text>
              </View>
              <View style={styles.customerPhoneIcon}>
                <Phone size={24} color={textColor} />
              </View>
            </TouchableOpacity>

            {/* —— Ready In + RECEIVED (full width) —— */}
            <View style={[styles.card, { backgroundColor: cardBg }]}>
              <View style={styles.inlineRow}>
                <View style={styles.inlineLeft}>
                  <Text style={[styles.cardLabel, { color: textSecColor }]}>Ready In</Text>
                  <Text style={[styles.cardBigValue, { color: textColor }]}>
                    {minutesUntilPickup !== null ? `${minutesUntilPickup}Min` : '—'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.receivedButton}
                  onPress={() => { tapFeedback(); handleReceivedOrder(); }}
                  disabled={updatingStatus}
                  activeOpacity={0.7}
                >
                  {updatingStatus ? (
                    <ActivityIndicator size="small" color="#000" />
                  ) : (
                    <Text style={styles.receivedButtonText}>RECEIVED</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>

            {/* —— Drop-off Address (full width) —— */}
            <View style={[styles.card, { backgroundColor: cardBg }]}>
              <Text style={[styles.cardLabel, { color: textSecColor }]}>Drop-off Address</Text>
              <Text style={[styles.dropoffAddressText, { color: textColor }]} numberOfLines={2}>
                {formatStreetAddress(delivery.dropoff_address)}
              </Text>
            </View>

            {/* —— To Drop Off + DIRECTIONS (full width) —— */}
            <View style={[styles.card, { backgroundColor: cardBg }]}>
              <View style={styles.inlineRow}>
                <View style={styles.inlineLeft}>
                  <Text style={[styles.cardLabel, { color: textSecColor }]}>To Drop Off</Text>
                  <Text style={[styles.cardBigValue, { color: textColor }]}>
                    {distanceToDropoffKm !== null ? `${distanceToDropoffKm.toFixed(1)}Km` : '—'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.directionsButton}
                  onPress={() => { tapFeedback(); handleDirectionsToDropoff(); }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.directionsButtonText}>DIRECTIONS</Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        ) : isEnRoute ? (
          <>
            {/* ═══ STATUS: en_route ═══ */}

            {/* —— Customer card (same as arrived_at_pickup) —— */}
            <TouchableOpacity
              onPress={() => { tapFeedback(); handleCallCustomer(); }}
              activeOpacity={0.7}
              style={[styles.customerCard, { backgroundColor: cardBg }]}
            >
              <Image
                source={{ uri: customerPhoto || DEFAULT_CUSTOMER_AVATAR }}
                style={styles.customerPhoto}
              />
              <View style={styles.customerInfo}>
                <Text style={[styles.cardLabel, { color: textSecColor }]}>Customer</Text>
                <Text style={[styles.customerName, { color: textColor }]} numberOfLines={1}>
                  {customerName}
                </Text>
              </View>
              <View style={styles.customerPhoneIcon}>
                <Phone size={24} color={textColor} />
              </View>
            </TouchableOpacity>

            {/* —— Arrive In + AT DROPOFF (full width) —— */}
            <View style={[styles.card, { backgroundColor: cardBg }]}>
              <View style={styles.inlineRow}>
                <View style={styles.inlineLeft}>
                  <Text style={[styles.cardLabel, { color: textSecColor }]}>Arrive In</Text>
                  <Text style={[styles.cardBigValue, { color: textColor }]}>
                    {minutesUntilDropoff !== null ? `${minutesUntilDropoff}Min` : '—'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.atDropoffButton}
                  onPress={() => { tapFeedback(); handleArrivedAtDropoff(); }}
                  disabled={updatingStatus}
                  activeOpacity={0.7}
                >
                  {updatingStatus ? (
                    <ActivityIndicator size="small" color="#000" />
                  ) : (
                    <Text style={styles.atDropoffButtonText}>AT DROPOFF</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>

            {/* —— Drop-off Address (full width) —— */}
            <View style={[styles.card, { backgroundColor: cardBg }]}>
              <Text style={[styles.cardLabel, { color: textSecColor }]}>Drop-off Address</Text>
              <Text style={[styles.dropoffAddressText, { color: textColor }]} numberOfLines={2}>
                {formatStreetAddress(delivery.dropoff_address)}
              </Text>
            </View>

            {/* —— To Drop Off + DIRECTIONS (full width) —— */}
            <View style={[styles.card, { backgroundColor: cardBg }]}>
              <View style={styles.inlineRow}>
                <View style={styles.inlineLeft}>
                  <Text style={[styles.cardLabel, { color: textSecColor }]}>To Drop Off</Text>
                  <Text style={[styles.cardBigValue, { color: textColor }]}>
                    {distanceToDropoffKm !== null ? `${distanceToDropoffKm.toFixed(1)}Km` : '—'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.directionsButton}
                  onPress={() => { tapFeedback(); handleDirectionsToDropoff(); }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.directionsButtonText}>DIRECTIONS</Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        ) : (
          <>
            {/* ═══ STATUS: accepted_by_courier (default) ═══ */}

            {/* —— Restaurant card —— */}
            {place && (
              <TouchableOpacity
                onPress={() => { tapFeedback(); handleCallRestaurant(); }}
                activeOpacity={0.7}
              >
                <PlaceCard
                  place={place}
                  containerStyle={{ marginHorizontal: 0 }}
                  rightAction={
                    <View style={styles.phoneButton}>
                      <Phone size={22} color={textColor} />
                    </View>
                  }
                />
              </TouchableOpacity>
            )}

            {/* —— Arrive In + AT PICKUP (inline row) —— */}
            <View style={[styles.card, { backgroundColor: cardBg }]}>
              <View style={styles.inlineRow}>
                <View style={styles.inlineLeft}>
                  <Text style={[styles.cardLabel, { color: textSecColor }]}>Arrive In</Text>
                  <Text style={[styles.cardBigValue, { color: textColor }]}>
                    {minutesUntilPickup !== null ? `${minutesUntilPickup}Min` : '—'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.atPickupButton}
                  onPress={() => { tapFeedback(); handleArrivedAtPickup(); }}
                  disabled={updatingStatus || delivery.status !== 'accepted_by_courier'}
                  activeOpacity={0.7}
                >
                  {updatingStatus ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <Text style={styles.atPickupButtonText}>AT PICKUP</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>

            {/* —— To Pickup + DIRECTIONS (inline row) —— */}
            <View style={[styles.card, { backgroundColor: cardBg }]}>
              <View style={styles.inlineRow}>
                <View style={styles.inlineLeft}>
                  <Text style={[styles.cardLabel, { color: textSecColor }]}>To Pickup</Text>
                  <Text style={[styles.cardBigValue, { color: textColor }]}>
                    {distanceToPickupKm !== null ? `${distanceToPickupKm.toFixed(1)}Km` : '—'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.directionsButton}
                  onPress={() => { tapFeedback(); handleDirections(); }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.directionsButtonText}>DIRECTIONS</Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}

        {/* —— Map (locked – tap to expand) —— */}
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => { tapFeedback(); setShowMapFullscreen(true); }}
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
            onMapReady={() => fitMap(mapRef.current)}
          >
            {renderMapMarkers()}
            {routeCoords.length > 0 && (
              <Polyline coordinates={routeCoords} strokeColor="#4285F4" strokeWidth={4} />
            )}
          </MapView>
          <View style={styles.mapTapHint}>
            <Text style={styles.mapTapHintText}>Tap to expand</Text>
          </View>
        </TouchableOpacity>

        {/* —— Open Offers Section —— */}
        {totalOffers > 0 && (
          <>
            <View style={styles.offersHeader}>
              <Text style={[styles.offersTitle, { color: textColor }]}>
                {totalOffers} Open Offer{totalOffers !== 1 ? 's' : ''}
              </Text>
            </View>

            {/* Open Offers */}
            {openOffers.map((offer) => (
              <TouchableOpacity
                key={offer.id}
                style={[styles.offerCard, { backgroundColor: cardBg }]}
                onPress={() => { tapFeedback(); handleOfferPress(offer); }}
                activeOpacity={0.7}
              >
                <View style={styles.offerCardContent}>
                  <View style={styles.offerInfo}>
                    <Text style={[styles.offerPoints, { color: textColor }]}>
                      {Math.round(offer.points_offered || 0).toLocaleString()} Points
                    </Text>
                    <Text style={[styles.offerPlaceName, { color: textSecColor }]}>
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

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* —— Fullscreen Map Modal —— */}
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
            {routeCoords.length > 0 && (
              <Polyline coordinates={routeCoords} strokeColor="#4285F4" strokeWidth={4} />
            )}
          </MapView>
          <TouchableOpacity
            style={[
              styles.mapCloseButton,
              { top: insets.top + 12, backgroundColor: isDark ? '#FFFFFF' : '#000000' },
            ]}
            onPress={() => { tapFeedback(); setShowMapFullscreen(false); }}
            activeOpacity={0.8}
          >
            <X size={20} color={isDark ? '#000000' : '#FFFFFF'} strokeWidth={2.5} />
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

// —— Styles ————————————————————————————————————————————————————————

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
  headerBackButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
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
    marginBottom: 12,
    marginTop: 8,
  },
  deliveryNumber: {
    fontFamily: fontFamily.regular,
    fontSize: 22,
  },
  statusBadge: {
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 7,
    borderWidth: 1.5,
    backgroundColor: 'transparent',
  },
  statusBadgeText: {
    fontFamily: fontFamily.bold,
    fontSize: 13,
    letterSpacing: 0.5,
  },

  // Generic card (full width, stacked)
  card: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },

  // Inline row layout (label left, button right)
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  inlineLeft: {
    flex: 1,
    gap: 2,
  },
  phoneButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Card shared label + value styles (left aligned)
  cardLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    textAlign: 'left',
  },
  cardBigValue: {
    fontFamily: fontFamily.bold,
    fontSize: 26,
    textAlign: 'left',
  },

  // AT PICKUP button (same width as DIRECTIONS)
  atPickupButton: {
    backgroundColor: '#8c52ff',
    borderRadius: 8,
    paddingVertical: 12,
    width: ACTION_BTN_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  atPickupButtonText: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },

  // Directions button (same width as AT PICKUP)
  directionsButton: {
    backgroundColor: '#000000',
    borderRadius: 8,
    paddingVertical: 12,
    width: ACTION_BTN_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  directionsButtonText: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },

  // —— Arrived at Pickup layout ——

  customerCard: {
    borderRadius: 12,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'stretch',
    marginBottom: 10,
  },
  customerPhoto: {
    width: 80,
    height: '100%',
    minHeight: 72,
  },
  customerInfo: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 14,
    justifyContent: 'center',
    gap: 2,
  },
  customerName: {
    fontFamily: fontFamily.bold,
    fontSize: 20,
  },
  customerPhoneIcon: {
    paddingRight: 16,
    alignSelf: 'center',
  },
  receivedButton: {
    backgroundColor: '#ffd21f',
    borderRadius: 8,
    paddingVertical: 12,
    width: ACTION_BTN_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  receivedButtonText: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    color: '#000000',
    letterSpacing: 0.5,
  },
  atDropoffButton: {
    backgroundColor: '#5ce1e6',
    borderRadius: 8,
    paddingVertical: 12,
    width: ACTION_BTN_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  atDropoffButtonText: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    color: '#000000',
    letterSpacing: 0.5,
  },
  dropoffAddressText: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
    marginTop: 4,
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

  // Open Offers section
  offersHeader: {
    marginTop: 24,
    marginBottom: 12,
  },
  offersTitle: {
    fontFamily: fontFamily.regular,
    fontSize: 20,
  },
  offerCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
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
  offerPlaceName: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
  },
  offerDistance: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
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

  // Centered messages
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
