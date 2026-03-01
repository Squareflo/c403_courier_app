import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Mail, MailOpen, MailX, Bell, MessagesSquare, User, Send, ChevronLeft } from 'lucide-react-native';
import { RealtimeChannel } from '@supabase/supabase-js';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { fontFamily } from '../constants/typography';
import { spacing } from '../constants/spacing';
import { getCurrentUser } from '../services/auth';
import { supabase } from '../lib/supabase';
import {
  getCustomerMessages,
  getUnreadMessageCount,
  formatMessageDate,
  type FormattedMessage,
} from '../services/messages';
import {
  getUserChats,
  subscribeToUserChats,
  unsubscribeFromChannel,
  type FormattedChat,
} from '../services/chat';

const PLATFORM_NAME = 'Chow Local';

type FilterTag = string;

interface UnifiedItem {
  id: string;
  type: 'notification' | 'conversation';
  title: string;
  preview: string;
  timestamp: string;
  isUnread: boolean;
  isSentByMe?: boolean;
  message?: FormattedMessage;
  chat?: FormattedChat;
}

function replaceTemplateVariables(
  content: string,
  variables: {
    placeName?: string | null;
    customerFirstName?: string | null;
    communityCity?: string | null;
  }
): string {
  let processed = content;
  if (variables.placeName) {
    processed = processed.replace(/{{place_name}}/gi, variables.placeName);
  }
  if (variables.customerFirstName) {
    processed = processed.replace(/{{customer_first_name}}/gi, variables.customerFirstName);
  }
  if (variables.communityCity) {
    processed = processed.replace(/{{community_city}}/gi, variables.communityCity);
  }
  return processed;
}

function formatTagLabel(tag: string): string {
  return tag
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

interface MessagesScreenProps {
  onBack?: () => void;
  onMessagePress?: (messageId: string) => void;
  onChatPress?: (chatId: string) => void;
  markMessageReadLocally?: string | null;
  markChatReadLocally?: string | null;
}

export function MessagesScreen({ onBack, onMessagePress, onChatPress, markMessageReadLocally, markChatReadLocally }: MessagesScreenProps) {
  const { courier } = useAuth();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [messages, setMessages] = useState<FormattedMessage[]>([]);
  const [chats, setChats] = useState<FormattedChat[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [currentUserFirstName, setCurrentUserFirstName] = useState<string | null>(null);
  const [currentUserCommunity, setCurrentUserCommunity] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterTag>('all');
  const chatChannelRef = useRef<RealtimeChannel | null>(null);
  const [chatAvatarErrors, setChatAvatarErrors] = useState<Record<string, boolean>>({});

  // Mark message as read locally when returning from detail screen
  useEffect(() => {
    if (markMessageReadLocally) {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === markMessageReadLocally ? { ...msg, status: 'read' as const, readAt: new Date().toISOString() } : msg
        )
      );
    }
  }, [markMessageReadLocally]);

  // Mark chat as read locally when returning from chat screen
  useEffect(() => {
    if (markChatReadLocally) {
      setChats((prev) =>
        prev.map((chat) =>
          chat.id === markChatReadLocally ? { ...chat, unreadCount: 0 } : chat
        )
      );
    }
  }, [markChatReadLocally]);

  const profileImage = courier?.profile_picture_url || null;

  const loadMessages = useCallback(async () => {
    try {
      setLoading(true);

      const [messagesData, unreadCountData, currentUser, chatsData] = await Promise.all([
        getCustomerMessages(),
        getUnreadMessageCount(),
        getCurrentUser(),
        getUserChats(),
      ]);

      if (currentUser) {
        setCurrentUserFirstName(currentUser.first_name || null);
        setCurrentUserCommunity(null);
        if (currentUser.community_id) {
          const { data: community } = await supabase
            .from('community')
            .select('name')
            .eq('id', currentUser.community_id)
            .single();
          if (community) setCurrentUserCommunity(community.name);
        }
      }

      setMessages(messagesData);
      setChats(chatsData);
      setUnreadCount(unreadCountData);
    } catch (error) {
      console.error('[MessagesScreen] Error loading messages:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadMessages();

    let isActive = true;

    const subscribeToChats = async () => {
      const channel = await subscribeToUserChats(
        (updatedChat) => {
          setChats((prev) => {
            const existing = prev.findIndex((c) => c.id === updatedChat.id);
            if (existing >= 0) {
              const updated = [...prev];
              updated[existing] = updatedChat;
              return updated.sort((a, b) => {
                const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
                const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
                return bTime - aTime;
              });
            }
            return [updatedChat, ...prev];
          });
        },
        (error) => console.error('[Messages] Chat subscription error:', error)
      );

      if (isActive) {
        chatChannelRef.current = channel;
      } else if (channel) {
        unsubscribeFromChannel(channel);
      }
    };

    subscribeToChats();

    return () => {
      isActive = false;
      if (chatChannelRef.current) {
        unsubscribeFromChannel(chatChannelRef.current);
        chatChannelRef.current = null;
      }
    };
  }, [loadMessages]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadMessages();
  }, [loadMessages]);

  const totalChatUnreadCount = chats.reduce((sum, chat) => sum + chat.unreadCount, 0);
  const totalUnreadCount = unreadCount + totalChatUnreadCount;

  const messageTagCounts = messages
    .filter((msg) => !msg.isSentByMe)
    .reduce<Record<string, number>>((acc, msg) => {
      const tags = Array.isArray(msg.tags) ? msg.tags : [];
      tags.forEach((tag) => {
        if (!tag) return;
        if (tag.trim().toLowerCase() === 'notification') return;
        acc[tag] = (acc[tag] || 0) + 1;
      });
      return acc;
    }, {});

  const activeTagValue = activeFilter.startsWith('tag:') ? activeFilter.slice(4) : null;

  const unifiedItems: UnifiedItem[] = [
    ...messages.filter((msg) => !msg.isSentByMe).map((msg): UnifiedItem => ({
      id: `msg-${msg.id}`,
      type: 'notification',
      title: msg.senderName,
      preview: replaceTemplateVariables(msg.subject || msg.preview, {
        placeName: msg.senderType === 'place' ? msg.senderName : undefined,
        customerFirstName: currentUserFirstName,
        communityCity: currentUserCommunity,
      }),
      timestamp: msg.sendAt || msg.createdAt,
      isUnread: !msg.isSentByMe && (msg.status === 'unread' || msg.status === 'published'),
      isSentByMe: msg.isSentByMe,
      message: msg,
    })),
    ...chats.map((chat): UnifiedItem => ({
      id: `chat-${chat.id}`,
      type: 'conversation',
      title: `${chat.otherParticipant.first_name} ${chat.otherParticipant.last_name}`,
      preview: chat.lastMessagePreview || 'Start a conversation',
      timestamp: chat.lastMessageAt || chat.createdAt,
      isUnread: chat.unreadCount > 0,
      chat: chat,
    })),
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const filteredItems = unifiedItems.filter((item) => {
    if (activeTagValue) {
      if (item.type !== 'notification') return false;
      const tags = item.message?.tags || [];
      return Array.isArray(tags) && tags.includes(activeTagValue);
    }
    if (activeFilter === 'unread' && !item.isUnread) return false;
    if (activeFilter === 'notifications' && item.type !== 'notification') return false;
    if (activeFilter === 'conversations' && item.type !== 'conversation') return false;
    return true;
  });

  const baseFilterTags: { key: FilterTag; label: string; count?: number }[] = [
    { key: 'all', label: 'All' },
    { key: 'unread', label: 'Unread', count: totalUnreadCount },
    { key: 'notifications', label: 'Notifications' },
    { key: 'conversations', label: 'Conversations' },
  ];
  const dynamicFilterTags = Object.entries(messageTagCounts)
    .filter(([, count]) => count > 0)
    .map(([tag, count]) => ({
      key: `tag:${tag}`,
      label: formatTagLabel(tag),
      count,
    }));
  const filterTags = [...baseFilterTags, ...dynamicFilterTags];

  const renderItem = (item: UnifiedItem, index: number, isLast: boolean) => {
    if (item.type === 'notification' && item.message) {
      const message = item.message;
      const isSent = item.isSentByMe;
      return (
        <TouchableOpacity
          key={item.id}
          style={[
            styles.itemCard,
            { backgroundColor: colors.card },
            item.isUnread && { backgroundColor: isDark ? colors.surfaceTertiary : '#fef2f2' },
            isLast && styles.itemCardLast,
          ]}
          onPress={() => onMessagePress?.(message.id)}
          activeOpacity={0.7}
        >
          <View style={styles.itemLeft}>
            <View style={[
              styles.iconContainer,
              { backgroundColor: isDark ? colors.surfaceTertiary : '#f5f5f5' },
              item.isUnread && { backgroundColor: isDark ? colors.card : '#fef2f2' },
            ]}>
              {isSent ? (
                <Send size={20} color="#6366f1" />
              ) : item.isUnread ? (
                <Mail size={20} color="#ec2227" />
              ) : (
                <MailOpen size={20} color={colors.textMuted} />
              )}
            </View>
            <View style={styles.itemContent}>
              <Text
                style={[styles.itemTitle, { color: colors.textSecondary }, item.isUnread && { fontFamily: fontFamily.bold, color: colors.text }]}
                numberOfLines={1}
              >
                {item.title}
              </Text>
              <Text
                style={[styles.itemPreview, { color: colors.textMuted }, item.isUnread && { color: colors.textSecondary, fontFamily: fontFamily.medium }]}
                numberOfLines={1}
              >
                {formatMessageDate(item.timestamp)}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      );
    }

    if (item.type === 'conversation' && item.chat) {
      const chat = item.chat;
      return (
        <TouchableOpacity
          key={item.id}
          style={[
            styles.itemCard,
            { backgroundColor: colors.card },
            item.isUnread && { backgroundColor: isDark ? colors.surfaceTertiary : '#fef2f2' },
            isLast && styles.itemCardLast,
          ]}
          onPress={() => onChatPress?.(chat.id)}
          activeOpacity={0.7}
        >
          <View style={styles.itemLeft}>
            <View style={{ width: 40, height: 40, marginRight: 12 }}>
              <View style={[StyleSheet.absoluteFill, styles.chatAvatar, styles.chatAvatarPlaceholder]}>
                <User size={20} color="#fff" />
              </View>
              {chat.otherParticipant.profile_picture_url && !chatAvatarErrors[chat.otherParticipant.id] && (
                <Image
                  source={{ uri: chat.otherParticipant.profile_picture_url }}
                  style={styles.chatAvatar}
                  onError={() =>
                    setChatAvatarErrors((prev) => ({
                      ...prev,
                      [chat.otherParticipant.id]: true,
                    }))
                  }
                />
              )}
            </View>
            <View style={styles.itemContent}>
              <Text
                style={[styles.itemTitle, { color: colors.textSecondary }, item.isUnread && { fontFamily: fontFamily.bold, color: colors.text }]}
                numberOfLines={1}
              >
                {item.title}
              </Text>
              <View style={styles.previewRow}>
                <Text
                  style={[styles.itemPreview, { color: colors.textMuted }, item.isUnread && { color: colors.textSecondary, fontFamily: fontFamily.medium }]}
                  numberOfLines={1}
                >
                  {formatMessageDate(item.timestamp)}
                </Text>
                {chat.unreadCount > 0 && (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadBadgeText}>
                      {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        </TouchableOpacity>
      );
    }

    return null;
  };

  return (
    <View style={[styles.container, { backgroundColor: isDark ? colors.background : colors.backgroundTertiary }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={onBack} style={styles.headerBackButton}>
          <ChevronLeft size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Inbox</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Filter Tags */}
      <View style={styles.filterContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScrollContent}
        >
          {filterTags.map((tag) => {
            const isActive = activeFilter === tag.key;
            return (
              <TouchableOpacity
                key={tag.key}
                style={[
                  styles.filterTag,
                  { backgroundColor: colors.card },
                  isActive && { backgroundColor: isDark ? '#fff' : '#000' },
                ]}
                onPress={() => setActiveFilter(tag.key)}
              >
                <Text style={[
                  styles.filterTagText,
                  { color: colors.text },
                  isActive && { color: isDark ? '#000' : '#fff', fontFamily: fontFamily.semiBold },
                ]}>
                  {tag.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.textMuted} />
        </View>
      ) : (
        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={filteredItems.length === 0 ? styles.emptyScrollContent : undefined}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textMuted} />
          }
        >
          {filteredItems.length === 0 ? (
            <View style={styles.emptyContainer}>
              {activeFilter === 'unread' ? (
                <>
                  <MailOpen size={64} color={colors.textMuted} />
                  <Text style={[styles.emptyTitle, { color: colors.text }]}>All caught up!</Text>
                  <Text style={[styles.emptyText, { color: colors.textSecondary }]}>You have no unread messages</Text>
                </>
              ) : activeFilter === 'notifications' ? (
                <>
                  <Bell size={64} color={colors.textMuted} />
                  <Text style={[styles.emptyTitle, { color: colors.text }]}>No notifications yet</Text>
                  <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Messages from restaurants and {PLATFORM_NAME} will appear here</Text>
                </>
              ) : activeFilter === 'conversations' ? (
                <>
                  <MessagesSquare size={64} color={colors.textMuted} />
                  <Text style={[styles.emptyTitle, { color: colors.text }]}>No conversations yet</Text>
                  <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Start a conversation with other users</Text>
                </>
              ) : (
                <>
                  <MailX size={64} color={colors.textMuted} />
                  <Text style={[styles.emptyTitle, { color: colors.text }]}>No messages yet</Text>
                  <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Messages and conversations will appear here</Text>
                </>
              )}
            </View>
          ) : (
            <View style={styles.itemsContainer}>
              {filteredItems.map((item, index) =>
                renderItem(item, index, index === filteredItems.length - 1)
              )}
            </View>
          )}

          <View style={{ height: 100 }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerProfileImage: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fontFamily.bold,
    fontSize: 18,
  },
  filterContainer: {
    paddingBottom: 4,
  },
  filterScrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  filterTag: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  filterTagText: {
    fontFamily: fontFamily.medium,
    fontSize: 14,
  },
  content: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 60,
  },
  emptyTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
    marginTop: 16,
  },
  emptyText: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  itemsContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 6, elevation: 3,
  },
  itemCardLast: {
    marginBottom: 0,
  },
  itemLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  itemContent: {
    flex: 1,
  },
  itemTitle: {
    fontFamily: fontFamily.regular,
    fontSize: 15,
    marginBottom: 4,
  },
  itemPreview: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chatAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  chatAvatarPlaceholder: {
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  unreadBadge: {
    backgroundColor: '#ec2227',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
    marginLeft: 8,
  },
  unreadBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontFamily: fontFamily.bold,
  },
});
