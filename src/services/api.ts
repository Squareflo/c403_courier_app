/**
 * API Service Layer
 * Handles all communication with the backend via Supabase edge functions
 * and direct Supabase database calls.
 */

import { supabase } from '../lib/supabase';

// ─── Edge Function Caller ──────────────────────────────────────────────────────

async function callEdgeFunction(functionName: string, body?: any): Promise<any> {
  const { data, error } = await supabase.functions.invoke(functionName, {
    body,
  });
  if (error) {
    console.error(`[API] Edge function "${functionName}" error:`, error);
    throw error;
  }
  return data;
}

// ─── Delivery & Courier Functions ───────────────────────────────────────────────

/** Update the status of a delivery request */
export const updateDeliveryStatus = (body: {
  delivery_request_id: string;
  new_status: string;
}) => callEdgeFunction('update-delivery-status', body);

/** Get full delivery details for a courier */
export const getDeliveryDetailsForCourier = (body: {
  delivery_request_id: string;
  courier_id: string;
}) => callEdgeFunction('get-delivery-details-for-courier', body);

/** Calculate delivery points for a delivery */
export const calculateDeliveryPoints = (body: {
  delivery_request_id: string;
}) => callEdgeFunction('calculate-delivery-points', body);

/** Evaluate delivery urgency bonus */
export const evaluateDeliveryUrgencyBonus = (body: {
  delivery_request_id: string;
}) => callEdgeFunction('evaluate-delivery-urgency-bonus', body);

/** Track a delivery request view by courier */
export const trackDeliveryRequestView = (body: {
  delivery_request_id: string;
  courier_id: string;
}) => callEdgeFunction('track-delivery-request-view', body);

/** Create next sequential offer after rejection */
export const createNextSequentialOffer = (body: {
  rejected_offer_id: string;
}) => callEdgeFunction('create-next-sequential-offer', body);

/** Assess courier penalty for rejection/timeout */
export const assessCourierPenalty = (body: {
  delivery_offer_id: string;
  reason: string;
}) => callEdgeFunction('assess-courier-penalty', body);

// ─── Auth & Account Functions ───────────────────────────────────────────────────

/** Request a password reset code via email */
export const requestPasswordReset = (body: { email: string }) =>
  callEdgeFunction('request-password-reset', body);

/** Verify a password reset code */
export const verifyResetCode = (body: { email: string; code: string }) =>
  callEdgeFunction('verify-reset-code', body);

/** Verify reset code and set a new password */
export const verifyResetCodeAndSetPassword = (body: {
  email: string;
  verificationCode: string;
  newPassword: string;
  password: string;
}) => callEdgeFunction('verify-reset-code-and-set-password', body);

/** Register a new customer account (shared backend) */
export const registerCustomer = (body: {
  first_name: string;
  last_name: string;
  email: string;
  phone_number: string;
  password: string;
}) => callEdgeFunction('register-customer', body);

/** Verify email with verification code */
export const verifyEmail = (body: { userId: string; verificationCode: string }) =>
  callEdgeFunction('verify-email', body);

/** Resend email verification code */
export const resendVerificationCode = (body: { userId: string; email: string }) =>
  callEdgeFunction('resend-verification-code', body);

// ─── Direct Supabase DB Calls ───────────────────────────────────────────────────

/** Fetch delivery offers via Supabase RPC (used in CourierMode) */
export async function getCourierDelivery(courierId: string) {
  const { data, error } = await supabase.rpc('get_courier_delivery', {
    courier_id_param: courierId,
  });
  if (error) {
    console.error('[API] get_courier_delivery error:', error);
    throw error;
  }
  return data;
}

/** Fetch courier's accepted (active) deliveries */
export async function getAcceptedDeliveries(courierId: string) {
  const { data, error } = await supabase
    .from('delivery_request')
    .select('*, place:place_id(id, name, photos, profile_picture_url, cover_image_url, address_line_1, city, state, phone_number)')
    .eq('courier_id', courierId)
    .in('status', ['accepted_by_courier', 'arrived_at_pickup', 'en_route', 'arrived_at_dropoff'])
    .order('accepted_by_courier_at', { ascending: false });

  if (error) {
    console.error('[API] getAcceptedDeliveries error:', error);
    throw error;
  }
  return data || [];
}

/** Fetch multiple places by their IDs */
export async function getPlacesByIds(placeIds: string[]) {
  if (!placeIds.length) return [];
  const { data, error } = await supabase
    .from('place')
    .select('id, name, photos, profile_picture_url, cover_image_url, address_line_1, city, state, phone_number')
    .in('id', placeIds);
  if (error) {
    console.error('[API] getPlacesByIds error:', error);
    throw error;
  }
  return data || [];
}

/** Fetch courier's completed deliveries today */
export async function getCompletedDeliveriesToday(courierId: string) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from('delivery_request')
    .select('*, place:place_id(id, name, photos, profile_picture_url, address_line_1)')
    .eq('courier_id', courierId)
    .eq('status', 'delivered')
    .gte('delivered_at', startOfDay.toISOString())
    .order('delivered_at', { ascending: false });

  if (error) {
    console.error('[API] getCompletedDeliveriesToday error:', error);
    throw error;
  }
  return data || [];
}

/** Fetch courier's all past deliveries */
export async function getCourierDeliveryHistory(courierId: string, limit = 50, offset = 0) {
  const { data, error } = await supabase
    .from('delivery_request')
    .select('*, place:place_id(id, name, photos, profile_picture_url, address_line_1, city, state)')
    .eq('courier_id', courierId)
    .eq('status', 'delivered')
    .order('delivered_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error('[API] getCourierDeliveryHistory error:', error);
    throw error;
  }
  return data || [];
}

/** Get courier today stats */
export async function getCourierTodayStats(courierId: string) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  // Fetch delivery stats (earnings, distance, count)
  const { data, error } = await supabase
    .from('delivery_request')
    .select('id, courier_earnings, delivery_distance_km, delivery_distance_miles')
    .eq('courier_id', courierId)
    .eq('status', 'delivered')
    .gte('delivered_at', startOfDay.toISOString());

  if (error) {
    console.error('[API] getCourierTodayStats error:', error);
    throw error;
  }

  // Fetch net points from courier_points_ledger for today
  const { data: ledgerData, error: ledgerError } = await supabase
    .from('courier_points_ledger')
    .select('points')
    .eq('courier_id', courierId)
    .gte('entry_timestamp', startOfDay.toISOString());

  if (ledgerError) {
    console.error('[API] getCourierTodayStats ledger error:', ledgerError);
  }

  const deliveries = data || [];
  const totalDeliveries = deliveries.length;
  const totalEarned = deliveries.reduce((sum, d) => sum + (d.courier_earnings || 0), 0);
  const totalPoints = (ledgerData || []).reduce((sum: number, r: any) => sum + (r.points || 0), 0);
  const totalDistanceKm = deliveries.reduce((sum, d) => sum + (d.delivery_distance_km || 0), 0);
  const totalDistanceMiles = deliveries.reduce((sum, d) => sum + (d.delivery_distance_miles || 0), 0);

  return {
    deliveries: totalDeliveries,
    earned: totalEarned,
    points: totalPoints,
    avgPerDelivery: totalDeliveries > 0 ? totalEarned / totalDeliveries : 0,
    totalDistanceKm,
    totalDistanceMiles,
    avgDistancePerDelivery: totalDeliveries > 0 ? totalDistanceMiles / totalDeliveries : 0,
    earningsPerDistance: totalDistanceMiles > 0 ? totalEarned / totalDistanceMiles : 0,
    pointsPerDelivery: totalDeliveries > 0 ? totalPoints / totalDeliveries : 0,
  };
}

/** Get courier stats for a configurable period */
export async function getCourierPeriodStats(courierId: string, sinceDate?: string) {
  let query = supabase
    .from('delivery_request')
    .select('id, courier_earnings, delivery_distance_km, delivery_distance_miles')
    .eq('courier_id', courierId)
    .eq('status', 'delivered');

  if (sinceDate) {
    query = query.gte('delivered_at', sinceDate);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[API] getCourierPeriodStats error:', error);
    throw error;
  }

  // Fetch net points from courier_points_ledger for the same period
  let ledgerQuery = supabase
    .from('courier_points_ledger')
    .select('points')
    .eq('courier_id', courierId);

  if (sinceDate) {
    ledgerQuery = ledgerQuery.gte('entry_timestamp', sinceDate);
  }

  const { data: ledgerData, error: ledgerError } = await ledgerQuery;

  if (ledgerError) {
    console.error('[API] getCourierPeriodStats ledger error:', ledgerError);
  }

  const deliveries = data || [];
  const total = deliveries.length;
  const earned = deliveries.reduce((sum, d) => sum + (d.courier_earnings || 0), 0);
  const points = (ledgerData || []).reduce((sum: number, r: any) => sum + (r.points || 0), 0);
  const totalKm = deliveries.reduce((sum, d) => sum + (d.delivery_distance_km || 0), 0);

  return {
    deliveries: total,
    earned,
    points,
    avgPerDelivery: total > 0 ? earned / total : 0,
    totalKm,
    avgKmPerDelivery: total > 0 ? totalKm / total : 0,
    earningsPerKm: totalKm > 0 ? earned / totalKm : 0,
  };
}

/** Update courier location */
export async function updateCourierLocationInDB(
  courierId: string,
  latitude: number,
  longitude: number
) {
  const { error } = await supabase
    .from('courier')
    .update({
      current_location_latitude: latitude,
      current_location_longitude: longitude,
    })
    .eq('id', courierId);

  if (error) {
    console.error('[API] updateCourierLocation error:', error);
    throw error;
  }
}

/** Toggle courier online/offline status, refresh 30-day points and update city when going online */
export async function updateCourierOnlineStatus(courierId: string, isOnline: boolean) {
  // Check if courier has active deliveries before allowing go-offline
  if (!isOnline) {
    const { data: activeDeliveries } = await supabase
      .from('delivery_request')
      .select('id')
      .eq('courier_id', courierId)
      .in('status', ['accepted_by_courier', 'arrived_at_pickup', 'en_route', 'arrived_at_dropoff'])
      .limit(1);

    if (activeDeliveries && activeDeliveries.length > 0) {
      throw new Error('You have active deliveries. Complete all your deliveries before going offline.');
    }
  }

  // Check if courier is blocked from going online (3-strike penalty)
  if (isOnline) {
    const { data: courierData } = await supabase
      .from('courier')
      .select('forced_offline_until')
      .eq('id', courierId)
      .single();

    if (courierData?.forced_offline_until) {
      const blockedUntil = new Date(courierData.forced_offline_until);
      if (blockedUntil > new Date()) {
        const minutesLeft = Math.ceil((blockedUntil.getTime() - Date.now()) / 60000);
        const hoursLeft = Math.floor(minutesLeft / 60);
        const mins = minutesLeft % 60;
        const timeStr = hoursLeft > 0 ? `${hoursLeft}h ${mins}m` : `${mins} minutes`;
        throw new Error(`You've been temporarily taken offline for declining 3 consecutive delivery offers. You can go online again in ${timeStr}.`);
      }
      // Penalty expired — clear it
      await supabase
        .from('courier')
        .update({ forced_offline_until: null })
        .eq('id', courierId);
    }
  }

  const { error } = await supabase
    .from('courier')
    .update({
      is_online: isOnline,
    })
    .eq('id', courierId);

  if (error) {
    console.error('[API] updateCourierOnlineStatus error:', error);
    throw error;
  }

  // When going online, recalculate the courier's 30-day points and update city
  if (isOnline) {
    try {
      const { data, error: rpcError } = await supabase.rpc('update_courier_30_day_points', {
        courier_id_param: courierId,
      });
      if (rpcError) {
        console.error('[API] update_courier_30_day_points error:', rpcError);
      } else {
        console.log(`[API] Courier 30-day points updated: ${data}`);
      }
    } catch (err) {
      // Non-blocking — don't prevent going online if points calc fails
      console.error('[API] Failed to update 30-day points:', err);
    }

    try {
      const { data: cityId, error: cityError } = await supabase.rpc('update_courier_city', {
        courier_id_param: courierId,
      });
      if (cityError) {
        console.error('[API] update_courier_city error:', cityError);
      } else {
        console.log(`[API] Courier city updated: ${cityId}`);
      }
    } catch (err) {
      // Non-blocking — don't prevent going online if city update fails
      console.error('[API] Failed to update city:', err);
    }
  }
}

/** Get courier profile (merged from customer + courier tables) */
export async function getCourierProfile(courierId: string) {
  const [customerResult, courierResult] = await Promise.all([
    supabase.from('customer').select('*').eq('id', courierId).single(),
    supabase.from('courier').select('*').eq('id', courierId).single(),
  ]);

  if (customerResult.error) {
    console.error('[API] getCourierProfile customer error:', customerResult.error);
    throw customerResult.error;
  }

  return {
    ...customerResult.data,
    ...(courierResult.data || {}),
  };
}

/** Update courier stats (accepted/rejected counts) */
export async function updateCourierStats(
  courierId: string,
  updates: Record<string, any>
) {
  const { error } = await supabase
    .from('courier')
    .update(updates)
    .eq('id', courierId);

  if (error) {
    console.error('[API] updateCourierStats error:', error);
    throw error;
  }
}

// ─── Delivery Offer Operations ──────────────────────────────────────────────────

/** Filter delivery offers */
export async function filterDeliveryOffers(filters: Record<string, any>) {
  let query = supabase.from('delivery_offer').select('*');
  Object.entries(filters).forEach(([key, value]) => {
    query = query.eq(key, value);
  });
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

/** Update a delivery offer */
export async function updateDeliveryOffer(offerId: string, updates: Record<string, any>) {
  const { data, error } = await supabase
    .from('delivery_offer')
    .update(updates)
    .eq('id', offerId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─── Delivery Request Operations ────────────────────────────────────────────────

/** Update a delivery request */
export async function updateDeliveryRequest(requestId: string, updates: Record<string, any>) {
  const { data, error } = await supabase
    .from('delivery_request')
    .update(updates)
    .eq('id', requestId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─── Delivery Points ────────────────────────────────────────────────────────────

/** Get courier's delivery points for last 30 days */
export async function getCourierDeliveryPoints(courierId: string, limit = 50, offset = 0) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data, error } = await supabase
    .from('delivery_point')
    .select('*, delivery_request:delivery_request_id(id, delivery_number, place_id, place:place_id(name, profile_picture_url, photos))')
    .eq('courier_id', courierId)
    .gte('created_at', thirtyDaysAgo.toISOString())
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error('[API] getCourierDeliveryPoints error:', error);
    throw error;
  }
  return data || [];
}

/** Update delivery points */
export async function updateDeliveryPoints(pointsId: string, updates: Record<string, any>) {
  const { data, error } = await supabase
    .from('delivery_point')
    .update(updates)
    .eq('id', pointsId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─── Realtime Subscription ──────────────────────────────────────────────────────

/** Subscribe to delivery offer changes (for real-time updates) */
export function subscribeToDeliveryOffers(
  courierId: string,
  onEvent: (payload: any) => void
) {
  const subscription = supabase
    .channel(`courier-offers-${courierId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'delivery_offer',
      },
      onEvent
    )
    .subscribe();

  return subscription;
}

/** Unsubscribe from a channel */
export function unsubscribeFromChannel(channel: any) {
  if (channel) {
    supabase.removeChannel(channel);
  }
}
