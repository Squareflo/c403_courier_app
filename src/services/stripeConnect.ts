import { supabase } from '../lib/supabase';

/**
 * Stripe Connect service for courier app.
 * Uses direct fetch for all edge function calls to ensure proper auth header forwarding.
 */

const SUPABASE_URL = 'https://rddssfhltufrwlsmbtps.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJkZHNzZmhsdHVmcndsc21idHBzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA0NjExNTAsImV4cCI6MjA3NjAzNzE1MH0.vNkjdUoYthWoaphE_sp1TsNx7U2A84W515iXVkuU01k';

interface StripeAccountDetails {
  email?: string;
  business_profile?: { name?: string };
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  details_submitted?: boolean;
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    'Content-Type': 'application/json',
    Authorization: session?.access_token ? `Bearer ${session.access_token}` : '',
    apikey: SUPABASE_ANON_KEY,
  };
}

async function callEdgeFunction(name: string, body: any): Promise<any> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok && !result.success) {
    console.error(`[StripeConnect] ${name} error:`, result);
  }
  return result;
}

/**
 * Create a Stripe Express account link for onboarding.
 */
export async function createStripeAccountLink(params: {
  entity_type: string;
  entity_id: string;
  refresh_url: string;
  return_url: string;
}): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    return await callEdgeFunction('create-generic-stripe-account-link', params);
  } catch (err: any) {
    console.error('[StripeConnect] Error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Get Stripe Express account details for the entity.
 */
export async function getStripeAccountDetails(params: {
  entity_type: string;
  entity_id: string;
}): Promise<{ success: boolean; account?: StripeAccountDetails; error?: string }> {
  try {
    return await callEdgeFunction('get-stripe-account-details', params);
  } catch (err: any) {
    console.error('[StripeConnect] Error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Cancel/disconnect Stripe Express account.
 */
export async function cancelStripeConnection(params: {
  entity_type: string;
  entity_id: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const result = await callEdgeFunction('cancel-generic-stripe-connection', params);
    console.log('[StripeConnect] Cancel result:', JSON.stringify(result));
    return result;
  } catch (err: any) {
    console.error('[StripeConnect] Error cancelling:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Request a payout from the courier's wallet via Stripe transfer.
 */
export async function requestWalletPayout(params: {
  entity_type: string;
  entity_id: string;
  amount: number;
}): Promise<{
  success: boolean;
  transfer_id?: string;
  amount?: number;
  fee?: number;
  total_deducted?: number;
  message?: string;
  error?: string;
}> {
  try {
    return await callEdgeFunction('process-wallet-payout', params);
  } catch (err: any) {
    console.error('[StripeConnect] Payout error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Calculate available payout amount (funds older than hold period).
 */
export async function calculateAvailablePayoutAmount(
  courierId: string,
): Promise<{ available: number; totalBalance: number; holdDays: number }> {
  try {
    const { data: walletId, error: walletError } = await supabase.rpc('get_or_create_wallet', {
      p_wallet_type: 'customer',
      p_entity_id: courierId,
      p_country_id: null,
    });

    if (walletError || !walletId) {
      console.error('[StripeConnect] Error getting wallet:', walletError);
      return { available: 0, totalBalance: 0, holdDays: 7 };
    }

    const { data: balanceData, error: balanceError } = await supabase.rpc('get_wallet_balance', {
      wallet_id_param: walletId,
    });

    if (balanceError) {
      console.error('[StripeConnect] Error getting balance:', balanceError);
      return { available: 0, totalBalance: 0, holdDays: 7 };
    }

    const totalBalance = parseFloat(balanceData || 0);

    let holdDays = 7;
    try {
      const { data: wallet } = await supabase
        .from('wallets')
        .select('country_id')
        .eq('id', walletId)
        .single();

      let countryId = wallet?.country_id;

      // Fallback: look up country via customer -> city -> state_province
      if (!countryId) {
        const { data: custData } = await supabase
          .from('customer')
          .select('city_id')
          .eq('id', courierId)
          .single();
        if (custData?.city_id) {
          const { data: cityData } = await supabase
            .from('city')
            .select('state_province_id')
            .eq('id', custData.city_id)
            .single();
          if (cityData?.state_province_id) {
            const { data: spData } = await supabase
              .from('state_province')
              .select('country_id')
              .eq('id', cityData.state_province_id)
              .single();
            if (spData?.country_id) {
              countryId = spData.country_id;
            }
          }
        }
      }

      if (countryId) {
        const { data: countryData } = await supabase
          .from('country')
          .select('payout_hold_days')
          .eq('id', countryId)
          .single();

        if (countryData?.payout_hold_days) {
          holdDays = countryData.payout_hold_days;
        }
      }
    } catch {
      // Use default 7 days
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - holdDays);

    const { data: allEntries, error: entriesError } = await supabase
      .from('ledger_entries')
      .select('amount, credit_account_id, debit_account_id, entry_timestamp')
      .or(`credit_account_id.eq.${walletId},debit_account_id.eq.${walletId}`);

    if (entriesError) {
      console.error('[StripeConnect] Error getting entries:', entriesError);
      return { available: 0, totalBalance, holdDays };
    }

    let availableCredits = 0;
    let availableDebits = 0;

    (allEntries || []).forEach((entry: any) => {
      const entryDate = new Date(entry.entry_timestamp);
      const isOld = entryDate <= cutoffDate;
      const isCredit = entry.credit_account_id === walletId;
      const isDebit = entry.debit_account_id === walletId;
      const amount = parseFloat(entry.amount);

      if (isCredit && isOld) {
        availableCredits += amount;
      }
      if (isDebit) {
        availableDebits += amount;
      }
    });

    const calculatedAvailable = availableCredits - availableDebits;
    const available = Math.max(0, Math.min(calculatedAvailable, totalBalance));

    return { available, totalBalance, holdDays };
  } catch (err) {
    console.error('[StripeConnect] Error calculating available:', err);
    return { available: 0, totalBalance: 0, holdDays: 7 };
  }
}
