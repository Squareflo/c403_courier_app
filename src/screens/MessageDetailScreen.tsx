import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Store, User, Bell } from 'lucide-react-native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { fontFamily } from '../constants/typography';
import { spacing } from '../constants/spacing';
import { supabase } from '../lib/supabase';
import { getCurrentUser } from '../services/auth';
import {
  getMessageById,
  markMessageAsRead,
  deleteMessage,
  type FormattedMessage,
} from '../services/messages';

function replaceTemplateVariables(
  content: string,
  variables: { placeName?: string | null; customerFirstName?: string | null; communityCity?: string | null }
): string {
  let processed = content;
  if (variables.placeName) processed = processed.replace(/{{place_name}}/gi, variables.placeName);
  if (variables.customerFirstName) processed = processed.replace(/{{customer_first_name}}/gi, variables.customerFirstName);
  if (variables.communityCity) processed = processed.replace(/{{community_city}}/gi, variables.communityCity);
  return processed;
}

function formatTimeAgo(dateStr: string): string {
  const now = new Date();
  const d = new Date(dateStr);
  const diffMs = now.getTime() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return mins + ' min ago';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'h ago';
  const days = Math.floor(hrs / 24);
  if (days < 30) return days + 'd ago';
  return Math.floor(days / 30) + 'mo ago';
}

interface MessageDetailScreenProps {
  messageId: string;
  onBack: () => void;
}

export function MessageDetailScreen({ messageId, onBack }: MessageDetailScreenProps) {
  const { courier } = useAuth();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<FormattedMessage | null>(null);
  const [currentUserFirstName, setCurrentUserFirstName] = useState<string | null>(null);
  const [currentUserCommunity, setCurrentUserCommunity] = useState<string | null>(null);
  const [imageLoadError, setImageLoadError] = useState(false);

  useEffect(() => {
    loadMessage();
  }, [messageId]);

  const loadMessage = async () => {
    try {
      setLoading(true);
      const messageData = await getMessageById(messageId);
      if (!messageData) { onBack(); return; }

      setMessage(messageData);
      setImageLoadError(false);

      const currentUser = await getCurrentUser();
      if (currentUser) {
        setCurrentUserFirstName(currentUser.first_name || null);
        if (currentUser.community_id) {
          const { data: community } = await supabase
            .from('community').select('name').eq('id', currentUser.community_id).single();
          if (community) setCurrentUserCommunity(community.name);
        }
      }

      if (messageData.status === 'unread' || messageData.status === 'published') {
        await markMessageAsRead(messageId);
        setMessage(prev => prev ? { ...prev, status: 'read', readAt: new Date().toISOString() } : null);
      }
    } catch (error) {
      console.error('[MessageDetail] Error:', error);
      onBack();
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    Alert.alert('Delete Message', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          const success = await deleteMessage(messageId);
          if (success) onBack();
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: isDark ? colors.background : colors.backgroundTertiary }]}>
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={onBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <ArrowLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Message</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.textMuted} />
        </View>
      </View>
    );
  }

  if (!message) return null;

  const templateVars = {
    placeName: message.senderType === 'place' ? message.senderName : undefined,
    customerFirstName: currentUserFirstName,
    communityCity: currentUserCommunity,
  };

  const mainHeading = message.mainHeading ? replaceTemplateVariables(message.mainHeading, templateVars) : null;
  const introText = message.introText ? replaceTemplateVariables(message.introText, templateVars) : null;
  const bodyText = message.bodyText ? replaceTemplateVariables(message.bodyText, templateVars) : null;
  const hasImage = Boolean(message.imageUrl && !imageLoadError);

  const daysUntilAutoDelete = (() => {
    const sentAt = new Date(message.createdAt);
    const now = new Date();
    const daysSince = Math.floor((now.getTime() - sentAt.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, 14 - daysSince);
  })();

  return (
    <View style={[styles.container, { backgroundColor: isDark ? colors.background : colors.backgroundTertiary }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={onBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <ArrowLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
          Message #{messageId.split('-')[0].toUpperCase()}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.messageCard, { backgroundColor: colors.card }]}>
          {/* Sender */}
          <View style={styles.senderRow}>
            <View style={[styles.senderIcon, { backgroundColor: isDark ? colors.surfaceTertiary : '#f2f2f2' }]}>
              {message.senderType === 'place' ? <Store size={18} color={colors.textMuted} /> : <Bell size={18} color={colors.textMuted} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.senderName, { color: colors.text }]}>{message.senderName}</Text>
              <Text style={[styles.senderDate, { color: colors.textMuted }]}>{formatTimeAgo(message.createdAt)}</Text>
            </View>
          </View>

          {/* Image */}
          {hasImage && (
            <Image
              source={{ uri: message.imageUrl as string }}
              style={styles.messageImage}
              resizeMode="cover"
              onError={() => setImageLoadError(true)}
            />
          )}

          {/* Content */}
          {mainHeading && <Text style={[styles.mainHeading, { color: colors.text }]}>{mainHeading}</Text>}
          {introText && <Text style={[styles.introText, { color: colors.textSecondary }]}>{introText}</Text>}
          {bodyText && <Text style={[styles.bodyText, { color: colors.textSecondary }]}>{bodyText}</Text>}

          {/* Fallback plain text */}
          {!mainHeading && !introText && !bodyText && (
            <Text style={[styles.bodyText, { color: colors.textSecondary }]}>
              {replaceTemplateVariables(message.message || '', templateVars)}
            </Text>
          )}

          {/* Action button */}
          {message.buttonType && message.buttonLinkId && (
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => {
                const link = message.buttonLinkId || '';
                if (link.startsWith('http')) Linking.openURL(link);
              }}
            >
              <Text style={styles.actionButtonText}>Learn More</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Actions */}
        <View style={styles.actionsSection}>
          <Text style={[styles.actionsText, { color: colors.textMuted }]}>
            This message will automatically get deleted in {daysUntilAutoDelete} days.
          </Text>
          <TouchableOpacity onPress={handleDelete}>
            <Text style={[styles.actionLink, { color: colors.text }]}>Delete Message</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12,
  },
  headerTitle: {
    flex: 1, textAlign: 'center', fontFamily: fontFamily.bold, fontSize: 18,
  },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },
  messageCard: { borderRadius: 16, padding: 16, gap: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 6, elevation: 3 },
  senderRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  senderIcon: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
  },
  senderName: { fontFamily: fontFamily.semiBold, fontSize: 16 },
  senderDate: { fontFamily: fontFamily.regular, fontSize: 13, marginTop: 2 },
  messageImage: {
    width: '100%', aspectRatio: 1, borderRadius: 12,
  },
  mainHeading: { fontFamily: fontFamily.semiBold, fontSize: 16, lineHeight: 22 },
  introText: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 22 },
  bodyText: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 22 },
  actionButton: {
    backgroundColor: '#000', borderRadius: 999, paddingVertical: 14, alignItems: 'center', marginTop: 4,
  },
  actionButtonText: { color: '#fff', fontFamily: fontFamily.bold, fontSize: 15 },
  actionsSection: { marginTop: 20, alignItems: 'center', gap: 12 },
  actionsText: { fontFamily: fontFamily.regular, fontSize: 13, textAlign: 'center' },
  actionLink: { fontFamily: fontFamily.semiBold, fontSize: 14, textDecorationLine: 'underline' },
});
