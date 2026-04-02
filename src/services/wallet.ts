import { supabase } from '../lib/supabase';

export interface LedgerEntry {
  id: string;
  type: string;
  date: string;
  amount: number;
  description: string;
  balance: number;
  referenceId?: string;
  referenceType?: string;
}

/**
 * Get or create courier wallet and return wallet ID
 */
export async function getOrCreateCourierWallet(courierId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc('get_or_create_wallet', {
      p_wallet_type: 'customer',
      p_entity_id: courierId,
      p_country_id: null,
    });

    if (error) {
      console.error('[Wallet] Error getting/creating wallet:', error);
      return null;
    }
    return data;
  } catch (error) {
    console.error('[Wallet] Error in getOrCreateCourierWallet:', error);
    return null;
  }
}

const getStreetFromAddress = (fullAddress: string | null): string => {
  if (!fullAddress) return '';
  const parts = fullAddress.split(',');
  return parts[0]?.trim() || fullAddress;
};

const cleanTopUpDescription = (description: string | null): string => {
  if (!description) return 'Wallet Top Up';
  const cleaned = description.replace(/^Customer had \$[\d.,]+\s*Wallet Balance\s*-\s*/i, '');
  return cleaned || 'Wallet Top Up';
};

const cleanVideoAcceptanceDescription = (description: string | null): string => {
  if (!description) return 'Video Accepted';
  let cleaned = description.replace(/^Payment received\s*-\s*/i, '');
  cleaned = cleaned.replace(/Video\s*#\s*/gi, 'Video #');
  return cleaned || 'Video Accepted';
};

/**
 * Get wallet transactions (ledger entries) for a courier — enriched with order/delivery/place details
 */
export async function getCourierWalletTransactions(courierId: string): Promise<{
  transactions: LedgerEntry[];
  balance: number;
}> {
  try {
    const walletId = await getOrCreateCourierWallet(courierId);

    if (!walletId) {
      return { transactions: [], balance: 0 };
    }

    // Get wallet balance
    const { data: balanceData, error: balanceError } = await supabase.rpc('get_wallet_balance', {
      wallet_id_param: walletId,
    });

    if (balanceError) {
      console.error('[Wallet] Error getting balance:', balanceError);
    }

    const finalBalance = parseFloat(balanceData || 0);

    // Get ledger entries for this wallet (ascending for running balance calc)
    const { data: entries, error: entriesError } = await supabase
      .from('ledger_entries')
      .select('*')
      .or(`debit_account_id.eq.${walletId},credit_account_id.eq.${walletId}`)
      .order('entry_timestamp', { ascending: true });

    if (entriesError) {
      console.error('[Wallet] Error loading ledger entries:', entriesError);
      return { transactions: [], balance: finalBalance };
    }

    // Categorize entries
    const topUpEntries: any[] = [];
    const refundEntries: any[] = [];
    const videoAcceptanceEntries: any[] = [];
    const deliveryRequestEntries: any[] = [];
    const cashBackEntries: any[] = [];
    const referralCommissionEntries: any[] = [];
    const payoutEntries: any[] = [];
    const orderEntriesByRefId: Record<string, { entries: any[]; timestamp: string }> = {};
    const otherEntries: any[] = [];

    (entries || []).forEach((entry: any) => {
      const refType = entry.reference_type || '';
      if (refType === 'top_up' || refType === 'place_wallet_top_up') {
        topUpEntries.push(entry);
      } else if (refType === 'refund') {
        refundEntries.push(entry);
      } else if (refType === 'video_acceptance') {
        videoAcceptanceEntries.push(entry);
      } else if (refType === 'delivery_request') {
        deliveryRequestEntries.push(entry);
      } else if (refType === 'referral_commission') {
        referralCommissionEntries.push(entry);
      } else if (refType === 'payout') {
        payoutEntries.push(entry);
      } else if (refType === 'order') {
        const isCashBack = entry.description?.toLowerCase().includes('cash back') &&
          entry.credit_account_id === walletId;
        if (isCashBack) {
          cashBackEntries.push(entry);
        } else {
          const refId = entry.reference_id;
          if (!orderEntriesByRefId[refId]) {
            orderEntriesByRefId[refId] = { entries: [], timestamp: entry.entry_timestamp };
          }
          orderEntriesByRefId[refId].entries.push(entry);
        }
      } else {
        otherEntries.push(entry);
      }
    });

    // Collect all order IDs to fetch
    const orderIds = [...Object.keys(orderEntriesByRefId)];
    [...cashBackEntries, ...referralCommissionEntries, ...otherEntries].forEach(e => {
      if (e.reference_id && !orderIds.includes(e.reference_id)) orderIds.push(e.reference_id);
    });

    // Fetch order details with place join
    let ordersMap: Record<string, any> = {};
    let ordersByShortId: Record<string, any> = {};

    if (orderIds.length > 0) {
      const { data: orders } = await supabase
        .from('order')
        .select('id, short_id, total, mode, place_id, order_number, subtotal, place:place_id (id, name, address_line_1, city, state)')
        .in('id', orderIds);

      (orders || []).forEach((order: any) => {
        ordersMap[order.id] = order;
        if (order.short_id) ordersByShortId[order.short_id.toUpperCase()] = order;
        if (order.order_number) ordersByShortId[order.order_number.toUpperCase()] = order;
      });

      // If place data missing from join, fetch separately
      const ordersWithoutPlace = Object.values(ordersMap).filter((o: any) => o.place_id && !o.place);
      if (ordersWithoutPlace.length > 0) {
        const missingPlaceIds = [...new Set(ordersWithoutPlace.map((o: any) => o.place_id))];
        const { data: places } = await supabase
          .from('place')
          .select('id, name, address_line_1, city, state')
          .in('id', missingPlaceIds as string[]);
        if (places) {
          const placesMap: Record<string, any> = {};
          places.forEach((p: any) => { placesMap[p.id] = p; });
          Object.keys(ordersMap).forEach(oid => {
            const o = ordersMap[oid];
            if (o.place_id && !o.place && placesMap[o.place_id]) {
              ordersMap[oid] = { ...o, place: placesMap[o.place_id] };
              if (o.short_id) ordersByShortId[o.short_id.toUpperCase()] = ordersMap[oid];
              if (o.order_number) ordersByShortId[o.order_number.toUpperCase()] = ordersMap[oid];
            }
          });
        }
      }
    }

    // Fetch delivery request details
    let deliveryRequestsMap: Record<string, any> = {};
    const deliveryRequestIds = deliveryRequestEntries.map((e: any) => e.reference_id).filter(Boolean);

    if (deliveryRequestIds.length > 0) {
      const { data: drs } = await supabase
        .from('delivery_request')
        .select('id, delivery_number, place_id, pickup_address, dropoff_address, delivery_distance_km, delivery_distance_miles, place:place_id (id, name, address_line_1)')
        .in('id', deliveryRequestIds);

      (drs || []).forEach((dr: any) => { deliveryRequestsMap[dr.id] = dr; });

      // Fetch missing place data
      const drsWithoutPlace = Object.values(deliveryRequestsMap).filter((dr: any) => dr.place_id && !dr.place);
      if (drsWithoutPlace.length > 0) {
        const missingIds = [...new Set(drsWithoutPlace.map((dr: any) => dr.place_id))];
        const { data: places } = await supabase
          .from('place')
          .select('id, name, address_line_1')
          .in('id', missingIds as string[]);
        if (places) {
          const pm: Record<string, any> = {};
          places.forEach((p: any) => { pm[p.id] = p; });
          Object.keys(deliveryRequestsMap).forEach(drId => {
            const dr = deliveryRequestsMap[drId];
            if (dr.place_id && !dr.place && pm[dr.place_id]) {
              deliveryRequestsMap[drId] = { ...dr, place: pm[dr.place_id] };
            }
          });
        }
      }
    }

    const findOrderByDescription = (description: string | null) => {
      const match = description?.match(/Order\s*#\s*([A-Z0-9]+)/i);
      if (match && match[1]) return ordersByShortId[match[1].toUpperCase()] || null;
      return null;
    };

    // Build display items with running balance
    let runningBalance = 0;
    const displayItems: LedgerEntry[] = [];

    type ItemType = {
      type: string;
      entry?: any;
      orderId?: string;
      group?: { entries: any[]; timestamp: string };
      timestamp: string;
    };

    const allItems: ItemType[] = [
      ...topUpEntries.map(e => ({ type: 'top_up', entry: e, timestamp: e.entry_timestamp })),
      ...refundEntries.map(e => ({ type: 'refund', entry: e, timestamp: e.entry_timestamp })),
      ...videoAcceptanceEntries.map(e => ({ type: 'video_acceptance', entry: e, timestamp: e.entry_timestamp })),
      ...deliveryRequestEntries.map(e => ({ type: 'delivery_request', entry: e, timestamp: e.entry_timestamp })),
      ...cashBackEntries.map(e => ({ type: 'cash_back', entry: e, timestamp: e.entry_timestamp })),
      ...referralCommissionEntries.map(e => ({ type: 'referral_commission', entry: e, timestamp: e.entry_timestamp })),
      ...payoutEntries.map(e => ({ type: 'payout', entry: e, timestamp: e.entry_timestamp })),
      ...otherEntries.map(e => ({ type: 'other', entry: e, timestamp: e.entry_timestamp })),
      ...Object.entries(orderEntriesByRefId).map(([orderId, group]) => ({
        type: 'order_group', orderId, group, timestamp: group.timestamp,
      })),
    ];

    allItems.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    allItems.forEach(item => {
      if (item.type === 'order_group') {
        const orderId = item.orderId!;
        const group = item.group!;
        const order = ordersMap[orderId];

        let netAmount = 0;
        group.entries.forEach((entry: any) => {
          const isCredit = entry.credit_account_id === walletId;
          netAmount += isCredit ? parseFloat(entry.amount) : -parseFloat(entry.amount);
        });
        runningBalance += netAmount;

        let orderShortId = order?.order_number || order?.short_id;
        if (!orderShortId && group.entries.length > 0) {
          const match = group.entries[0].description?.match(/Order\s*#\s*([A-Z0-9]+)/i);
          if (match?.[1]) orderShortId = match[1].toUpperCase();
        }
        if (!orderShortId) orderShortId = orderId.slice(-8).toUpperCase();

        let description = `Order #${orderShortId}`;
        if (order?.place) {
          const placeName = order.place.name || 'Unknown Place';
          const street = order.place.address_line_1 || '';
          description = `Order #${orderShortId} - ${placeName}`;
          if (street) description += ` (${street})`;
        }

        displayItems.push({
          id: orderId,
          type: 'order',
          date: group.timestamp,
          amount: netAmount,
          description,
          balance: runningBalance,
          referenceId: orderId,
          referenceType: 'order',
        });
      } else {
        const entry = item.entry!;
        const isCredit = entry.credit_account_id === walletId;
        const isDebit = entry.debit_account_id === walletId;
        let amount = 0;
        if (isCredit && isDebit) return; // skip self-transfers
        if (isCredit) amount = parseFloat(entry.amount);
        else if (isDebit) amount = -parseFloat(entry.amount);
        runningBalance += amount;

        let description = entry.description || 'Transaction';

        if (item.type === 'top_up') {
          description = cleanTopUpDescription(entry.description);
        } else if (item.type === 'video_acceptance') {
          description = cleanVideoAcceptanceDescription(entry.description);
        } else if (item.type === 'delivery_request') {
          const dr = deliveryRequestsMap[entry.reference_id];
          if (dr) {
            const deliveryNumber = dr.delivery_number?.toUpperCase() || entry.reference_id?.slice(-8).toUpperCase() || 'Unknown';
            const placeName = dr.place?.name || 'Unknown Place';
            const pickupStreet = getStreetFromAddress(dr.pickup_address);
            const dropoffStreet = getStreetFromAddress(dr.dropoff_address);
            let distanceStr = '';
            if (dr.delivery_distance_km) distanceStr = `${parseFloat(dr.delivery_distance_km).toFixed(1)} km`;
            else if (dr.delivery_distance_miles) distanceStr = `${parseFloat(dr.delivery_distance_miles).toFixed(1)} mi`;

            description = `Delivery #${deliveryNumber} - ${placeName}`;
            if (pickupStreet && dropoffStreet) description += ` from ${pickupStreet} to ${dropoffStreet}`;
            else if (dropoffStreet) description += ` to ${dropoffStreet}`;
            if (distanceStr) description += ` (${distanceStr})`;
          }
        } else if (item.type === 'cash_back') {
          const order = ordersMap[entry.reference_id];
          const orderShortId = order?.order_number || order?.short_id || entry.reference_id?.slice(-8).toUpperCase() || 'Unknown';
          description = `Member Cash Back - Order #${orderShortId}`;
        } else if (item.type === 'referral_commission') {
          const order = ordersMap[entry.reference_id];
          const orderShortId = order?.order_number || order?.short_id || entry.reference_id?.slice(-8).toUpperCase() || 'Unknown';
          let commissionDetails = 'Referral Commission';
          const descParts = entry.description?.split(' - ');
          if (descParts?.length > 1) {
            const lastPart = descParts[descParts.length - 1];
            if (lastPart.includes('Referral Commission')) commissionDetails = lastPart;
          }
          const cleanedDetails = commissionDetails.replace(/🎉\s*/g, '').trim();
          description = `Order #${orderShortId}`;
          if (order?.place) {
            description = `Order #${orderShortId} from ${order.place.name || 'Unknown Place'}${order.place.city ? ` (${order.place.city})` : ''}`;
          }
          description += ` - 🎉 ${cleanedDetails}`;
        } else if (item.type === 'payout') {
          // Keep payout description as-is
        } else if (item.type === 'other') {
          let order = ordersMap[entry.reference_id];
          if (!order) order = findOrderByDescription(description);
          if (order) {
            const orderShortId = order.order_number || order.short_id || entry.reference_id?.slice(-8).toUpperCase() || 'Unknown';
            const isSimple = /^Order\s*#\s*[A-Z0-9]+$/i.test(description?.trim() || '');
            if (isSimple && order.place) {
              description = `Order #${orderShortId} - ${order.place.name || 'Unknown Place'}`;
              if (order.place.address_line_1) description += ` (${order.place.address_line_1})`;
            }
          }
        }

        displayItems.push({
          id: entry.id,
          type: item.type,
          date: entry.entry_timestamp,
          amount,
          description,
          balance: runningBalance,
          referenceId: entry.reference_id,
          referenceType: entry.reference_type,
        });
      }
    });

    // Reverse so newest is first
    displayItems.reverse();

    return { transactions: displayItems, balance: finalBalance };
  } catch (error) {
    console.error('[Wallet] Error in getCourierWalletTransactions:', error);
    return { transactions: [], balance: 0 };
  }
}
