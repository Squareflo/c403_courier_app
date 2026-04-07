import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  ImageBackground,
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
import { DARK_MAP_STYLE, LIGHT_MAP_STYLE } from '../styles/mapStyles';
import { formatDistance } from '../utils/distance';
import { Audio } from 'expo-av';
import { Phone, Star, X } from 'lucide-react-native';
import { useAuth } from '../contexts/AuthContext';
import { fontFamily } from '../constants/typography';
import { supabase } from '../lib/supabase';
import { getCurrentLocation } from '../services/locationService';
import { PlaceCard } from '../components/ui/PlaceCard';
import { OfferCard } from '../components/ui/OfferCard';
import { OpenOffersSection } from '../components/ui/OpenOffersSection';
import { useTheme } from '../contexts/ThemeContext';
import SlideToAccept from '../components/ui/SlideToAccept';
import { useButtonFeedback } from '../hooks/useButtonFeedback';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Small device breakpoint for 1/1 stacked layout (covers most phones)
const SMALL_DEVICE_WIDTH = 500;

// —— Map marker icons ————————————————————————————————————————————

const MARKER_COURIER =
  'https://res.cloudinary.com/chowlocal/image/upload/v1772022321/map-icon-green-courier_nrnxkv.png';
const MARKER_PICKUP =
  'https://res.cloudinary.com/chowlocal/image/upload/v1772021304/map-icon-purple-place_slcoj1.png';
const MARKER_DROPOFF =
  'https://res.cloudinary.com/chowlocal/image/upload/v1772029798/customer-drop-off-location_gsvl82.png';
const DEFAULT_CUSTOMER_AVATAR_DARK =
  'https://res.cloudinary.com/chowlocal/image/upload/v1772038419/Untitled_design_e5i0pe.png';
const DEFAULT_CUSTOMER_AVATAR_LIGHT =
  'https://res.cloudinary.com/chowlocal/image/upload/v1772038418/Untitled_design_1_blw3mh.png';

// —— "You Got Paid" sound ————————————————————————————————————————

const YOU_GOT_PAID_SOUND_URL =
  'https://res.cloudinary.com/chowlocal/video/upload/v1772495192/253595__thoribass__notification1-freesound_fqn6ab.wav';

// —— Types ——————————————————————————————————————————————————————————

interface ActiveDeliveryScreenProps {
  deliveryRequestId: string;
  onBack: () => void;
  onDeliveryCompleted?: () => void;
  onOfferPress?: (deliveryRequestId: string, offerType: 'open' | 'exclusive') => void;
  onOtherDeliveryPress?: (deliveryRequestId: string) => void;
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
  courier_pickup_instructions: string | null;
  city_id: string | null;
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
  dropoff_unit_number: string | null;
  dropoff_instructions: string | null;
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
  minutes_early: number | null;
  minutes_late: number | null;
  minutes_early_pickup: number | null;
  minutes_late_pickup: number | null;
  // Timeline timestamps
  requested_at: string | null;
  accepted_by_courier_at: string | null;
  arrived_at_pickup_at: string | null;
  en_route_at: string | null;
  arrived_at_dropoff_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  created_at: string | null;
}

interface DeliveryPointsData {
  id: string;
  delivery_request_id: string;
  default_points: number | null;
  delivery_distance_km_points: number | null;
  distance_6km_9km_points: number | null;
  more_than_10km_points: number | null;
  '6am_9am_points': number | null;
  '9am_5pm_points': number | null;
  '9pm_11pm_points': number | null;
  '11pm_2am_points': number | null;
  less_than_5min_points: number | null;
  early_at_pickup_points: number | null;
  late_dropoff_points_lost: number | null;
  total_points: number | null;
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

/** Format date/time for timeline */
function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

/** Calculate minutes between two timestamps */
function minsBetween(a: string | null | undefined, b: string | null | undefined): number | null {
  if (!a || !b) return null;
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000);
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

/** Format points with K suffix for thousands */
function formatPoints(points: number): string {
  if (points >= 1000) {
    return `${(points / 1000).toFixed(1)}K`;
  }
  return points.toString();
}

// —— Badge colors (muted for outline style) ———————————————————————————————————————————
// Badge colors are now determined by theme: muted white in dark mode, muted black in light mode

const STATUS_LABELS: Record<string, string> = {
  accepted_by_courier: 'ACCEPTED',
  arrived_at_pickup: 'AT PICKUP',
  en_route: 'EN ROUTE',
  arrived_at_dropoff: 'AT DROP-OFF',
  delivered: 'DELIVERED',
};

// —— Dark mode map style ———————————————————————————————————————

// Map styles imported from shared file

// —— Button width constant so AT PICKUP and DIRECTIONS match ————————

const ACTION_BTN_WIDTH = 140;

// —— Component ————————————————————————————————————————————————

export function ActiveDeliveryScreen({
  deliveryRequestId,
  onBack,
  onDeliveryCompleted,
  onOfferPress,
  onOtherDeliveryPress,
}: ActiveDeliveryScreenProps) {
  const { courier, refreshCourier } = useAuth();
  const { isDark, colors } = useTheme();
  const { tapFeedback } = useButtonFeedback();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView | null>(null);
  const fullscreenMapRef = useRef<MapView | null>(null);

  const [loading, setLoading] = useState(true);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMapFullscreen, setShowMapFullscreen] = useState(false);
  const [showPickupInstructions, setShowPickupInstructions] = useState(false);
  const [showDropoffInstructions, setShowDropoffInstructions] = useState(false);
  const [showYouGotPaid, setShowYouGotPaid] = useState(false);
  const [paidAmount, setPaidAmount] = useState<number>(0);

  const [delivery, setDelivery] = useState<DeliveryData | null>(null);
  const [place, setPlace] = useState<PlaceData | null>(null);
  const [customer, setCustomer] = useState<CustomerData | null>(null);
  const [deliveryPoints, setDeliveryPoints] = useState<DeliveryPointsData | null>(null);
  const [distanceToPickupKm, setDistanceToPickupKm] = useState<number | null>(null);
  const [distanceToDropoffKm, setDistanceToDropoffKm] = useState<number | null>(null);
  const [courierLocation, setCourierLocation] = useState<RouteCoord | null>(null);
  const [routeCoords, setRouteCoords] = useState<RouteCoord[]>([]);

  // —— Open Offers state (exclusive offers handled by MainLayout forced screen) ——
  const [openOffers, setOpenOffers] = useState<any[]>([]);

  // —— Other accepted deliveries (excluding current one) ——
  const [otherDeliveries, setOtherDeliveries] = useState<any[]>([]);

  // —— Default customer avatar based on theme ——
  const defaultCustomerAvatar = isDark ? DEFAULT_CUSTOMER_AVATAR_DARK : DEFAULT_CUSTOMER_AVATAR_LIGHT;

  // —— Check if small device for stacked layout ——
  const isSmallDevice = SCREEN_WIDTH < SMALL_DEVICE_WIDTH;

  // —— Play "You Got Paid" sound ——————————————————————————————————

  // —— Proximity Check Helper ——————————————————————————————————————
  const checkProximity = async (
    targetLat: number,
    targetLon: number,
    locationLabel: string,
  ): Promise<boolean> => {
    try {
      let courierLat: number | null = null;
      let courierLon: number | null = null;
      try {
        const loc = await getCurrentLocation();
        if (loc) {
          courierLat = loc.coords.latitude;
          courierLon = loc.coords.longitude;
        }
      } catch (locErr) {
        console.warn('[ActiveDelivery] GPS unavailable for proximity check:', locErr);
      }
      if (courierLat === null && courier?.current_location_latitude && courier?.current_location_longitude) {
        courierLat = courier.current_location_latitude;
        courierLon = courier.current_location_longitude;
      }
      if (courierLat === null || courierLon === null) {
        Alert.alert('Location Unavailable', 'Unable to determine your current location. Please make sure location services are enabled and try again.');
        return false;
      }
      let radiusKm = 0.1;
      if (place?.city_id) {
        try {
          const { data: cityData, error: cityError } = await supabase
            .from('city_resolved')
            .select('courier_arrival_radius_km')
            .eq('id', place.city_id)
            .single();
          if (!cityError && cityData?.courier_arrival_radius_km != null) {
            radiusKm = Number(cityData.courier_arrival_radius_km);
          }
        } catch (err) {
          console.warn('[ActiveDelivery] Could not fetch city radius, using default:', err);
        }
      }
      const distKm = calculateDistanceKm(courierLat, courierLon, targetLat, targetLon);
      if (distKm <= radiusKm) return true;
      const distMeters = Math.round(distKm * 1000);
      const radiusMeters = Math.round(radiusKm * 1000);
      Alert.alert('Too Far Away', `You need to be within ${radiusMeters}m of the ${locationLabel} to proceed. You are currently about ${distMeters}m away.`);
      return false;
    } catch (err) {
      console.error('[ActiveDelivery] Proximity check error:', err);
      Alert.alert('Error', 'Could not verify your location. Please try again.');
      return false;
    }
  };


  const playYouGotPaidSound = useCallback(async () => {
    try {
      const { sound } = await Audio.Sound.createAsync(
        { uri: YOU_GOT_PAID_SOUND_URL },
        { shouldPlay: true, volume: 1.0 },
      );

      sound.setOnPlaybackStatusUpdate((status: any) => {
        if (status.didJustFinish) {
          sound.unloadAsync();
        }
      });

      console.log('[ActiveDelivery] ✅ You Got Paid sound playing');
    } catch (err) {
      console.warn('[ActiveDelivery] Could not play You Got Paid sound:', err);
    }
  }, []);

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
           dropoff_address, dropoff_unit_number, dropoff_instructions, dropoff_latitude, dropoff_longitude,
           delivery_distance_km, delivery_distance_miles,
           pickup_eta, drop_off_eta, eta_minutes, points_offered,
           courier_earnings, is_outside_order,
           outside_order_delivery_customer_name,
           outside_order_delivery_customer_phone_number,
           minutes_early, minutes_late,
           minutes_early_pickup, minutes_late_pickup,
           requested_at, accepted_by_courier_at, arrived_at_pickup_at,
           en_route_at, arrived_at_dropoff_at, delivered_at, cancelled_at,
           created_at,
           place:place_id (
             id, name, address_line_1, city, state,
             profile_picture_url, photos, rating, average_rating,
             total_reviews, phone_number, courier_pickup_instructions, city_id
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

      // Fetch delivery points for delivered status
      if (raw.status === 'delivered') {
        try {
          const { data: pointsData, error: pointsError } = await supabase
            .from('delivery_point')
            .select('*')
            .eq('delivery_request_id', deliveryRequestId)
            .single();

          if (!pointsError && pointsData) {
            setDeliveryPoints(pointsData as DeliveryPointsData);
          }
        } catch (pointsErr) {
          console.warn('[ActiveDelivery] Could not fetch delivery points:', pointsErr);
        }
      }

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
            place_profile_picture_url: r.place_profile_picture_url || null,
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

  // —— Load other accepted deliveries (excluding current) ————————————

  const loadOtherDeliveries = useCallback(async () => {
    if (!courier?.id) return;

    try {
      const { data, error } = await supabase
        .from('delivery_request')
        .select('id, delivery_number, status, pickup_eta, delivery_distance_km, points_offered, place:place_id(name, profile_picture_url)')
        .eq('courier_id', courier.id)
        .in('status', ['accepted_by_courier', 'arrived_at_pickup', 'en_route', 'arrived_at_dropoff'])
        .neq('id', deliveryRequestId)
        .order('accepted_by_courier_at', { ascending: false })
        .limit(10);

      if (!error && data) {
        setOtherDeliveries(
          data.map((d: any) => ({
            ...d,
            place: Array.isArray(d.place) ? d.place[0] : d.place,
          }))
        );
      } else {
        setOtherDeliveries([]);
      }
    } catch (err) {
      console.error('[ActiveDelivery] Error loading other deliveries:', err);
      setOtherDeliveries([]);
    }
  }, [courier?.id, deliveryRequestId]);

  // Load other deliveries on mount
  useEffect(() => {
    loadOtherDeliveries();
  }, [loadOtherDeliveries]);

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
    if (!delivery.pickup_latitude || !delivery.pickup_longitude) return;
    setUpdatingStatus(true);
    setError(null);

    try {
      const withinRadius = await checkProximity(delivery.pickup_latitude, delivery.pickup_longitude, 'pickup location');
      if (!withinRadius) { setUpdatingStatus(false); return; }

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
        // Show "You Got Paid" screen before loading new data
        const earnings = delivery?.courier_earnings || 0;
        setPaidAmount(earnings);
        setShowYouGotPaid(true);
        playYouGotPaidSound();
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
    if (!delivery.pickup_latitude || !delivery.pickup_longitude) return;
    setUpdatingStatus(true);
    setError(null);

    try {
      const withinRadius = await checkProximity(delivery.pickup_latitude, delivery.pickup_longitude, 'pickup location');
      if (!withinRadius) { setUpdatingStatus(false); return; }

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
    if (!delivery.dropoff_latitude || !delivery.dropoff_longitude) return;
    setUpdatingStatus(true);
    setError(null);

    try {
      const withinRadius = await checkProximity(delivery.dropoff_latitude, delivery.dropoff_longitude, 'drop-off location');
      if (!withinRadius) { setUpdatingStatus(false); return; }

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

  // —— Status update: Delivered ————————————————————————————————————

  const handleDelivered = async () => {
    if (!delivery) return;
    setUpdatingStatus(true);
    setError(null);

    try {
      const { error: statusError } = await supabase.functions.invoke('update-delivery-status', {
        body: {
          delivery_request_id: deliveryRequestId,
          new_status: 'delivered',
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

  // —— Exit handler for delivered screen ——————————————————————————

  const handleExit = () => {
    tapFeedback();
    onDeliveryCompleted?.();
    onBack();
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

  const bg = colors.backgroundSecondary;
  const cardBg = colors.card;
  const textColor = colors.text;
  const textSecColor = colors.textTertiary;

  // —— Derived values ————————————————————————————————————————————

  const deliveryNum = delivery?.delivery_number
    ? `#${delivery.delivery_number}`
    : delivery
    ? `#${delivery.id.slice(-6).toUpperCase()}`
    : '';

  const orderNum = delivery?.order_number
    ? `#${delivery.order_number}`
    : '';

  // Status badge uses muted colors: white in dark mode, black in light mode
  const badgeColor = isDark ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.5)';
  const badgeLabel = STATUS_LABELS[delivery?.status || ''] || delivery?.status || '';

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
  const isAtDropoff = delivery?.status === 'arrived_at_dropoff';
  const isDelivered = delivery?.status === 'delivered';

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

  // Fallback region before fitToCoordinates runs
  const fallbackCenter = (isAtPickup || isEnRoute || isAtDropoff) && courierLocation
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
  if (!isAtPickup && !isEnRoute && !isAtDropoff && pickupCoord) allMapCoords.push(pickupCoord);
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
      {!isAtPickup && !isEnRoute && !isAtDropoff && pickupCoord && (
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

  // —— Arrived At Drop-Off time badge ——————————————————————————————

  const renderArrivedAtDropoffBadge = () => {
    const hasEarly = delivery?.minutes_early !== null && delivery?.minutes_early !== undefined;
    const hasLate = delivery?.minutes_late !== null && delivery?.minutes_late !== undefined;

    if (!hasEarly && !hasLate) return null;

    const isEarly = hasEarly;
    const minutes = isEarly ? delivery!.minutes_early! : delivery!.minutes_late!;
    const bgColor = isEarly ? '#166534' : '#7f1d1d';
    const labelText = isEarly ? `${minutes} Min Early` : `${minutes} Min Late`;
    const labelColor = isEarly ? '#4ade80' : '#f87171';

    return (
      <View style={[styles.arrivedAtDropoffBadge, { backgroundColor: bgColor }]}>
        <Text style={styles.arrivedAtDropoffBadgeLabel}>Arrived At Drop-Off</Text>
        <Text style={[styles.arrivedAtDropoffBadgeValue, { color: labelColor }]}>
          {labelText}
        </Text>
      </View>
    );
  };

  // —— Build timeline events ——————————————————————————————————————

  const buildTimelineEvents = () => {
    if (!delivery) return [];

    const placeName = place?.name || 'Pickup';

    // Build "Requested" label with prep time info
    const prepMinutes = delivery.eta_minutes;
    let requestedLabel = 'Requested';
    if (prepMinutes != null && (delivery.requested_at || delivery.created_at)) {
      const requestedTime = new Date(delivery.requested_at || delivery.created_at!);
      const arrivalTime = new Date(requestedTime.getTime() + prepMinutes * 60 * 1000);
      const arrivalStr = arrivalTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
      requestedLabel = `Requested with ${prepMinutes} min Prep-time, for ${arrivalStr} arrival time`;
    }

    // "Accepted by you" label
    const requestedTime = delivery.requested_at || delivery.created_at;
    const minsToAccept = minsBetween(requestedTime, delivery.accepted_by_courier_at);
    let acceptedLabel = 'Accepted by you';
    if (minsToAccept != null) {
      acceptedLabel += `, ${minsToAccept} min later`;
    }

    // "You arrived at Pickup" label
    const minsAfterAccepted = minsBetween(delivery.accepted_by_courier_at, delivery.arrived_at_pickup_at);
    let arrivedPickupLabel = `You arrived at ${placeName}`;
    if (delivery.minutes_early_pickup != null) {
      arrivedPickupLabel += `, ${delivery.minutes_early_pickup} min early`;
    } else if (delivery.minutes_late_pickup != null) {
      arrivedPickupLabel += `, ${delivery.minutes_late_pickup} min late`;
    }
    if (minsAfterAccepted != null) {
      arrivedPickupLabel += ` (${minsAfterAccepted} min after accepted)`;
    }

    // "You received the delivery" label
    const minsAfterArrival = minsBetween(delivery.arrived_at_pickup_at, delivery.en_route_at);
    let receivedLabel = 'You received the delivery';
    if (minsAfterArrival != null) {
      receivedLabel += `, ${minsAfterArrival} min after arrival`;
    }

    // "You arrived at drop-off" label
    const minsAfterReceiving = minsBetween(delivery.en_route_at, delivery.arrived_at_dropoff_at);
    let arrivedDropoffLabel = 'You arrived at the drop-off address';
    if (minsAfterReceiving != null) {
      arrivedDropoffLabel += `, ${minsAfterReceiving} min after receiving the delivery`;
    }

    // "Delivered" label
    const minsAfterDropoff = minsBetween(delivery.arrived_at_dropoff_at, delivery.delivered_at);
    let deliveredLabel = 'Delivered';
    if (minsAfterDropoff != null) {
      deliveredLabel += `, ${minsAfterDropoff} min after arriving at drop-off address`;
    }

    const events: { label: string; time: string | null; dotColor: string }[] = [
      { label: requestedLabel, time: delivery.requested_at || delivery.created_at, dotColor: '#8E8E93' },
      { label: acceptedLabel, time: delivery.accepted_by_courier_at, dotColor: '#1F48FF' },
      { label: arrivedPickupLabel, time: delivery.arrived_at_pickup_at, dotColor: '#8C52FF' },
      { label: receivedLabel, time: delivery.en_route_at, dotColor: '#34C759' },
      { label: 'En Route to Customer', time: delivery.en_route_at, dotColor: '#FF751F' },
      { label: arrivedDropoffLabel, time: delivery.arrived_at_dropoff_at, dotColor: '#5CE1E6' },
      { label: deliveredLabel, time: delivery.delivered_at, dotColor: '#34C759' },
    ];

    if (delivery.cancelled_at) {
      events.push({ label: 'Cancelled', time: delivery.cancelled_at, dotColor: '#FF3B30' });
    }

    return events.filter(e => e.time !== null);
  };

  const renderTimeline = () => {
    const events = buildTimelineEvents();
    if (events.length === 0) return null;

    return (
      <View style={styles.timelineSection}>
        <Text style={[styles.timelineSectionTitle, { color: textColor }]}>Timeline</Text>
        <View style={[styles.timelineCard, { backgroundColor: cardBg }]}>
          {events.map((event, index) => (
            <View key={index} style={styles.timelineRow}>
              <View style={styles.timelineDotColumn}>
                <View style={[styles.timelineDot, { backgroundColor: event.dotColor }]} />
                {index < events.length - 1 && (
                  <View style={[styles.timelineLine, { backgroundColor: isDark ? '#333' : '#DDD' }]} />
                )}
              </View>
              <View style={styles.timelineContent}>
                <Text style={[styles.timelineLabel, { color: textColor }]}>{event.label}</Text>
                <Text style={[styles.timelineTime, { color: textSecColor }]}>{formatDateTime(event.time)}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>
    );
  };

  // —— Render place photo or first photo from photos array ——————

  const placePhoto = place?.profile_picture_url || (place?.photos && place.photos[0]) || null;

  return (
    <View style={[styles.screen, { backgroundColor: bg }]}>
      {/* —— Header —— */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        {/* Profile picture on left for all statuses */}
        <View style={styles.headerProfilePlaceholder}>
          {courier?.profile_picture_url ? (
            <Image
              source={{ uri: courier.profile_picture_url }}
              style={styles.headerProfileImage}
            />
          ) : (
            <View style={styles.headerProfileFallback}>
              <Text style={[styles.headerProfileInitial, { color: textColor }]}>
                {courier?.first_name?.[0] || 'C'}
              </Text>
            </View>
          )}
        </View>

        <Text style={[styles.headerTitle, { color: textColor }]}>
          {orderNum ? `Order ${orderNum}` : `Delivery ${deliveryNum}`}
        </Text>

        {/* X close button on right to exit back to dashboard */}
        <TouchableOpacity
          style={styles.headerAction}
          onPress={() => { tapFeedback(); onBack(); }}
          activeOpacity={0.7}
        >
          <X size={24} color={textColor} />
        </TouchableOpacity>
      </View>

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
            <Text style={[styles.statusBadgeText, { color: badgeColor }]}>
              {badgeLabel}
            </Text>
          </View>
        </View>

        {/* ═══ STATUS: delivered ═══ */}
        {isDelivered ? (
          <>
            {/* Restaurant card with phone icon */}
            <TouchableOpacity
              onPress={() => { tapFeedback(); handleCallRestaurant(); }}
              activeOpacity={0.7}
              style={[styles.restaurantCard, { backgroundColor: cardBg }]}
            >
              {placePhoto && (
                <Image
                  source={{ uri: placePhoto }}
                  style={styles.restaurantPhoto}
                />
              )}
              <View style={styles.restaurantInfo}>
                <Text style={[styles.restaurantName, { color: textColor }]} numberOfLines={1}>
                  {place?.name || 'Restaurant'}
                </Text>
                <Text style={[styles.restaurantAddress, { color: textSecColor }]} numberOfLines={1}>
                  {place?.address_line_1}{place?.city ? `, ${place.city}` : ''}{place?.state ? `, ${place.state}` : ''}
                </Text>
                {(place?.average_rating || place?.rating) && (
                  <View style={styles.restaurantRatingRow}>
                    <Text style={styles.restaurantRatingText}>
                      {(place.average_rating || place.rating)?.toFixed(1)}
                    </Text>
                    <View style={styles.restaurantStars}>
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          size={12}
                          color="#facc15"
                          fill={star <= Math.round(place.average_rating || place.rating || 0) ? '#facc15' : 'transparent'}
                        />
                      ))}
                    </View>
                    {place?.total_reviews && (
                      <Text style={styles.restaurantReviews}>
                        {place.total_reviews} Reviews
                      </Text>
                    )}
                  </View>
                )}
              </View>
              <View style={styles.phoneButton}>
                <Phone size={22} color={textColor} />
              </View>
            </TouchableOpacity>

            {/* Drop-off Address (full width) */}
            <View style={[styles.card, { backgroundColor: cardBg }]}>
              <Text style={[styles.cardLabel, { color: textSecColor }]}>Drop-off Address</Text>
              <Text style={[styles.dropoffAddressText, { color: textColor }]} numberOfLines={2}>
                {delivery.dropoff_unit_number ? `${delivery.dropoff_unit_number} - ${formatStreetAddress(delivery.dropoff_address)}` : formatStreetAddress(delivery.dropoff_address)}
              </Text>
            </View>

            {/* Row: Earnings + Points (always side by side, 1/2 width each) */}
            <View style={styles.twoColumnRow}>
              <View style={[styles.statCard, { backgroundColor: cardBg, flex: 1 }]}>
                <Text style={[styles.statLabel, { color: textSecColor }]}>Earnings</Text>
                <Text style={[styles.statValue, { color: textColor }]}>
                  ${(delivery.courier_earnings || 0).toFixed(2)}
                </Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: cardBg, flex: 1 }]}>
                <Text style={[styles.statLabel, { color: textSecColor }]}>Points</Text>
                <Text style={[styles.statValue, { color: textColor }]}>
                  {formatPoints(Math.round(Number(deliveryPoints?.total_points) || 0))}
                </Text>
              </View>
            </View>

            {/* Arrived At Pick Up (full width) */}
            {(delivery.minutes_early_pickup !== null || delivery.minutes_late_pickup !== null) && (
              <View style={[
                styles.card,
                { backgroundColor: delivery.minutes_early_pickup !== null ? '#166534' : '#7f1d1d' }
              ]}>
                <Text style={[styles.cardLabel, { color: '#FFFFFF', opacity: 0.9 }]}>Arrived At Pick Up</Text>
                <Text style={[
                  styles.cardBigValue,
                  { color: delivery.minutes_early_pickup !== null ? '#9eff1f' : '#ff3131' }
                ]}>
                  {delivery.minutes_early_pickup !== null
                    ? `${delivery.minutes_early_pickup} Min Early`
                    : `${delivery.minutes_late_pickup} Min Late`}
                </Text>
              </View>
            )}

            {/* Arrived At Drop-Off (full width) */}
            {(delivery.minutes_early !== null || delivery.minutes_late !== null) && (
              <View style={[
                styles.card,
                { backgroundColor: delivery.minutes_early !== null ? '#166534' : '#7f1d1d' }
              ]}>
                <Text style={[styles.cardLabel, { color: '#FFFFFF', opacity: 0.9 }]}>Arrived At Drop-Off</Text>
                <Text style={[
                  styles.cardBigValue,
                  { color: delivery.minutes_early !== null ? '#9eff1f' : '#ff3131' }
                ]}>
                  {delivery.minutes_early !== null
                    ? `${delivery.minutes_early} Min Early`
                    : `${delivery.minutes_late} Min Late`}
                </Text>
              </View>
            )}

            {/* Points Breakdown Section */}
            {deliveryPoints && (
              <View style={styles.pointsSection}>
                <Text style={[styles.pointsSectionTitle, { color: textColor }]}>Points Breakdown</Text>
                <View style={[styles.pointsCard, { backgroundColor: cardBg }]}>
                  {/* Intro text */}
                  <Text style={[styles.pointsIntroText, { color: textSecColor }]}>
                    You earned {deliveryPoints.total_points || 0} points on this delivery!
                  </Text>

                  {/* Base Points */}
                  {Number(deliveryPoints.default_points) > 0 && (
                    <View style={styles.pointsRow}>
                      <Text style={[styles.pointsRowLabel, { color: textSecColor }]}>Base Points</Text>
                      <Text style={[styles.pointsRowValue, { color: textColor }]}>
                        +{Math.round(Number(deliveryPoints.default_points))}
                      </Text>
                    </View>
                  )}

                  {/* Distance Bonus */}
                  {Number(deliveryPoints.delivery_distance_km_points) > 0 && (
                    <View style={styles.pointsRow}>
                      <Text style={[styles.pointsRowLabel, { color: textSecColor }]}>Distance Bonus</Text>
                      <Text style={[styles.pointsRowValue, { color: textColor }]}>
                        +{Math.round(Number(deliveryPoints.delivery_distance_km_points))}
                      </Text>
                    </View>
                  )}

                  {/* 6-9 km Bonus */}
                  {Number(deliveryPoints.distance_6km_9km_points) > 0 && (
                    <View style={styles.pointsRow}>
                      <Text style={[styles.pointsRowLabel, { color: textSecColor }]}>6-9 km Bonus</Text>
                      <Text style={[styles.pointsRowValue, { color: textColor }]}>
                        +{Math.round(Number(deliveryPoints.distance_6km_9km_points))}
                      </Text>
                    </View>
                  )}

                  {/* 10+ km Bonus */}
                  {Number(deliveryPoints.more_than_10km_points) > 0 && (
                    <View style={styles.pointsRow}>
                      <Text style={[styles.pointsRowLabel, { color: textSecColor }]}>10+ km Bonus</Text>
                      <Text style={[styles.pointsRowValue, { color: textColor }]}>
                        +{Math.round(Number(deliveryPoints.more_than_10km_points))}
                      </Text>
                    </View>
                  )}

                  {/* 6am-9am Bonus */}
                  {Number(deliveryPoints['6am_9am_points']) > 0 && (
                    <View style={styles.pointsRow}>
                      <Text style={[styles.pointsRowLabel, { color: textSecColor }]}>6am-9am Bonus</Text>
                      <Text style={[styles.pointsRowValue, { color: textColor }]}>
                        +{Math.round(Number(deliveryPoints['6am_9am_points']))}
                      </Text>
                    </View>
                  )}

                  {/* 9am-5pm Bonus */}
                  {Number(deliveryPoints['9am_5pm_points']) > 0 && (
                    <View style={styles.pointsRow}>
                      <Text style={[styles.pointsRowLabel, { color: textSecColor }]}>9am-5pm Bonus</Text>
                      <Text style={[styles.pointsRowValue, { color: textColor }]}>
                        +{Math.round(Number(deliveryPoints['9am_5pm_points']))}
                      </Text>
                    </View>
                  )}

                  {/* 9pm-11pm Bonus */}
                  {Number(deliveryPoints['9pm_11pm_points']) > 0 && (
                    <View style={styles.pointsRow}>
                      <Text style={[styles.pointsRowLabel, { color: textSecColor }]}>9pm-11pm Bonus</Text>
                      <Text style={[styles.pointsRowValue, { color: textColor }]}>
                        +{Math.round(Number(deliveryPoints['9pm_11pm_points']))}
                      </Text>
                    </View>
                  )}

                  {/* 11pm-2am Bonus */}
                  {Number(deliveryPoints['11pm_2am_points']) > 0 && (
                    <View style={styles.pointsRow}>
                      <Text style={[styles.pointsRowLabel, { color: textSecColor }]}>11pm-2am Bonus</Text>
                      <Text style={[styles.pointsRowValue, { color: textColor }]}>
                        +{Math.round(Number(deliveryPoints['11pm_2am_points']))}
                      </Text>
                    </View>
                  )}

                  {/* Urgent Delivery Bonus */}
                  {Number(deliveryPoints.less_than_5min_points) > 0 && (
                    <View style={styles.pointsRow}>
                      <Text style={[styles.pointsRowLabel, { color: textSecColor }]}>Urgent Delivery Bonus</Text>
                      <Text style={[styles.pointsRowValue, { color: textColor }]}>
                        +{Math.round(Number(deliveryPoints.less_than_5min_points))}
                      </Text>
                    </View>
                  )}

                  {/* Early Pickup Bonus */}
                  {Number(deliveryPoints.early_at_pickup_points) > 0 && (
                    <View style={styles.pointsRow}>
                      <Text style={[styles.pointsRowLabel, { color: textSecColor }]}>
                        Early Pickup Bonus{delivery.minutes_early_pickup ? ` (${delivery.minutes_early_pickup} min)` : ''}
                      </Text>
                      <Text style={[styles.pointsRowValue, { color: textColor }]}>
                        +{Math.round(Number(deliveryPoints.early_at_pickup_points))}
                      </Text>
                    </View>
                  )}

                  {/* Late Drop-off Penalty */}
                  {Number(deliveryPoints.late_dropoff_points_lost) > 0 && (
                    <View style={styles.pointsRow}>
                      <Text style={[styles.pointsRowLabel, { color: '#ff3131' }]}>Late Drop-off Penalty</Text>
                      <Text style={[styles.pointsRowValue, { color: '#ff3131' }]}>
                        -{Math.round(Number(deliveryPoints.late_dropoff_points_lost))}
                      </Text>
                    </View>
                  )}

                  {/* Divider and Total */}
                  <View style={[styles.pointsDivider, { backgroundColor: isDark ? '#333' : '#DDD' }]} />
                  <View style={styles.pointsTotalRow}>
                    <Text style={[styles.pointsTotalLabel, { color: textColor }]}>Total Points Earned</Text>
                    <Text style={[styles.pointsTotalValue, { color: '#FFFFFF' }]}>
                      {Math.round(Number(deliveryPoints.total_points || 0))}
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {/* EXIT button */}
            <TouchableOpacity
              style={[styles.exitButton, { backgroundColor: isDark ? '#FFFFFF' : '#000000' }]}
              onPress={handleExit}
              activeOpacity={0.7}
            >
              <Text style={[styles.exitButtonText, { color: isDark ? '#000000' : '#FFFFFF' }]}>EXIT</Text>
            </TouchableOpacity>
          </>
        ) : isAtDropoff ? (
          <>
            {/* ═══ STATUS: arrived_at_dropoff ═══ */}

            {/* Customer card (full width) */}
            <TouchableOpacity
              onPress={() => { tapFeedback(); handleCallCustomer(); }}
              activeOpacity={0.7}
              style={[styles.customerCard, { backgroundColor: cardBg }]}
            >
              <Image
                source={{ uri: customerPhoto || defaultCustomerAvatar }}
                style={[styles.customerPhoto, (isOutsideOrder || (!customerPhoto && !isDark)) && { opacity: 0.3 }]}
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

            {/* Drop-off Address (full width) */}
            <View style={[styles.card, { backgroundColor: cardBg }]}>
              <Text style={[styles.cardLabel, { color: textSecColor }]}>Drop-off Address</Text>
              <Text style={[styles.dropoffAddressText, { color: textColor }]} numberOfLines={2}>
                {delivery.dropoff_unit_number ? `${delivery.dropoff_unit_number} - ${formatStreetAddress(delivery.dropoff_address)}` : formatStreetAddress(delivery.dropoff_address)}
              </Text>
            </View>

          </>
        ) : isAtPickup ? (
          <>
            {/* ═══ STATUS: arrived_at_pickup ═══ */}
            <TouchableOpacity
              onPress={() => { tapFeedback(); handleCallCustomer(); }}
              activeOpacity={0.7}
              style={[styles.customerCard, { backgroundColor: cardBg }]}
            >
              <Image
                source={{ uri: customerPhoto || defaultCustomerAvatar }}
                style={[styles.customerPhoto, (isOutsideOrder || (!customerPhoto && !isDark)) && { opacity: 0.3 }]}
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

            <View style={[styles.card, { backgroundColor: cardBg }]}>
              <Text style={[styles.cardLabel, { color: textSecColor }]}>Drop-off Address</Text>
              <Text style={[styles.dropoffAddressText, { color: textColor }]} numberOfLines={2}>
                {delivery.dropoff_unit_number ? `${delivery.dropoff_unit_number} - ${formatStreetAddress(delivery.dropoff_address)}` : formatStreetAddress(delivery.dropoff_address)}
              </Text>
            </View>

            <View style={[styles.card, { backgroundColor: cardBg }]}>
              <Text style={[styles.cardLabel, { color: textSecColor }]}>Ready In</Text>
              <Text style={[styles.cardBigValue, { color: textColor }]}>
                {minutesUntilPickup !== null ? `${minutesUntilPickup} Min` : '—'}
              </Text>
            </View>

            <View style={{ marginBottom: 10 }}>
              <SlideToAccept
                onSlideComplete={() => { tapFeedback(); handleReceivedOrder(); }}
                disabled={updatingStatus}
                label="Slide - Order Received"
                trackColor="#ffd21f"
                labelColor="#000"
                thumbColor="rgba(0,0,0,0.2)"
                chevronColor="#000"
                height={56}
              />
            </View>

            <View style={[styles.card, { backgroundColor: cardBg }]}>
              <View style={styles.inlineRow}>
                <View style={styles.inlineLeft}>
                  <Text style={[styles.cardLabel, { color: textSecColor }]}>To Drop Off</Text>
                  {distanceToDropoffKm !== null ? (
                    <Text style={[styles.cardBigValue, { color: textColor }]}>
                      {formatDistance(distanceToDropoffKm, courier?.preferred_distance_unit)}
                    </Text>
                  ) : (
                    <ActivityIndicator size="small" color={textColor} style={{ marginTop: 8 }} />
                  )}
                </View>
                <TouchableOpacity
                  style={[styles.directionsButton, { backgroundColor: isDark ? '#000000' : '#E5E7EB' }]}
                  onPress={() => { tapFeedback(); handleDirectionsToDropoff(); }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.directionsButtonText, { color: isDark ? '#FFFFFF' : '#000000' }]}>DIRECTIONS</Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        ) : isEnRoute ? (
          <>
            {/* ═══ STATUS: en_route ═══ */}
            <TouchableOpacity
              onPress={() => { tapFeedback(); handleCallCustomer(); }}
              activeOpacity={0.7}
              style={[styles.customerCard, { backgroundColor: cardBg }]}
            >
              <Image
                source={{ uri: customerPhoto || defaultCustomerAvatar }}
                style={[styles.customerPhoto, (isOutsideOrder || (!customerPhoto && !isDark)) && { opacity: 0.3 }]}
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

            <View style={[styles.card, { backgroundColor: cardBg }]}>
              <Text style={[styles.cardLabel, { color: textSecColor }]}>Drop-off Address</Text>
              <Text style={[styles.dropoffAddressText, { color: textColor }]} numberOfLines={2}>
                {delivery.dropoff_unit_number ? `${delivery.dropoff_unit_number} - ${formatStreetAddress(delivery.dropoff_address)}` : formatStreetAddress(delivery.dropoff_address)}
              </Text>
            </View>

            <View style={[styles.card, { backgroundColor: cardBg }]}>
              <View style={styles.inlineRow}>
                <View style={styles.inlineLeft}>
                  <Text style={[styles.cardLabel, { color: textSecColor }]}>Arrive In</Text>
                  <Text style={[styles.cardBigValue, { color: textColor }]}>
                    {minutesUntilDropoff !== null ? `${minutesUntilDropoff} Min` : '—'}
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

            <View style={[styles.card, { backgroundColor: cardBg }]}>
              <View style={styles.inlineRow}>
                <View style={styles.inlineLeft}>
                  <Text style={[styles.cardLabel, { color: textSecColor }]}>To Drop Off</Text>
                  {distanceToDropoffKm !== null ? (
                    <Text style={[styles.cardBigValue, { color: textColor }]}>
                      {formatDistance(distanceToDropoffKm, courier?.preferred_distance_unit)}
                    </Text>
                  ) : (
                    <ActivityIndicator size="small" color={textColor} style={{ marginTop: 8 }} />
                  )}
                </View>
                <TouchableOpacity
                  style={[styles.directionsButton, { backgroundColor: isDark ? '#000000' : '#E5E7EB' }]}
                  onPress={() => { tapFeedback(); handleDirectionsToDropoff(); }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.directionsButtonText, { color: isDark ? '#FFFFFF' : '#000000' }]}>DIRECTIONS</Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        ) : (
          <>
            {/* ═══ STATUS: accepted_by_courier (default) ═══ */}
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

            <View style={[styles.card, { backgroundColor: cardBg }]}>
              <View style={styles.inlineRow}>
                <View style={styles.inlineLeft}>
                  <Text style={[styles.cardLabel, { color: textSecColor }]}>Arrive In</Text>
                  <Text style={[styles.cardBigValue, { color: textColor }]}>
                    {minutesUntilPickup !== null ? `${minutesUntilPickup} Min` : '—'}
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

            <View style={[styles.card, { backgroundColor: cardBg }]}>
              <View style={styles.inlineRow}>
                <View style={styles.inlineLeft}>
                  <Text style={[styles.cardLabel, { color: textSecColor }]}>To Pickup</Text>
                  {distanceToPickupKm !== null ? (
                    <Text style={[styles.cardBigValue, { color: textColor }]}>
                      {formatDistance(distanceToPickupKm, courier?.preferred_distance_unit)}
                    </Text>
                  ) : (
                    <ActivityIndicator size="small" color={textColor} style={{ marginTop: 8 }} />
                  )}
                </View>
                <TouchableOpacity
                  style={[styles.directionsButton, { backgroundColor: isDark ? '#000000' : '#E5E7EB' }]}
                  onPress={() => { tapFeedback(); handleDirections(); }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.directionsButtonText, { color: isDark ? '#FFFFFF' : '#000000' }]}>DIRECTIONS</Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}

        {/* —— Drop-off Instructions (en_route + arrived_at_dropoff only) —— */}
        {(delivery.status === 'en_route' || delivery.status === 'arrived_at_dropoff') && delivery.dropoff_instructions ? (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => { tapFeedback(); setShowDropoffInstructions(!showDropoffInstructions); }}
            style={[styles.card, { backgroundColor: cardBg, overflow: 'hidden' }]}
          >
            <Text style={[styles.cardLabel, { color: textSecColor }]}>Drop-off Instructions</Text>
            {showDropoffInstructions ? (
              <Text style={{ fontFamily: fontFamily.regular, fontSize: 15, color: textColor, marginTop: 6, lineHeight: 22 }}>
                {delivery.dropoff_instructions}
              </Text>
            ) : (
              <View style={{ height: 44, overflow: 'hidden' }}>
                <Text style={{ fontFamily: fontFamily.regular, fontSize: 15, color: textColor, marginTop: 6, lineHeight: 22 }} numberOfLines={2}>
                  {delivery.dropoff_instructions}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        ) : null}

        {/* —— Arrived At Drop-Off + DELIVERED (arrived_at_dropoff only) —— */}
        {delivery.status === 'arrived_at_dropoff' && (() => {
          const isEarly = delivery?.minutes_early !== null && delivery?.minutes_early !== undefined;
          const isLate = delivery?.minutes_late !== null && delivery?.minutes_late !== undefined;
          const minutes = isEarly ? delivery!.minutes_early! : (isLate ? delivery!.minutes_late! : 0);
          const accentColor = isEarly ? '#9eff1f' : '#ff3131';
          const bgColor = isEarly ? '#166534' : '#7f1d1d';
          const labelText = isEarly ? `${minutes} Min Early` : (isLate ? `${minutes} Min Late` : '—');

          return (
            <View style={[styles.arrivedDropoffCard, { backgroundColor: bgColor }]}>
              <View style={styles.arrivedDropoffContent}>
                <Text style={styles.arrivedDropoffLabel}>Arrived At Drop-Off</Text>
                <Text style={[styles.arrivedDropoffValue, { color: accentColor }]}>
                  {labelText}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.deliveredButtonInCard, { backgroundColor: accentColor }]}
                onPress={() => { tapFeedback(); handleDelivered(); }}
                disabled={updatingStatus}
                activeOpacity={0.7}
              >
                {updatingStatus ? (
                  <ActivityIndicator size="small" color="#000" />
                ) : (
                  <Text style={styles.deliveredButtonText}>DELIVERED</Text>
                )}
              </TouchableOpacity>
            </View>
          );
        })()}

        {/* —— Courier Pickup Instructions (accepted + at_pickup only) —— */}
        {(delivery.status === 'accepted_by_courier' || delivery.status === 'arrived_at_pickup') && place?.courier_pickup_instructions ? (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => { tapFeedback(); setShowPickupInstructions(!showPickupInstructions); }}
            style={[styles.card, { backgroundColor: cardBg, marginBottom: 10, overflow: 'hidden' }]}
          >
            <Text style={[styles.cardLabel, { color: textSecColor }]}>Pickup Instructions</Text>
            {showPickupInstructions ? (
              <Text style={{ fontFamily: fontFamily.regular, fontSize: 15, color: textColor, marginTop: 6, lineHeight: 22 }}>
                {place.courier_pickup_instructions}
              </Text>
            ) : (
              <View style={{ height: 44, overflow: 'hidden' }}>
                <Text style={{ fontFamily: fontFamily.regular, fontSize: 15, color: textColor, marginTop: 6, lineHeight: 22 }} numberOfLines={2}>
                  {place.courier_pickup_instructions}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        ) : null}

        {/* —— Map (only show for non-delivered statuses) —— */}
        {!isDelivered && (
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
              customMapStyle={isDark ? DARK_MAP_STYLE : LIGHT_MAP_STYLE}
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
        )}

        {/* —— My Other Deliveries Section —— */}
        {!isDelivered && otherDeliveries.length > 0 && (
          <>
            <View style={styles.otherDeliveriesHeader}>
              <Text style={[styles.otherDeliveriesTitle, { color: textColor }]}>
                My Other Deliver{otherDeliveries.length === 1 ? 'y' : 'ies'}
              </Text>
            </View>
            {otherDeliveries.map((del) => (
              <View key={del.id} style={styles.flushCardWrapper}>
                <OfferCard
                  placeName={del.place?.name || `Delivery #${del.delivery_number || del.id?.slice(-6).toUpperCase()}`}
                  placeImage={del.place?.profile_picture_url || null}
                  points={del.points_offered || 0}
                  distanceKm={del.delivery_distance_km || 0}
                  pickupEta={del.pickup_eta}
                  onPress={() => { tapFeedback(); onOtherDeliveryPress?.(del.id); }}
                  distanceUnit={courier?.preferred_distance_unit}
                />
              </View>
            ))}
          </>
        )}

        {/* —— Open Offers Section (shared component) —— */}
        {!isDelivered && (
          <OpenOffersSection
            offers={openOffers}
            onOfferPress={(offer: any) => { tapFeedback(); handleOfferPress(offer); }}
            flush
          />
        )}

        {/* —— Timeline —— */}
        {renderTimeline()}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* —— You Got Paid Overlay —— */}
        {showYouGotPaid && (
          <View style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999,
          }}>
            <ImageBackground
              source={{ uri: 'https://res.cloudinary.com/chowlocal/image/upload/v1772197239/Driver_1_xh3qqy.png' }}
              style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }}
              resizeMode="cover"
            >
              <Image
                source={{ uri: 'https://res.cloudinary.com/chowlocal/image/upload/v1772197240/Untitled_design_pjevaw.png' }}
                style={{ width: 200, height: 200, marginBottom: 16 }}
                resizeMode="contain"
              />
              <Text style={{
                fontFamily: fontFamily.bold,
                fontSize: 34,
                color: '#FFFFFF',
                textAlign: 'center',
              }}>
                You Got Paid
              </Text>
              <Text style={{
                fontFamily: fontFamily.bold,
                fontSize: 34,
                color: '#FFFFFF',
                textAlign: 'center',
                marginTop: 4,
              }}>
                {'$' + paidAmount.toFixed(2)}
              </Text>
              <Text style={{
                fontFamily: fontFamily.regular,
                fontSize: 16,
                color: 'rgba(255,255,255,0.85)',
                textAlign: 'center',
                marginTop: 8,
                marginBottom: 32,
              }}>
                Funds have been added to your Wallet
              </Text>
              <TouchableOpacity
                onPress={() => setShowYouGotPaid(false)}
                activeOpacity={0.8}
                style={{
                  backgroundColor: '#27d20b',
                  paddingVertical: 16,
                  paddingHorizontal: 64,
                  borderRadius: 12,
                  minWidth: 240,
                  alignItems: 'center',
                }}
              >
                <Text style={{
                  fontFamily: fontFamily.bold,
                  fontSize: 18,
                  color: '#FFFFFF',
                  letterSpacing: 1,
                }}>
                  EXIT
                </Text>
              </TouchableOpacity>
            </ImageBackground>
          </View>
        )}


        {/* —— Fullscreen Map Modal —— */}
      <Modal
        visible={showMapFullscreen}
        animationType="slide"
        onRequestClose={() => setShowMapFullscreen(false)}
      >
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <MapView
            ref={fullscreenMapRef}
            style={{ flex: 1 }}
            provider={PROVIDER_GOOGLE}
            initialRegion={fallbackRegion}
            showsUserLocation={false}
            showsMyLocationButton={false}
            customMapStyle={isDark ? DARK_MAP_STYLE : LIGHT_MAP_STYLE}
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
  headerProfilePlaceholder: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerProfileImage: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  headerProfileFallback: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#4B5563',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerProfileInitial: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
    color: '#FFFFFF',
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
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  statusBadgeText: {
    fontFamily: fontFamily.bold,
    fontSize: 9,
    letterSpacing: 0.3,
  },

  // Generic card
  card: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },

  // Inline row layout
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

  // Card styles
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

  // Buttons
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
  directionsButton: {
    
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

  // Customer card
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

  // Two column layout
  twoColumnRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  customerCardHalf: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  customerPhotoSmall: {
    width: 60,
    height: '100%',
    minHeight: 72,
  },
  customerInfoHalf: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 10,
    justifyContent: 'center',
    gap: 2,
  },
  customerNameSmall: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
  },
  customerPhoneIconSmall: {
    paddingRight: 12,
    alignSelf: 'center',
  },
  cardHalf: {
    flex: 1,
    borderRadius: 12,
    padding: 14,
    justifyContent: 'center',
  },
  cardHalfTall: {
    flex: 1,
    borderRadius: 12,
    padding: 14,
    justifyContent: 'center',
  },
  dropoffAddressTextSmall: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
    marginTop: 4,
  },
  dropoffAddressLarge: {
    fontFamily: fontFamily.bold,
    fontSize: 20,
    marginTop: 4,
  },

  // Arrived At Drop-Off badge
  arrivedAtDropoffBadge: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  arrivedAtDropoffBadgeLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: '#FFFFFF',
    opacity: 0.9,
  },
  arrivedAtDropoffBadgeValue: {
    fontFamily: fontFamily.bold,
    fontSize: 22,
    marginTop: 2,
  },

  // Combined Arrived At Drop-Off card with DELIVERED button
  arrivedDropoffCard: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  arrivedDropoffContent: {
    flex: 1,
    gap: 2,
  },
  arrivedDropoffLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: '#FFFFFF',
    opacity: 0.9,
  },
  arrivedDropoffValue: {
    fontFamily: fontFamily.bold,
    fontSize: 26,
  },
  deliveredButtonInCard: {
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // DELIVERED button card (for two-column layout)
  deliveredButtonCard: {
    flex: 1,
    backgroundColor: '#9eff1f',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // DELIVERED button (full width)
  deliveredButton: {
    backgroundColor: '#9eff1f',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  deliveredButtonText: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
    color: '#000000',
    letterSpacing: 0.5,
  },

  // —— Delivered status screen styles ——

  restaurantCard: {
    borderRadius: 12,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    paddingRight: 12,
  },
  restaurantPhoto: {
    width: 90,
    height: 90,
  },
  restaurantInfo: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    justifyContent: 'center',
    gap: 2,
  },
  restaurantName: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
  },
  restaurantAddress: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
  },
  restaurantRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  restaurantRatingText: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: '#facc15',
  },
  restaurantStars: {
    flexDirection: 'row',
    gap: 1,
  },
  restaurantReviews: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: '#9CA3AF',
    marginLeft: 4,
  },
  phoneButtonCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Customer card for delivered screen
  customerCardDelivered: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 14,
  },
  customerPhotoDelivered: {
    width: 60,
    height: '100%',
    minHeight: 80,
  },
  customerInfoDelivered: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    justifyContent: 'center',
    gap: 2,
  },
  customerNameDelivered: {
    fontFamily: fontFamily.bold,
    fontSize: 20,
  },

  // Four column row for stats
  fourColumnRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 10,
  },
  statCard: {
    borderRadius: 12,
    padding: 14,
    minWidth: 80,
    flex: 1,
    justifyContent: 'center',
  },
  statCardWide: {
    borderRadius: 12,
    padding: 14,
    flex: 2,
    justifyContent: 'center',
  },
  statLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
  },
  statValue: {
    fontFamily: fontFamily.bold,
    fontSize: 24,
    marginTop: 2,
  },
  statValueHighlight: {
    fontFamily: fontFamily.bold,
    fontSize: 20,
    marginTop: 2,
  },

  // EXIT button
  exitButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  exitButtonText: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
    color: '#000000',
    letterSpacing: 0.5,
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

  // Other Deliveries section
  otherDeliveriesHeader: {
    marginTop: 24,
    marginBottom: 12,
  },
  otherDeliveriesTitle: {
    fontFamily: fontFamily.regular,
    fontSize: 20,
  },
  flushCardWrapper: {
    marginHorizontal: -16,
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

  // Timeline
  timelineSection: {
    marginTop: 20,
  },
  timelineSectionTitle: {
    fontFamily: fontFamily.regular,
    fontSize: 20,
    marginBottom: 12,
  },
  timelineCard: {
    borderRadius: 12,
    padding: 16,
  },
  timelineRow: {
    flexDirection: 'row',
    minHeight: 50,
  },
  timelineDotColumn: {
    width: 24,
    alignItems: 'center',
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 4,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    marginTop: 4,
  },
  timelineContent: {
    flex: 1,
    paddingLeft: 10,
    paddingBottom: 12,
  },
  timelineLabel: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
  },
  timelineTime: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    marginTop: 2,
  },

  // Points Breakdown
  pointsSection: {
    marginTop: 20,
  },
  pointsSectionTitle: {
    fontFamily: fontFamily.regular,
    fontSize: 20,
    marginBottom: 12,
  },
  pointsCard: {
    borderRadius: 12,
    padding: 16,
  },
  pointsIntroText: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    marginBottom: 16,
  },
  pointsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  pointsRowLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    flex: 1,
  },
  pointsRowValue: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
  },
  pointsDivider: {
    height: 2,
    marginVertical: 12,
  },
  pointsTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 4,
  },
  pointsTotalLabel: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
  },
  pointsTotalValue: {
    fontFamily: fontFamily.bold,
    fontSize: 22,
  },
});
