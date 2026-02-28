import { supabase } from '../lib/supabase';
import { getCurrentUserId } from './auth';
import { RealtimeChannel } from '@supabase/supabase-js';

// Types
export interface UserChat {
  id: string;
  participant_1_id: string;
  participant_2_id: string;
  last_message_id: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  participant_1_unread_count: number;
  participant_2_unread_count: number;
  created_at: string;
  updated_at: string;
}

export interface UserChatMessage {
  id: string;
  chat_id: string;
  sender_id: string;
  recipient_id: string;
  message: string;
  message_type: 'text' | 'image' | 'video' | 'audio' | 'file';
  media_url: string | null;
  is_read: boolean;
  read_at: string | null;
  is_deleted: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatParticipant {
  id: string;
  first_name: string;
  last_name: string;
  profile_picture_url: string | null;
  is_online: boolean;
}

export interface FormattedChat {
  id: string;
  otherParticipant: ChatParticipant;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  createdAt: string;
}

export interface FormattedChatMessage {
  id: string;
  chatId: string;
  senderId: string;
  recipientId: string;
  message: string;
  messageType: 'text' | 'image' | 'video' | 'audio' | 'file';
  mediaUrl: string | null;
  isRead: boolean;
  isOwn: boolean;
  createdAt: string;
}

// ============ CHAT FUNCTIONS ============

/**
 * Get all chats for the current user
 */
export async function getUserChats(): Promise<FormattedChat[]> {
  const userId = await getCurrentUserId();
  if (!userId) {
    console.log('[Chat] No user logged in');
    return [];
  }

  try {
    // Get all chats where user is a participant
    const { data: chats, error } = await supabase
      .from('user_chat')
      .select(`
        *,
        participant_1:customer!user_chat_participant_1_id_fkey(id, first_name, last_name, profile_picture_url, is_online),
        participant_2:customer!user_chat_participant_2_id_fkey(id, first_name, last_name, profile_picture_url, is_online)
      `)
      .or(`participant_1_id.eq.${userId},participant_2_id.eq.${userId}`)
      .order('last_message_at', { ascending: false, nullsFirst: false });

    if (error) {
      console.error('[Chat] Error fetching chats:', error);
      return [];
    }

    if (!chats) return [];

    // Format chats
    return chats.map((chat: any) => {
      const isParticipant1 = chat.participant_1_id === userId;
      const otherParticipant = isParticipant1 ? chat.participant_2 : chat.participant_1;
      const unreadCount = isParticipant1 
        ? chat.participant_1_unread_count 
        : chat.participant_2_unread_count;

      return {
        id: chat.id,
        otherParticipant: {
          id: otherParticipant.id,
          first_name: otherParticipant.first_name,
          last_name: otherParticipant.last_name,
          profile_picture_url: otherParticipant.profile_picture_url,
          is_online: otherParticipant.is_online,
        },
        lastMessagePreview: chat.last_message_preview,
        lastMessageAt: chat.last_message_at,
        unreadCount,
        createdAt: chat.created_at,
      };
    });
  } catch (error) {
    console.error('[Chat] Error in getUserChats:', error);
    return [];
  }
}

/**
 * Get or create a chat between two users
 */
export async function getOrCreateChat(otherUserId: string): Promise<string | null> {
  const userId = await getCurrentUserId();
  if (!userId) {
    console.log('[Chat] No user logged in');
    return null;
  }

  if (userId === otherUserId) {
    console.log('[Chat] Cannot create chat with self');
    return null;
  }

  try {
    // Check if chat already exists (order-independent lookup)
    const { data: existingChat, error: fetchError } = await supabase
      .from('user_chat')
      .select('id')
      .or(`and(participant_1_id.eq.${userId},participant_2_id.eq.${otherUserId}),and(participant_1_id.eq.${otherUserId},participant_2_id.eq.${userId})`)
      .maybeSingle();

    if (fetchError) {
      console.error('[Chat] Error checking existing chat:', fetchError);
      return null;
    }

    if (existingChat) {
      return existingChat.id;
    }

    // Create new chat
    const { data: newChat, error: createError } = await supabase
      .from('user_chat')
      .insert({
        participant_1_id: userId,
        participant_2_id: otherUserId,
      })
      .select('id')
      .single();

    if (createError) {
      console.error('[Chat] Error creating chat:', createError);
      return null;
    }

    return newChat.id;
  } catch (error) {
    console.error('[Chat] Error in getOrCreateChat:', error);
    return null;
  }
}

/**
 * Get chat by ID with participant details
 */
export async function getChatById(chatId: string): Promise<FormattedChat | null> {
  const userId = await getCurrentUserId();
  if (!userId) return null;

  try {
    const { data: chat, error } = await supabase
      .from('user_chat')
      .select(`
        *,
        participant_1:customer!user_chat_participant_1_id_fkey(id, first_name, last_name, profile_picture_url, is_online),
        participant_2:customer!user_chat_participant_2_id_fkey(id, first_name, last_name, profile_picture_url, is_online)
      `)
      .eq('id', chatId)
      .single();

    if (error || !chat) {
      console.error('[Chat] Error fetching chat:', error);
      return null;
    }

    const isParticipant1 = chat.participant_1_id === userId;
    const otherParticipant = isParticipant1 ? chat.participant_2 : chat.participant_1;
    const unreadCount = isParticipant1 
      ? chat.participant_1_unread_count 
      : chat.participant_2_unread_count;

    return {
      id: chat.id,
      otherParticipant: {
        id: otherParticipant.id,
        first_name: otherParticipant.first_name,
        last_name: otherParticipant.last_name,
        profile_picture_url: otherParticipant.profile_picture_url,
        is_online: otherParticipant.is_online,
      },
      lastMessagePreview: chat.last_message_preview,
      lastMessageAt: chat.last_message_at,
      unreadCount,
      createdAt: chat.created_at,
    };
  } catch (error) {
    console.error('[Chat] Error in getChatById:', error);
    return null;
  }
}

// ============ MESSAGE FUNCTIONS ============

/**
 * Get messages for a chat
 */
export async function getChatMessages(
  chatId: string, 
  limit = 50, 
  before?: string
): Promise<FormattedChatMessage[]> {
  const userId = await getCurrentUserId();
  if (!userId) return [];

  try {
    let query = supabase
      .from('user_chat_message')
      .select('*')
      .eq('chat_id', chatId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (before) {
      query = query.lt('created_at', before);
    }

    const { data: messages, error } = await query;

    if (error) {
      console.error('[Chat] Error fetching messages:', error);
      return [];
    }

    if (!messages) return [];

    // Format and reverse to get chronological order
    return messages
      .map((msg: UserChatMessage) => ({
        id: msg.id,
        chatId: msg.chat_id,
        senderId: msg.sender_id,
        recipientId: msg.recipient_id,
        message: msg.message,
        messageType: msg.message_type,
        mediaUrl: msg.media_url,
        isRead: msg.is_read,
        isOwn: msg.sender_id === userId,
        createdAt: msg.created_at,
      }))
      .reverse();
  } catch (error) {
    console.error('[Chat] Error in getChatMessages:', error);
    return [];
  }
}

/**
 * Send a message in a chat
 */
export async function sendChatMessage(
  chatId: string,
  recipientId: string,
  message: string,
  messageType: 'text' | 'image' | 'video' | 'audio' | 'file' = 'text',
  mediaUrl?: string
): Promise<FormattedChatMessage | null> {
  const userId = await getCurrentUserId();
  if (!userId) {
    console.log('[Chat] No user logged in');
    return null;
  }

  try {
    const { data: newMessage, error } = await supabase
      .from('user_chat_message')
      .insert({
        chat_id: chatId,
        sender_id: userId,
        recipient_id: recipientId,
        message,
        message_type: messageType,
        media_url: mediaUrl || null,
      })
      .select()
      .single();

    if (error) {
      console.error('[Chat] Error sending message:', error);
      return null;
    }

    return {
      id: newMessage.id,
      chatId: newMessage.chat_id,
      senderId: newMessage.sender_id,
      recipientId: newMessage.recipient_id,
      message: newMessage.message,
      messageType: newMessage.message_type,
      mediaUrl: newMessage.media_url,
      isRead: newMessage.is_read,
      isOwn: true,
      createdAt: newMessage.created_at,
    };
  } catch (error) {
    console.error('[Chat] Error in sendChatMessage:', error);
    return null;
  }
}

/**
 * Mark messages as read in a chat
 */
export async function markChatMessagesAsRead(chatId: string): Promise<boolean> {
  const userId = await getCurrentUserId();
  if (!userId) return false;

  try {
    // Call the stored function to reset unread count and mark messages as read
    const { error } = await supabase.rpc('reset_chat_unread_count', {
      p_chat_id: chatId,
      p_user_id: userId,
    });

    if (error) {
      console.error('[Chat] Error marking messages as read:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[Chat] Error in markChatMessagesAsRead:', error);
    return false;
  }
}

/**
 * Get total unread chat message count
 */
export async function getTotalUnreadChatCount(): Promise<number> {
  const userId = await getCurrentUserId();
  if (!userId) return 0;

  try {
    const { data: chats, error } = await supabase
      .from('user_chat')
      .select('participant_1_id, participant_1_unread_count, participant_2_unread_count')
      .or(`participant_1_id.eq.${userId},participant_2_id.eq.${userId}`);

    if (error || !chats) {
      console.error('[Chat] Error getting unread count:', error);
      return 0;
    }

    return chats.reduce((total, chat) => {
      const isParticipant1 = chat.participant_1_id === userId;
      const unread = isParticipant1 
        ? chat.participant_1_unread_count 
        : chat.participant_2_unread_count;
      return total + (unread || 0);
    }, 0);
  } catch (error) {
    console.error('[Chat] Error in getTotalUnreadChatCount:', error);
    return 0;
  }
}

// ============ REAL-TIME SUBSCRIPTIONS ============

/**
 * Subscribe to new messages in a specific chat
 */
export function subscribeToChatMessages(
  chatId: string,
  onNewMessage: (message: FormattedChatMessage) => void,
  onError?: (error: Error) => void
): RealtimeChannel {
  getCurrentUserId().then(userId => {
    if (!userId) {
      onError?.(new Error('User not logged in'));
    }
  });

  const channel = supabase
    .channel(`chat:${chatId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'user_chat_message',
        filter: `chat_id=eq.${chatId}`,
      },
      async (payload) => {
        const msg = payload.new as UserChatMessage;
        const userId = await getCurrentUserId();
        
        onNewMessage({
          id: msg.id,
          chatId: msg.chat_id,
          senderId: msg.sender_id,
          recipientId: msg.recipient_id,
          message: msg.message,
          messageType: msg.message_type,
          mediaUrl: msg.media_url,
          isRead: msg.is_read,
          isOwn: msg.sender_id === userId,
          createdAt: msg.created_at,
        });
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'user_chat_message',
        filter: `chat_id=eq.${chatId}`,
      },
      async (payload) => {
        const msg = payload.new as UserChatMessage;
        const userId = await getCurrentUserId();

        onNewMessage({
          id: msg.id,
          chatId: msg.chat_id,
          senderId: msg.sender_id,
          recipientId: msg.recipient_id,
          message: msg.message,
          messageType: msg.message_type,
          mediaUrl: msg.media_url,
          isRead: msg.is_read,
          isOwn: msg.sender_id === userId,
          createdAt: msg.created_at,
        });
      }
    )
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR') {
        onError?.(new Error('Failed to subscribe to chat messages'));
      }
    });

  return channel;
}

/**
 * Subscribe to chat list updates (new messages, read status changes)
 */
export async function subscribeToUserChats(
  onChatUpdate: (chat: FormattedChat) => void,
  onError?: (error: Error) => void
): Promise<RealtimeChannel | null> {
  const userId = await getCurrentUserId();
  if (!userId) {
    onError?.(new Error('User not logged in'));
    return null;
  }

  const channel = supabase
    .channel(`user_chats:${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'user_chat',
        filter: `participant_1_id=eq.${userId}`,
      },
      async (payload) => {
        if (payload.new) {
          const chat = await getChatById((payload.new as UserChat).id);
          if (chat) onChatUpdate(chat);
        }
      }
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'user_chat',
        filter: `participant_2_id=eq.${userId}`,
      },
      async (payload) => {
        if (payload.new) {
          const chat = await getChatById((payload.new as UserChat).id);
          if (chat) onChatUpdate(chat);
        }
      }
    )
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR') {
        onError?.(new Error('Failed to subscribe to chat updates'));
      }
    });

  return channel;
}

/**
 * Unsubscribe from a channel
 */
export function unsubscribeFromChannel(channel: RealtimeChannel): void {
  supabase.removeChannel(channel);
}

// ============ UTILITY FUNCTIONS ============

/**
 * Format a chat message date for display
 */
export function formatChatMessageTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Search for users to start a chat with
 */
export async function searchUsersForChat(query: string, limit = 20): Promise<ChatParticipant[]> {
  const userId = await getCurrentUserId();
  if (!userId || query.length < 2) return [];

  try {
    const { data: users, error } = await supabase
      .from('customer')
      .select('id, first_name, last_name, profile_picture_url, is_online')
      .neq('id', userId)
      .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,email.ilike.%${query}%`)
      .limit(limit);

    if (error) {
      console.error('[Chat] Error searching users:', error);
      return [];
    }

    return users || [];
  } catch (error) {
    console.error('[Chat] Error in searchUsersForChat:', error);
    return [];
  }
}

// ============ TYPING INDICATORS ============

/**
 * Send typing indicator via Supabase Realtime broadcast
 */
export async function sendTypingIndicator(chatId: string, isTyping: boolean): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) return;

  try {
    const channel = supabase.channel(`typing:${chatId}`);
    await channel.send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId, isTyping },
    });
  } catch (error) {
    console.error('[Chat] Error sending typing indicator:', error);
  }
}

/**
 * Subscribe to typing indicators in a chat
 */
export function subscribeToTypingIndicator(
  chatId: string,
  onTyping: (isTyping: boolean, userId: string) => void
): RealtimeChannel {
  const channel = supabase
    .channel(`typing:${chatId}`)
    .on('broadcast', { event: 'typing' }, (payload) => {
      const { userId, isTyping } = payload.payload as { userId: string; isTyping: boolean };
      onTyping(isTyping, userId);
    })
    .subscribe();

  return channel;
}
