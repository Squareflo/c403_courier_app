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

/**
 * Get wallet transactions (ledger entries) for a courier
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

    // Get ledger entries for this wallet
    const { data: entries, error: entriesError } = await supabase
      .from('ledger_entries')
      .select('*')
      .or(`debit_account_id.eq.${walletId},credit_account_id.eq.${walletId}`)
      .order('entry_timestamp', { ascending: false });

    if (entriesError) {
      console.error('[Wallet] Error loading ledger entries:', entriesError);
      return { transactions: [], balance: finalBalance };
    }

    // Build display items with running balance
    let runningBalance = finalBalance;
    const displayItems: LedgerEntry[] = [];

    // Entries are already descending by timestamp
    // We need to calculate running balance from the top
    // First pass: calculate amounts
    const amounts: number[] = [];
    (entries || []).forEach((entry: any) => {
      const isCredit = entry.credit_account_id === walletId;
      const isDebit = entry.debit_account_id === walletId;
      let amount = 0;
      if (isCredit && isDebit) {
        amount = 0;
      } else if (isCredit) {
        amount = parseFloat(entry.amount || 0);
      } else if (isDebit) {
        amount = -parseFloat(entry.amount || 0);
      }
      amounts.push(amount);
    });

    // Calculate running balances (entries are newest first)
    // Start from current balance and work backwards
    let bal = finalBalance;
    const balances: number[] = [];
    for (let i = 0; i < amounts.length; i++) {
      balances.push(bal);
      bal -= amounts[i]; // subtract to go back in time
    }

    (entries || []).forEach((entry: any, index: number) => {
      const amount = amounts[index];
      if (amount === 0) return; // skip self-transfers

      let type = entry.reference_type || 'other';
      let description = entry.description || 'Transaction';

      displayItems.push({
        id: entry.id,
        type,
        date: entry.entry_timestamp,
        amount,
        description,
        balance: balances[index],
        referenceId: entry.reference_id,
        referenceType: entry.reference_type,
      });
    });

    return { transactions: displayItems, balance: finalBalance };
  } catch (error) {
    console.error('[Wallet] Error in getCourierWalletTransactions:', error);
    return { transactions: [], balance: 0 };
  }
}
