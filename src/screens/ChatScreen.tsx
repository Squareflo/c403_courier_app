import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
  StyleSheet,
  Alert,
  AppState,
  AppStateStatus,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ArrowLeft, User, Camera, CheckCheck } from 'lucide-react-native';
import { RealtimeChannel } from '@supabase/supabase-js';
import * as ImagePicker from 'expo-image-picker';
import {
  getChatById,
  getChatMessages,
  sendChatMessage,
  markChatMessagesAsRead,
  subscribeToChatMessages,
  unsubscribeFromChannel,
  formatChatMessageTime,
  FormattedChat,
  FormattedChatMessage,
  sendTypingIndicator,
  subscribeToTypingIndicator,
} from '../services/chat';
import { uploadImageToCloudinary } from '../services/cloudinary';
import { fontFamily } from '../constants/typography';
import { getCurrentUserId } from '../services/auth';
import { useTheme } from '../contexts/ThemeContext';

const PRIMARY_COLOR = '#ec2227';

interface ChatScreenProps {
  chatId: string;
  onBack: () => void;
}

export function ChatScreen({ chatId, onBack }: ChatScreenProps) {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  const [chat, setChat] = useState<FormattedChat | null>(null);
  const [messages, setMessages] = useState<FormattedChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [avatarError, setAvatarError] = useState(false);

  const flatListRef = useRef<FlatList>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const typingChannelRef = useRef<RealtimeChannel | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!chatId) return;
    async function loadChat() {
      setLoading(true);
      const [chatData, messagesData] = await Promise.all([
        getChatById(chatId),
        getChatMessages(chatId, 50),
      ]);
      setChat(chatData);
      setMessages(messagesData);
      setHasMore(messagesData.length === 50);
      setLoading(false);
      if (chatData) markChatMessagesAsRead(chatId);
    }
    loadChat();
  }, [chatId]);

  useEffect(() => {
    if (!chatId) return;

    channelRef.current = subscribeToChatMessages(
      chatId,
      (newMessage) => {
        setMessages((prev) => {
          const idx = prev.findIndex((m) => m.id === newMessage.id);
          if (idx >= 0) {
            const updated = [...prev];
            updated[idx] = { ...updated[idx], ...newMessage };
            return updated;
          }
          return [...prev, newMessage];
        });
        if (!newMessage.isOwn) markChatMessagesAsRead(chatId);
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
      },
      (error) => console.error('[ChatScreen] Real-time error:', error)
    );

    typingChannelRef.current = subscribeToTypingIndicator(
      chatId,
      (isTyping, typingUserId) => {
        getCurrentUserId().then((currentId) => {
          if (typingUserId !== currentId) setIsOtherTyping(isTyping);
        });
      }
    );

    return () => {
      if (channelRef.current) unsubscribeFromChannel(channelRef.current);
      if (typingChannelRef.current) unsubscribeFromChannel(typingChannelRef.current);
    };
  }, [chatId]);

  const handleTyping = useCallback((text: string) => {
    setInputText(text);
    if (chatId && text.length > 0) {
      sendTypingIndicator(chatId, true);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => sendTypingIndicator(chatId, false), 2000);
    }
  }, [chatId]);

  const loadMoreMessages = useCallback(async () => {
    if (loadingMore || !hasMore || messages.length === 0) return;
    setLoadingMore(true);
    const oldest = messages[0];
    const older = await getChatMessages(chatId, 50, oldest.createdAt);
    if (older.length < 50) setHasMore(false);
    if (older.length > 0) setMessages((prev) => [...older, ...prev]);
    setLoadingMore(false);
  }, [chatId, messages, loadingMore, hasMore]);

  const handleSend = async () => {
    if (!inputText.trim() || !chat || sending) return;
    const text = inputText.trim();
    setInputText('');
    setSending(true);
    sendTypingIndicator(chatId, false);

    const newMsg = await sendChatMessage(chatId, chat.otherParticipant.id, text);
    if (newMsg) {
      setMessages((prev) => prev.some((m) => m.id === newMsg.id) ? prev : [...prev, newMsg]);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
    setSending(false);
  };

  const handleImagePick = async () => {
    Alert.alert('Send Photo', 'Choose a source', [
      {
        text: 'Camera',
        onPress: async () => {
          const perm = await ImagePicker.requestCameraPermissionsAsync();
          if (!perm.granted) { Alert.alert('Permission Required', 'Camera access needed.'); return; }
          const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.8 });
          if (!result.canceled && result.assets[0]) uploadAndSendImage(result.assets[0].uri);
        },
      },
      {
        text: 'Photo Library',
        onPress: async () => {
          const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!perm.granted) { Alert.alert('Permission Required', 'Photo library access needed.'); return; }
          const result = await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, quality: 0.8 });
          if (!result.canceled && result.assets[0]) uploadAndSendImage(result.assets[0].uri);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const uploadAndSendImage = async (uri: string) => {
    if (!chat) return;
    setUploadingImage(true);
    try {
      const uploadResult = await uploadImageToCloudinary(uri);
      if (uploadResult) {
        const newMsg = await sendChatMessage(chatId, chat.otherParticipant.id, '\ud83d\udcf7 Image', 'image', uploadResult.secure_url);
        if (newMsg) {
          setMessages((prev) => [...prev, newMsg]);
          setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
        }
      }
    } catch (error) {
      Alert.alert('Upload Failed', 'Please try again.');
    } finally {
      setUploadingImage(false);
    }
  };

  const renderReceipt = (msg: FormattedChatMessage) => {
    if (!msg.isOwn) return null;
    return <CheckCheck size={14} color={msg.isRead ? PRIMARY_COLOR : colors.textMuted} />;
  };

  const renderMessage = ({ item }: { item: FormattedChatMessage }) => {
    const isOwn = item.isOwn;
    return (
      <View style={[styles.bubbleContainer, isOwn ? styles.ownMessage : styles.otherMessage]}>
        <View style={[
          styles.bubble,
          isOwn ? [styles.ownBubble, { backgroundColor: isDark ? '#fff' : '#000' }]
                : [styles.otherBubble, { backgroundColor: colors.card }],
        ]}>
          {item.messageType === 'image' && item.mediaUrl && (
            <Image source={{ uri: item.mediaUrl }} style={styles.msgImage} resizeMode="cover" />
          )}
          {item.message !== '\ud83d\udcf7 Image' && (
            <Text style={[styles.msgText, isOwn ? { color: isDark ? '#000' : '#fff' } : { color: colors.text }]}>
              {item.message}
            </Text>
          )}
        </View>
        <View style={[styles.metaRow, isOwn && styles.ownMetaRow]}>
          <Text style={[styles.msgTime, { color: colors.textMuted }]}>{formatChatMessageTime(item.createdAt)}</Text>
          {renderReceipt(item)}
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: insets.top, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onBack} style={styles.backBtn}><ArrowLeft size={24} color={colors.text} /></TouchableOpacity>
          <Text style={[styles.headerName, { color: colors.text }]}>Chat</Text>
        </View>
        <View style={styles.centerContent}><ActivityIndicator size="large" color={colors.textMuted} /></View>
      </View>
    );
  }

  if (!chat) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: insets.top, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onBack} style={styles.backBtn}><ArrowLeft size={24} color={colors.text} /></TouchableOpacity>
          <Text style={[styles.headerName, { color: colors.text }]}>Chat not found</Text>
        </View>
        <View style={styles.centerContent}>
          <Text style={{ color: colors.textMuted, fontSize: 16 }}>This chat could not be loaded.</Text>
          <TouchableOpacity onPress={onBack} style={styles.goBackBtn}><Text style={styles.goBackText}>Go Back</Text></TouchableOpacity>
        </View>
      </View>
    );
  }

  const participant = chat.otherParticipant;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <ArrowLeft size={24} color={colors.text} />
        </TouchableOpacity>
        {participant.profile_picture_url && !avatarError ? (
          <Image source={{ uri: participant.profile_picture_url }} style={styles.headerAvatar} onError={() => setAvatarError(true)} />
        ) : (
          <View style={[styles.headerAvatarPlaceholder, { backgroundColor: colors.textMuted }]}><User size={20} color="#fff" /></View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerName, { color: colors.text }]}>{participant.first_name} {participant.last_name}</Text>
          <Text style={[styles.headerStatus, { color: colors.textMuted }]}>{participant.is_online ? 'Online' : 'Offline'}</Text>
        </View>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }} keyboardVerticalOffset={0}>
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messagesList}
          ListHeaderComponent={loadingMore ? <ActivityIndicator size="small" color={PRIMARY_COLOR} style={{ paddingVertical: 8 }} /> : null}
          ListFooterComponent={isOtherTyping ? (
            <View style={{ paddingVertical: 8, paddingHorizontal: 4 }}>
              <Text style={[styles.typingText, { color: colors.textMuted }]}>{participant.first_name} is typing...</Text>
            </View>
          ) : null}
          ListEmptyComponent={
            <View style={styles.emptyList}>
              <Text style={[{ color: colors.textMuted, fontSize: 15, textAlign: 'center' }]}>No messages yet.{'\n'}Start the conversation!</Text>
            </View>
          }
          onContentSizeChange={() => { if (messages.length > 0) flatListRef.current?.scrollToEnd({ animated: false }); }}
        />

        {/* Input */}
        <View style={[styles.inputContainer, { paddingBottom: insets.bottom + 8, backgroundColor: colors.card, borderTopColor: colors.border }]}>
          <TouchableOpacity onPress={handleImagePick} disabled={uploadingImage} style={styles.cameraBtn}>
            {uploadingImage ? <ActivityIndicator size="small" color={PRIMARY_COLOR} /> : <Camera size={24} color={colors.textMuted} />}
          </TouchableOpacity>
          <View style={[styles.inputWrapper, { backgroundColor: isDark ? colors.surfaceTertiary : '#F5F5F5' }]}>
            <TextInput value={inputText} onChangeText={handleTyping} placeholder="Type a message..." placeholderTextColor={colors.textMuted} style={[styles.input, { color: colors.text }]} multiline />
          </View>
          <TouchableOpacity onPress={handleSend} disabled={!inputText.trim() || sending} style={[styles.sendBtn, inputText.trim() ? styles.sendBtnActive : { backgroundColor: isDark ? colors.surfaceTertiary : '#E5E5E5' }]}>
            {sending ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={18} color={inputText.trim() ? '#fff' : colors.textMuted} />}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centerContent: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  header: { borderBottomWidth: 1, paddingHorizontal: 16, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn: { padding: 4 },
  headerAvatar: { width: 40, height: 40, borderRadius: 20 },
  headerAvatarPlaceholder: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  headerName: { fontSize: 16, fontFamily: fontFamily.semiBold },
  headerStatus: { fontSize: 12, marginTop: 2, fontFamily: fontFamily.regular },
  goBackBtn: { marginTop: 24, backgroundColor: PRIMARY_COLOR, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24 },
  goBackText: { color: '#fff', fontFamily: fontFamily.semiBold, fontSize: 15 },
  messagesList: { padding: 16, flexGrow: 1 },
  emptyList: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bubbleContainer: { maxWidth: '80%', marginBottom: 8 },
  ownMessage: { alignSelf: 'flex-end' },
  otherMessage: { alignSelf: 'flex-start' },
  bubble: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20 },
  ownBubble: { borderBottomRightRadius: 6 },
  otherBubble: { borderBottomLeftRadius: 6 },
  msgText: { fontSize: 15, lineHeight: 20 },
  msgImage: { width: 200, height: 200, borderRadius: 12, marginBottom: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, marginLeft: 4, gap: 4 },
  ownMetaRow: { justifyContent: 'flex-end', marginRight: 4, marginLeft: 0 },
  msgTime: { fontSize: 11 },
  typingText: { fontSize: 12, fontFamily: fontFamily.regular },
  inputContainer: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1, flexDirection: 'row', alignItems: 'flex-end' },
  cameraBtn: { padding: 8, marginRight: 8, marginBottom: 4 },
  inputWrapper: { flex: 1, borderRadius: 24, paddingHorizontal: 16, paddingVertical: 10, minHeight: 44, maxHeight: 120, justifyContent: 'center' },
  input: { fontSize: 15, maxHeight: 100, paddingTop: 0, paddingBottom: 0 },
  sendBtn: { padding: 10, marginLeft: 8, borderRadius: 22, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  sendBtnActive: { backgroundColor: PRIMARY_COLOR },
});
