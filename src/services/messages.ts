import { supabase } from '../lib/supabase';
import { getCurrentUserId } from './auth';
// Location stub for courier app
async function getCachedLocationOnly(): Promise<{ latitude: number; longitude: number } | null> {
  return null;
}

type CustomerMessageRecipientColumn = 'recipient_id' | 'customer_id';

type CustomerMessageColumnSupport = {
  recipient_id: boolean;
  customer_id: boolean;
  recipient_type: boolean;
  recipient_role: boolean;
  sender_id: boolean;
};

let cachedRecipientColumn: CustomerMessageRecipientColumn | null = null;

let cachedColumnSupport: CustomerMessageColumnSupport | null = null;

type MessageTargetingContext = {
  communityId: string | null;
  territoryIds: string[];
  followedPlaceIds: string[];
  roles: string[];
};

const BROADCAST_READ_IDS_KEY_PREFIX = 'messages.broadcastReadIds.v1:';
const MESSAGES_CHANGED_AT_KEY = 'messages.changedAt.v1';

async function notifyMessagesChanged(): Promise<void> {
  // Deprecated: used for local storage sync
}

function isBroadcastMessage(message: Pick<CustomerMessage, 'recipient_type' | 'recipient_role'>): boolean {
  const recipientType = message.recipient_type ?? null;
  if (!recipientType) return false;

  if (recipientType === 'community' || recipientType === 'territory' || recipientType === 'place_followers') {
    return true;
  }

  // Role-based broadcast (customer segment)
  if (recipientType === 'customer' && !!message.recipient_role) {
    return true;
  }

  return false;
}

async function getBroadcastReadIds(userId: string): Promise<Set<string>> {
  try {
    const { data, error } = await supabase
      .from('customer_message_read')
      .select('message_id')
      .eq('customer_id', userId);

    if (error) {
      // If table doesn't exist, ignore (e.g. pending migration)
      if (error.code === '42P01') return new Set();
      console.error('[Messages] Error fetching read receipts:', error);
      return new Set();
    }
    
    return new Set((data || []).map((r: any) => r.message_id));
  } catch (error) {
    console.error('[Messages] Error in getBroadcastReadIds:', error);
    return new Set();
  }
}

async function markBroadcastRead(userId: string, messageId: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('customer_message_read')
      .upsert(
        { message_id: messageId, customer_id: userId },
        { onConflict: 'message_id, customer_id', ignoreDuplicates: true }
      );
      
    if (error && error.code !== '42P01') {
      console.error('[Messages] Error marking message read:', error);
    }
  } catch (error) {
    console.error('[Messages] Error in markBroadcastRead:', error);
  }
}

let cachedTargetingContext: { userId: string; ctx: MessageTargetingContext; fetchedAtMs: number } | null = null;
const TARGETING_CONTEXT_TTL_MS = 30_000;

async function resolveCustomerMessageRecipientColumn(): Promise<CustomerMessageRecipientColumn> {
  if (cachedRecipientColumn) return cachedRecipientColumn;

  // Try the newer admin messaging schema first (recipient_id), then legacy (customer_id)
  const candidates: CustomerMessageRecipientColumn[] = ['recipient_id', 'customer_id'];

  for (const column of candidates) {
    const { error } = await supabase
      .from('customer_message')
      // If column doesn't exist, PostgREST returns 42703
      .select(`id, ${column}`)
      .limit(1);

    if (!error) {
      cachedRecipientColumn = column;
      return column;
    }

    if (error.code === '42P01') {
      // Table missing - keep existing behavior elsewhere
      break;
    }

    if (error.code !== '42703') {
      // For unexpected errors (RLS, auth, network), default to recipient_id.
      // This keeps behavior aligned with the newer messaging system.
      cachedRecipientColumn = 'recipient_id';
      return 'recipient_id';
    }
  }

  cachedRecipientColumn = 'recipient_id';
  return 'recipient_id';
}

async function resolveCustomerMessageColumnSupport(): Promise<CustomerMessageColumnSupport> {
  if (cachedColumnSupport) return cachedColumnSupport;

  const columns: Array<keyof CustomerMessageColumnSupport> = [
    'recipient_id',
    'customer_id',
    'recipient_type',
    'recipient_role',
    'sender_id',
  ];

  const support: CustomerMessageColumnSupport = {
    recipient_id: false,
    customer_id: false,
    recipient_type: false,
    recipient_role: false,
    sender_id: false,
  };

  for (const column of columns) {
    const { error } = await supabase
      .from('customer_message')
      .select(`id, ${column}`)
      .limit(1);

    if (!error) {
      support[column] = true;
      continue;
    }

    if (error.code === '42P01') {
      // Table missing
      break;
    }

    if (error.code === '42703') {
      // Column missing
      support[column] = false;
      continue;
    }

    // For unexpected errors (RLS/auth/network), assume newer schema exists so queries won't be overly restrictive.
    // Worst case, RLS will still prevent access.
    support.recipient_id = true;
    support.recipient_type = true;
    support.recipient_role = true;
    break;
  }

  cachedColumnSupport = support;
  return support;
}

async function getMessageTargetingContext(userId: string): Promise<MessageTargetingContext> {
  const now = Date.now();
  if (
    cachedTargetingContext &&
    cachedTargetingContext.userId === userId &&
    now - cachedTargetingContext.fetchedAtMs < TARGETING_CONTEXT_TTL_MS
  ) {
    return cachedTargetingContext.ctx;
  }

  let roles: string[] = [];
  let communityId: string | null = null;
  let territoryIds: string[] = [];

  try {
    const { data: customer, error } = await supabase
      .from('customer')
      .select('roles, community_id, managed_territories')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.warn('[Messages] Error loading customer targeting fields:', error);
    } else if (customer) {
      roles = Array.isArray(customer.roles) ? customer.roles.filter(Boolean) : [];
      communityId = (customer.community_id as string | null) ?? null;
      territoryIds = Array.isArray(customer.managed_territories)
        ? customer.managed_territories.filter(Boolean)
        : [];
    }
  } catch (e) {
    console.warn('[Messages] Unexpected error loading customer targeting fields:', e);
  }

  // Fallback to cached location-derived community if customer.community_id is missing
  if (!communityId) {
    try {
      const cachedLocation = await getCachedLocationOnly();
      if (cachedLocation?.communityId) {
        communityId = cachedLocation.communityId;
      }
    } catch (e) {
      // ignore
    }
  }

  // Followed places for place_followers targeting
  let followedPlaceIds: string[] = [];
  try {
    const { data, error } = await supabase
      .from('follower')
      .select('place_id')
      .eq('customer_id', userId)
      .not('place_id', 'is', null);

    if (error) {
      console.warn('[Messages] Error loading followed places:', error);
    } else {
      followedPlaceIds = (data || [])
        .map((r: any) => r.place_id)
        .filter((id: any): id is string => typeof id === 'string' && id.length > 0);
    }
  } catch (e) {
    console.warn('[Messages] Unexpected error loading followed places:', e);
  }

  const ctx: MessageTargetingContext = {
    communityId,
    territoryIds,
    followedPlaceIds,
    roles,
  };

  cachedTargetingContext = { userId, ctx, fetchedAtMs: now };
  return ctx;
}

function buildMessageRecipientOrFilter(params: {
  userId: string;
  ctx: MessageTargetingContext;
  support: CustomerMessageColumnSupport;
}): string {
  const { userId, ctx, support } = params;

  const clauses: string[] = [];

  // Direct message schemas (messages received by user)
  if (support.recipient_id) clauses.push(`recipient_id.eq.${userId}`);
  if (support.customer_id) clauses.push(`customer_id.eq.${userId}`);

  // Messages sent by user (support requests, etc.)
  if (support.sender_id) clauses.push(`sender_id.eq.${userId}`);

  // Broadcast targeting uses recipient_type + recipient_id
  if (support.recipient_type && support.recipient_id) {
    if (ctx.communityId) {
      clauses.push(`and(recipient_type.eq.community,recipient_id.eq.${ctx.communityId})`);
    }

    for (const territoryId of ctx.territoryIds) {
      clauses.push(`and(recipient_type.eq.territory,recipient_id.eq.${territoryId})`);
    }

    for (const placeId of ctx.followedPlaceIds) {
      clauses.push(`and(recipient_type.eq.place_followers,recipient_id.eq.${placeId})`);
    }
  }

  // Role-based targeting uses recipient_type + recipient_role
  if (support.recipient_type && support.recipient_role) {
    for (const role of ctx.roles) {
      clauses.push(`and(recipient_type.eq.customer,recipient_role.eq.${role})`);
    }
  }

  return clauses.join(',');
}

/**
 * Strip HTML tags and decode entities for plain text display
 */
export function stripHtml(html: string): string {
  if (!html) return '';
  // Remove HTML tags
  let text = html.replace(/<[^>]*>/g, '');
  // Decode common HTML entities
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&apos;/g, "'");
  text = text.replace(/&#x27;/g, "'");
  text = text.replace(/&#x2F;/g, '/');
  // Normalize whitespace (collapse multiple spaces/newlines)
  text = text.replace(/\s+/g, ' ').trim();
  return text;
}

/**
 * Customer Message type matching the database schema
 * Supports both legacy fields (subject, message) and new fields (main_heading, intro_text, body_text)
 */
export interface CustomerMessage {
  id: string;
  // Schema varies across environments: some use customer_id (legacy), some use recipient_id (newer admin messaging)
  customer_id?: string;
  recipient_id?: string | null;
  recipient_type?: string | null;
  recipient_role?: string | null;
  sender_id: string | null;
  sender_type: 'place' | 'admin' | 'system';
  sender_name: string;
  // Legacy fields (used by PlacePromo, support requests, etc.)
  subject: string | null;
  message: string | null;
  message_html: string | null;
  // New fields (used by admin messaging system)
  main_heading: string | null;
  intro_text: string | null;
  body_text: string | null;
  // Common fields
  status: 'unread' | 'read' | 'published' | 'sent' | 'draft' | 'canceled' | 'canceled_spam';
  read_at: string | null;
  created_at: string;
  send_at: string | null;
  expiry_date: string | null;
  is_urgent: boolean | null;
  image_url: string | null;
  related_order_id: string | null;
  related_place_id: string | null;
  // New fields form late 2025 update
  button_type: string | null;
  button_link_id: string | null;
  media_type: 'image' | 'video' | null;
  video_id: string | null;
  is_template: boolean | null;
  template_name: string | null;
  tags?: string[] | null;
}

/**
 * Formatted message for display
 */
export interface FormattedMessage {
  id: string;
  senderName: string;
  senderType: 'place' | 'admin' | 'system' | 'customer';
  senderId: string | null;
  subject: string;
  preview: string;
  message: string;
  messageHtml: string | null;
  // Content fields
  mainHeading: string | null;
  introText: string | null;
  bodyText: string | null;
  // Media & Actions
  buttonType: string | null;
  buttonLinkId: string | null;
  mediaType: 'image' | 'video' | null;
  videoId: string | null;
  imageUrl: string | null;
  tags: string[];
  // Status & Meta
  status: 'unread' | 'read' | 'published' | 'sent' | 'draft' | 'canceled' | 'canceled_spam';
  readAt: string | null;
  createdAt: string;
  sendAt: string | null;
  expiryDate: string | null;
  isUrgent: boolean;
  relatedOrderId: string | null;
  relatedPlaceId: string | null;
  // Direction indicator
  isSentByMe: boolean;
  recipientType: string | null;
  recipientRole: string | null;
}

/**
 * Get all messages for the current user
 * Includes both direct messages (customer_id match) and broadcast messages
 * Filters out messages that haven't been sent yet or have expired
 */
export async function getCustomerMessages(): Promise<FormattedMessage[]> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.log('[Messages] No user logged in');
      return [];
    }

    const [columnSupport, ctx] = await Promise.all([
      resolveCustomerMessageColumnSupport(),
      getMessageTargetingContext(userId),
    ]);

    const broadcastReadIds = await getBroadcastReadIds(userId);

    // If we can't determine any targeting columns, fall back to previous behavior.
    const recipientOr = buildMessageRecipientOrFilter({ userId, ctx, support: columnSupport });
    const allowedStatuses: Array<CustomerMessage['status']> = ['unread', 'read', 'published', 'sent'];

    let query = supabase
      .from('customer_message')
      .select('*')
      .in('status', allowedStatuses)
      .order('created_at', { ascending: false });

    if (recipientOr) {
      query = query.or(recipientOr);
    } else {
      // Legacy fallback: use whichever recipient column we can resolve
      const recipientColumn = await resolveCustomerMessageRecipientColumn();
      query = query.eq(recipientColumn, userId);
    }

    const { data, error } = await query;

    if (error) {
      if (error.code === '42P01') {
        console.warn('[Messages] customer_message table missing. Please run migration 005.');
        return [];
      }
      console.error('[Messages] Error fetching messages:', JSON.stringify(error, null, 2));
      return [];
    }

    // Filter messages: show if send_at is null or in the past, and expiry_date is null or in the future
    const filteredData = (data || []).filter(msg => {
      // Check send_at: message should be sent (null = immediate, or past date)
      if (msg.send_at && new Date(msg.send_at) > new Date()) {
        return false;
      }
      // Check expiry_date: message should not be expired
      if (msg.expiry_date && new Date(msg.expiry_date) < new Date()) {
        return false;
      }
      // Exclude draft and canceled messages
      if (msg.status === 'draft' || msg.status === 'canceled' || msg.status === 'canceled_spam') {
        return false;
      }
      return true;
    });

    return filteredData.map((m: CustomerMessage) => formatMessage(m, { broadcastReadIds, userId }));
  } catch (error) {
    console.error('[Messages] Error in getCustomerMessages:', error);
    return [];
  }
}

/**
 * Get a single message by ID
 */
export async function getMessageById(messageId: string): Promise<FormattedMessage | null> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.log('[Messages] No user logged in');
      return null;
    }

    const [columnSupport, ctx] = await Promise.all([
      resolveCustomerMessageColumnSupport(),
      getMessageTargetingContext(userId),
    ]);

    const recipientOr = buildMessageRecipientOrFilter({ userId, ctx, support: columnSupport });

    let query = supabase
      .from('customer_message')
      .select('*')
      .eq('id', messageId);

    if (recipientOr) {
      query = query.or(recipientOr);
    } else {
      const recipientColumn = await resolveCustomerMessageRecipientColumn();
      query = query.eq(recipientColumn, userId);
    }

    const { data, error } = await query.single();

    if (error) {
      console.error('[Messages] Error fetching message:', error);
      return null;
    }

    const broadcastReadIds = await getBroadcastReadIds(userId);
    return formatMessage(data, { broadcastReadIds, userId });
  } catch (error) {
    console.error('[Messages] Error in getMessageById:', error);
    return null;
  }
}

/**
 * Mark a message as read
 */
export async function markMessageAsRead(messageId: string): Promise<boolean> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.log('[Messages] No user logged in');
      return false;
    }

    // Determine whether this is a broadcast message. If so, track read state locally.
    // This avoids globally updating a single broadcast row shared across recipients.
    const [columnSupport, ctx] = await Promise.all([
      resolveCustomerMessageColumnSupport(),
      getMessageTargetingContext(userId),
    ]);

    const recipientOr = buildMessageRecipientOrFilter({ userId, ctx, support: columnSupport });
    let fetchQuery = supabase
      .from('customer_message')
      .select('id, recipient_type, recipient_role')
      .eq('id', messageId);

    if (recipientOr) {
      fetchQuery = fetchQuery.or(recipientOr);
    } else {
      const recipientColumn = await resolveCustomerMessageRecipientColumn();
      fetchQuery = fetchQuery.eq(recipientColumn, userId);
    }

    const { data: messageMeta, error: metaError } = await fetchQuery.maybeSingle();
    if (!metaError && messageMeta && isBroadcastMessage(messageMeta as any)) {
      await markBroadcastRead(userId, messageId);
      await notifyMessagesChanged();
      return true;
    }

    // Only mark as read for direct messages (rows that belong to this user).
    // Broadcast messages (community/territory/place_followers/role) may represent a single row for many recipients,
    // and updating it would change the message globally.
    const directClauses: string[] = [];
    if (columnSupport.recipient_id) directClauses.push(`recipient_id.eq.${userId}`);
    if (columnSupport.customer_id) directClauses.push(`customer_id.eq.${userId}`);

    if (directClauses.length === 0) {
      // Fall back to the previous behavior if we can't detect columns.
      const recipientColumn = await resolveCustomerMessageRecipientColumn();
      directClauses.push(`${recipientColumn}.eq.${userId}`);
    }

    const { error } = await supabase
      .from('customer_message')
      .update({
        status: 'read',
        read_at: new Date().toISOString(),
      })
      .eq('id', messageId)
      .or(directClauses.join(','));

    if (error) {
      console.error('[Messages] Error marking message as read:', error);
      return false;
    }

    await notifyMessagesChanged();
    return true;
  } catch (error) {
    console.error('[Messages] Error in markMessageAsRead:', error);
    return false;
  }
}

/**
 * Get unread message count for the current user
 * Counts messages with status 'unread' or 'published' (admin messages are 'published' until read)
 */
export async function getUnreadMessageCount(): Promise<number> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return 0;
    }

    const [columnSupport, ctx] = await Promise.all([
      resolveCustomerMessageColumnSupport(),
      getMessageTargetingContext(userId),
    ]);

    const recipientOr = buildMessageRecipientOrFilter({ userId, ctx, support: columnSupport });
    // Keep consistent with UI: treat only unread/published as "unread".
    // (We may still fetch 'sent' for listing, but it should not increment the unread badge.)
    const allowedStatuses: Array<CustomerMessage['status']> = ['unread', 'published'];

    let query = supabase
      .from('customer_message')
      .select('id, status, send_at, expiry_date')
      .in('status', allowedStatuses);

    if (recipientOr) {
      query = query.or(recipientOr);
    } else {
      const recipientColumn = await resolveCustomerMessageRecipientColumn();
      query = query.eq(recipientColumn, userId);
    }

    // Explicitly exclude messages sent by the current user to match UI filtering
    // (The UI filters out isSentByMe, so we shouldn't count them in unread badge)
    if (columnSupport.sender_id) {
      query = query.neq('sender_id', userId);
    }

    const { data, error } = await query;

    if (error) {
      // Ignore "relation does not exist" error to prevent noise before migration
      if (error.code === '42P01') {
        console.warn('[Messages] customer_message table missing. Please run migration 005.');
        return 0;
      }
      console.error('[Messages] Error fetching unread count:', JSON.stringify(error, null, 2));
      return 0;
    }

    const broadcastReadIds = await getBroadcastReadIds(userId);

    // Filter by send_at/expiry_date and local broadcast read state
    const count = (data || []).filter((msg: any) => {
      if (msg.send_at && new Date(msg.send_at) > new Date()) {
        return false;
      }
      if (msg.expiry_date && new Date(msg.expiry_date) < new Date()) {
        return false;
      }
      if (isBroadcastMessage(msg) && broadcastReadIds.has(msg.id)) {
        return false;
      }
      return true;
    }).length;

    return count;
  } catch (error) {
    console.error('[Messages] Error in getUnreadMessageCount:', error);
    return 0;
  }
}

/**
 * Delete a message
 */
export async function deleteMessage(messageId: string): Promise<boolean> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.log('[Messages] No user logged in');
      return false;
    }

    const [columnSupport, ctx] = await Promise.all([
      resolveCustomerMessageColumnSupport(),
      getMessageTargetingContext(userId),
    ]);

    // If it's a broadcast message, deleting should just hide it locally.
    try {
      const recipientOr = buildMessageRecipientOrFilter({ userId, ctx, support: columnSupport });
      let fetchQuery = supabase
        .from('customer_message')
        .select('id, recipient_type, recipient_role')
        .eq('id', messageId);

      if (recipientOr) {
        fetchQuery = fetchQuery.or(recipientOr);
      } else {
        const recipientColumn = await resolveCustomerMessageRecipientColumn();
        fetchQuery = fetchQuery.eq(recipientColumn, userId);
      }

      const { data: messageMeta, error: metaError } = await fetchQuery.maybeSingle();
      if (!metaError && messageMeta && isBroadcastMessage(messageMeta as any)) {
        await markBroadcastRead(userId, messageId);
        await notifyMessagesChanged();
        return true;
      }
    } catch {
      // ignore and fall through to direct delete
    }

    // Only allow delete for direct messages.
    const directClauses: string[] = [];
    if (columnSupport.recipient_id) directClauses.push(`recipient_id.eq.${userId}`);
    if (columnSupport.customer_id) directClauses.push(`customer_id.eq.${userId}`);

    if (directClauses.length === 0) {
      const recipientColumn = await resolveCustomerMessageRecipientColumn();
      directClauses.push(`${recipientColumn}.eq.${userId}`);
    }

    const { error } = await supabase
      .from('customer_message')
      .delete()
      .eq('id', messageId)
      .or(directClauses.join(','));

    if (error) {
      console.error('[Messages] Error deleting message:', error);
      return false;
    }

    await notifyMessagesChanged();
    return true;
  } catch (error) {
    console.error('[Messages] Error in deleteMessage:', error);
    return false;
  }
}

/**
 * Format a raw message from the database
 * Handles both legacy fields (subject, message) and new admin fields (main_heading, intro_text, body_text)
 */
function formatMessage(
  message: CustomerMessage,
  opts?: {
    broadcastReadIds?: Set<string>;
    userId?: string;
  }
): FormattedMessage {
  // Determine subject: prefer main_heading (new), fallback to subject (legacy)
  const subject = message.main_heading || message.subject || '';
  
  // Determine message content: prefer body_text (new), then message (legacy), then intro_text
  const rawContent = message.body_text || message.message_html || message.message || message.intro_text || '';
  const plainText = stripHtml(rawContent);
  const preview = plainText.length > 100 
    ? plainText.substring(0, 100) + '...' 
    : plainText;

  let displayStatus: FormattedMessage['status'] = message.status;

  // Normalize admin delivery statuses
  if (displayStatus === 'sent') displayStatus = 'published';
  if (displayStatus === 'canceled_spam') displayStatus = 'canceled';

  // Apply local read override for broadcast messages
  if (opts?.broadcastReadIds && isBroadcastMessage(message) && opts.broadcastReadIds.has(message.id)) {
    displayStatus = 'read';
  }

  // Check if this message was sent by the current user
  const isSentByMe = !!(opts?.userId && message.sender_id === opts.userId);
  const tags = Array.isArray(message.tags)
    ? message.tags.filter((tag): tag is string => typeof tag === 'string' && tag.length > 0)
    : [];
  
  return {
    id: message.id,
    senderName: message.sender_name || 'ChowLocal',
    senderType: (message.sender_type as FormattedMessage['senderType']) || 'admin',
    senderId: message.sender_id,
    subject,
    preview,
    message: message.message || message.body_text || '',
    messageHtml: message.message_html,
    mainHeading: message.main_heading,
    introText: message.intro_text,
    bodyText: message.body_text,
    buttonType: message.button_type,
    buttonLinkId: message.button_link_id,
    mediaType: (message.media_type as 'image' | 'video' | null) || (message.image_url ? 'image' : null),
    videoId: message.video_id,
    imageUrl: message.image_url,
    tags,
    status: displayStatus,
    readAt: message.read_at,
    createdAt: message.created_at,
    sendAt: message.send_at,
    expiryDate: message.expiry_date,
    isUrgent: message.is_urgent || false,
    relatedOrderId: message.related_order_id,
    relatedPlaceId: message.related_place_id,
    isSentByMe,
    recipientType: message.recipient_type ?? null,
    recipientRole: message.recipient_role ?? null,
  };
}

/**
 * Format date for display (e.g., "Today", "Yesterday", "Dec 5", "Dec 5, 2024")
 */
export function formatMessageDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const messageDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (messageDate.getTime() === today.getTime()) {
    // Today - show time
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
  } else if (messageDate.getTime() === yesterday.getTime()) {
    return 'Yesterday';
  } else if (date.getFullYear() === now.getFullYear()) {
    // Same year - show month and day
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric' 
    });
  } else {
    // Different year - show full date
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    });
  }
}
