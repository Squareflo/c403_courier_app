import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ImageBackground,
  Image,
  Platform,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../contexts/ThemeContext';
import { useButtonFeedback } from '../hooks/useButtonFeedback';
import { useAuth } from '../contexts/AuthContext';
import { BottomNav, type TabId } from '../components/BottomNav';
import { DashboardScreen } from './DashboardScreen';
import { DeliveriesScreen } from './DeliveriesScreen';
import { MyWalletScreen, StripeConnectScreen } from './MyWalletScreen';
import { PointsScreen } from './PointsScreen';
import { MessagesScreen } from './MessagesScreen';
import { MessageDetailScreen } from './MessageDetailScreen';
import { ChatScreen } from './ChatScreen';
import { OnlineScreen } from './OnlineScreen';
import { OpenOfferScreen } from './OpenOfferScreen';
import { ActiveDeliveryScreen } from './ActiveDeliveryScreen';
import { ReviewsScreen } from './ReviewsScreen';
import { ReferralsScreen } from './ReferralsScreen';
import { CateringScreen } from './CateringScreen';
import { MyProfileScreen } from './MyProfileScreen';
import { fontFamily } from '../constants/typography';
import { supabase } from '../lib/supabase';

// Notification sound for exclusive offers (hosted on Cloudinary)
const EXCLUSIVE_OFFER_SOUND_URL = 'https://res.cloudinary.com/chowlocal/video/upload/v1772028075/exclusive-offer-sound-loud_oyvoy7.wav';

// Exclusive offer splash screen assets
const EXCLUSIVE_BG_URL = 'https://res.cloudinary.com/chowlocal/image/upload/v1772029081/new-offer-background-colr_c46ofv.jpg';
const EXCLUSIVE_ICON_URL = 'https://res.cloudinary.com/chowlocal/image/upload/v1772028968/Untitled_design_vmrzsj.png';

// How often to poll the DB for is_online status (ms)
const ONLINE_STATUS_POLL_INTERVAL = 15000;

/**
 * MainLayout handles post-auth navigation with a bottom tab bar.
 *
 * EXCLUSIVE OFFER TAKEOVER:
 * 1. Splash screen with looping notification sound
 * 2. Courier taps "OPEN" to view offer details
 * 3. OpenOfferScreen forced with no back -- accept, reject, or expiry only
 */
export function MainLayout() {
  const { colors } = useTheme();
  const { tapFeedback } = useButtonFeedback();
  const { signOut, courier, refreshCourier } = useAuth();

  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [isOnline, setIsOnline] = useState(false);

  // Open offer navigation state
  const [selectedOffer, setSelectedOffer] = useState<{
    id: string;
    type: 'open' | 'exclusive';
  } | null>(null);

  // Active delivery navigation state (for online mode)
  const [activeDeliveryId, setActiveDeliveryId] = useState<string | null>(null);

  // Viewing completed delivery from dashboard (offline mode)
  const [viewingDeliveryId, setViewingDeliveryId] = useState<string | null>(null);
  const [viewingMessageId, setViewingMessageId] = useState<string | null>(null);
  const [viewingChatId, setViewingChatId] = useState<string | null>(null);
  const [lastReadMessageId, setLastReadMessageId] = useState<string | null>(null);
  const [lastReadChatId, setLastReadChatId] = useState<string | null>(null);

  // Forced exclusive offer state -- takes over entire app
  const [forcedExclusiveOffer, setForcedExclusiveOffer] = useState<{
    deliveryRequestId: string;
    offerId: string;
    expiresAt: string | null;
  } | null>(null);

  // Whether the courier has tapped "OPEN" on the splash screen
  const [exclusiveSplashDismissed, setExclusiveSplashDismissed] = useState(false);

  // Sound ref to allow cleanup
  const soundRef = useRef<Audio.Sound | null>(null);

  // Track which offer ID we already triggered for (prevent re-triggers)
  const lastTriggeredOfferIdRef = useRef<string | null>(null);

  // Polling ref for is_online status
  const onlineStatusPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Conditionally hide stripe-express tab if courier has no stripe_account_id
  const hiddenTabs: TabId[] = courier?.stripe_account_id ? [] : ['stripe-express'];

  // Set audio mode ONCE on mount
  useEffect(() => {
    Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      interruptionModeIOS: InterruptionModeIOS.MixWithOthers,
      interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
      shouldDuckAndroid: false,
      playThroughEarpieceAndroid: false,
    }).catch((err: any) => console.warn('[MainLayout] Audio mode setup error:', err));
  }, []);

  // Poll is_online status from DB
  useEffect(() => {
    if (!courier?.id) return;

    const checkOnlineStatus = async () => {
      try {
        const { data, error } = await supabase
          .from('courier')
          .select('is_online')
          .eq('id', courier.id)
          .single();

        if (error) {
          console.warn('[MainLayout] Error polling is_online:', error);
          return;
        }

        if (data) {
          const dbIsOnline = data.is_online === true;
          if (!dbIsOnline && isOnline) {
            console.log('[MainLayout] DB says offline -- syncing local state to offline');
            setIsOnline(false);
            setSelectedOffer(null);
            setActiveDeliveryId(null);
            setActiveTab('dashboard');
            refreshCourier();
          }
          if (dbIsOnline && !isOnline) {
            console.log('[MainLayout] DB says online -- syncing local state to online');
            setIsOnline(true);
            refreshCourier();
          }
        }
      } catch (err) {
        console.warn('[MainLayout] Error in online status poll:', err);
      }
    };

    checkOnlineStatus();
    onlineStatusPollRef.current = setInterval(checkOnlineStatus, ONLINE_STATUS_POLL_INTERVAL);

    return () => {
      if (onlineStatusPollRef.current) {
        clearInterval(onlineStatusPollRef.current);
        onlineStatusPollRef.current = null;
      }
    };
  }, [courier?.id, isOnline, refreshCourier]);

  // Play exclusive offer notification sound (looping)
  const playExclusiveOfferSound = useCallback(async () => {
    try {
      console.log('[MainLayout] Playing exclusive offer sound...');
      if (soundRef.current) {
        try {
          await soundRef.current.stopAsync();
          await soundRef.current.unloadAsync();
        } catch {}
        soundRef.current = null;
      }
      console.log('[MainLayout] Loading sound from:', EXCLUSIVE_OFFER_SOUND_URL);
      const { sound, status } = await Audio.Sound.createAsync(
        { uri: EXCLUSIVE_OFFER_SOUND_URL },
        { shouldPlay: true, volume: 1.0, isLooping: true },
      );
      console.log('[MainLayout] Sound loaded, looping, status:', JSON.stringify(status));
      soundRef.current = sound;
    } catch (err) {
      console.error('[MainLayout] Could not play exclusive offer sound:', err);
    }
  }, []);

  // Stop the looping sound
  const stopExclusiveOfferSound = useCallback(async () => {
    if (soundRef.current) {
      try {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
        console.log('[MainLayout] Sound stopped and unloaded');
      } catch {}
      soundRef.current = null;
    }
  }, []);

  // Cleanup sound on unmount
  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.stopAsync().catch(() => {});
        soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
      }
    };
  }, []);

  // Check for pending exclusive offers
  const checkForExclusiveOffer = useCallback(async () => {
    if (!courier?.id) return;
    try {
      const { data, error } = await supabase
        .from('delivery_offer')
        .select('id, delivery_request_id, type, status, courier_id, expires_at')
        .eq('courier_id', courier.id)
        .eq('type', 'exclusive')
        .eq('status', 'pending')
        .order('offered_at', { ascending: false })
        .limit(1);

      if (error) { console.error('[MainLayout] Error checking exclusive offers:', error); return; }

      if (data && data.length > 0) {
        const offer = data[0];
        if (offer.expires_at) {
          const expiresAt = new Date(offer.expires_at);
          const now = new Date();
          if (expiresAt.getTime() <= now.getTime()) {
            setForcedExclusiveOffer(null);
            setExclusiveSplashDismissed(false);
            stopExclusiveOfferSound();
            return;
          }
        }
        console.log('[MainLayout] Found pending exclusive offer:', offer.id);
        if (lastTriggeredOfferIdRef.current !== offer.id) {
          lastTriggeredOfferIdRef.current = offer.id;
          setExclusiveSplashDismissed(false);
          playExclusiveOfferSound();
        }
        setForcedExclusiveOffer({
          deliveryRequestId: offer.delivery_request_id,
          offerId: offer.id,
          expiresAt: offer.expires_at,
        });
      } else {
        setForcedExclusiveOffer(null);
        setExclusiveSplashDismissed(false);
        stopExclusiveOfferSound();
      }
    } catch (err) { console.error('[MainLayout] Error checking exclusive offers:', err); }
  }, [courier?.id, playExclusiveOfferSound, stopExclusiveOfferSound]);

  useEffect(() => { checkForExclusiveOffer(); }, [checkForExclusiveOffer]);

  // Realtime subscription for delivery_offer changes
  useEffect(() => {
    if (!courier?.id) return;
    const subscription = supabase
      .channel(`exclusive-offer-watch-${courier.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'delivery_offer' },
        (payload: any) => {
          console.log('[MainLayout] delivery_offer realtime event:', payload.eventType);
          if (
            payload.eventType === 'INSERT' &&
            payload.new.type === 'exclusive' &&
            payload.new.courier_id === courier.id &&
            payload.new.status === 'pending'
          ) {
            console.log('[MainLayout] New exclusive offer detected -- forcing splash');
            lastTriggeredOfferIdRef.current = payload.new.id;
            setExclusiveSplashDismissed(false);
            playExclusiveOfferSound();
            setForcedExclusiveOffer({
              deliveryRequestId: payload.new.delivery_request_id,
              offerId: payload.new.id,
              expiresAt: payload.new.expires_at,
            });
          }
        }
      )
      .subscribe((status: string) => {
        console.log('[MainLayout] Exclusive offer subscription:', status);
      });
    return () => { subscription.unsubscribe(); };
  }, [courier?.id, playExclusiveOfferSound, stopExclusiveOfferSound]);

  const handleTabPress = (tab: TabId) => { console.log('[MainLayout] Tab pressed:', tab); setActiveTab(tab); };
  const handleWentOnline = () => { setIsOnline(true); };
  const handleWentOffline = () => {
    setIsOnline(false);
    setSelectedOffer(null);
    setActiveDeliveryId(null);
    setActiveTab('dashboard');
  };

  const handleOfferResolved = useCallback(async (acceptedDeliveryId?: string) => {
    setSelectedOffer(null);
    if (!acceptedDeliveryId || !courier?.id) return;
    try {
      const { data: otherDeliveries, error } = await supabase
        .from('delivery_request')
        .select('id')
        .eq('courier_id', courier.id)
        .in('status', ['accepted_by_courier', 'arrived_at_pickup', 'en_route', 'arrived_at_dropoff'])
        .neq('id', acceptedDeliveryId);

      if (error) { console.error('[MainLayout] Error checking other deliveries:', error); setActiveDeliveryId(acceptedDeliveryId); return; }
      const otherCount = otherDeliveries?.length || 0;
      console.log('[MainLayout] Post-accept routing: other active deliveries =', otherCount);
      if (otherCount === 0) setActiveDeliveryId(acceptedDeliveryId);
      else if (otherCount === 1) setActiveDeliveryId(otherDeliveries![0].id);
    } catch (err) { console.error('[MainLayout] Error in post-accept routing:', err); setActiveDeliveryId(acceptedDeliveryId); }
  }, [courier?.id]);

  const handleExclusiveResolved = useCallback(async (acceptedDeliveryId?: string) => {
    setForcedExclusiveOffer(null);
    setExclusiveSplashDismissed(false);
    stopExclusiveOfferSound();
    if (acceptedDeliveryId && courier?.id) {
      try {
        const { data: otherDeliveries, error } = await supabase
          .from('delivery_request')
          .select('id')
          .eq('courier_id', courier.id)
          .in('status', ['accepted_by_courier', 'arrived_at_pickup', 'en_route', 'arrived_at_dropoff'])
          .neq('id', acceptedDeliveryId);

        if (error) { setActiveDeliveryId(acceptedDeliveryId); checkForExclusiveOffer(); return; }
        const otherCount = otherDeliveries?.length || 0;
        console.log('[MainLayout] Post-exclusive-accept routing: other active deliveries =', otherCount);
        if (otherCount === 0) setActiveDeliveryId(acceptedDeliveryId);
        else if (otherCount === 1) setActiveDeliveryId(otherDeliveries![0].id);
      } catch (err) { console.error('[MainLayout] Error in exclusive post-accept routing:', err); setActiveDeliveryId(acceptedDeliveryId); }
    }
    checkForExclusiveOffer();
  }, [courier?.id, stopExclusiveOfferSound, checkForExclusiveOffer]);

  const handleOpenExclusiveOffer = () => { tapFeedback(); stopExclusiveOfferSound(); setExclusiveSplashDismissed(true); };
  const handleDashboardDeliveryPress = (deliveryId: string) => { setViewingDeliveryId(deliveryId); };

  // FORCED EXCLUSIVE OFFER -- takes priority over EVERYTHING
  if (forcedExclusiveOffer) {
    if (!exclusiveSplashDismissed) {
      return (
        <SafeAreaProvider>
          <ExclusiveOfferSplash expiresAt={forcedExclusiveOffer.expiresAt} onOpen={handleOpenExclusiveOffer} onExpired={handleExclusiveResolved} />
        </SafeAreaProvider>
      );
    }
    return (
      <SafeAreaProvider>
        <View style={[styles.root, { backgroundColor: colors.background }]}>
          <OpenOfferScreen deliveryRequestId={forcedExclusiveOffer.deliveryRequestId} offerType="exclusive" isForced onBack={() => handleExclusiveResolved()} onOfferResolved={handleExclusiveResolved} />
        </View>
      </SafeAreaProvider>
    );
  }

  // VIEWING COMPLETED DELIVERY FROM DASHBOARD (offline mode)
  if (viewingDeliveryId) {
    return (
      <SafeAreaProvider>
        <View style={[styles.root, { backgroundColor: colors.background }]}>
          <ActiveDeliveryScreen deliveryRequestId={viewingDeliveryId} onBack={() => setViewingDeliveryId(null)} onDeliveryCompleted={() => setViewingDeliveryId(null)} />
        </View>
      </SafeAreaProvider>
    );
  }

  // If online, show OnlineScreen, OpenOfferScreen, or ActiveDeliveryScreen
  if (isOnline || courier?.is_online) {
    if (selectedOffer) {
      return (
        <SafeAreaProvider>
          <View style={[styles.root, { backgroundColor: colors.background }]}>
            <OpenOfferScreen deliveryRequestId={selectedOffer.id} offerType={selectedOffer.type} onBack={() => setSelectedOffer(null)} onOfferResolved={handleOfferResolved} />
          </View>
        </SafeAreaProvider>
      );
    }
    if (activeDeliveryId) {
      return (
        <SafeAreaProvider>
          <View style={[styles.root, { backgroundColor: colors.background }]}>
            <ActiveDeliveryScreen deliveryRequestId={activeDeliveryId} onBack={() => setActiveDeliveryId(null)} onDeliveryCompleted={() => { setActiveDeliveryId(null); }} onOfferPress={(id: string, type: 'open' | 'exclusive') => setSelectedOffer({ id, type })} />
          </View>
        </SafeAreaProvider>
      );
    }
    return (
      <SafeAreaProvider>
        <View style={[styles.root, { backgroundColor: colors.background }]}>
          <OnlineScreen onGoOffline={handleWentOffline} onOfferPress={(id: string, type: 'open' | 'exclusive') => setSelectedOffer({ id, type })} onAcceptedDeliveryPress={(id: string) => setActiveDeliveryId(id)} />
        </View>
      </SafeAreaProvider>
    );
  }

  // Offline: Main tab screens with bottom nav
  const renderScreen = () => {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardScreen onWentOnline={handleWentOnline} onDeliveryPress={handleDashboardDeliveryPress} />;
      case 'deliveries':
        return <DeliveriesScreen onDeliveryPress={handleDashboardDeliveryPress} onBack={() => setActiveTab('dashboard')} />;
      case 'wallet':
        return <MyWalletScreen onBack={() => setActiveTab('dashboard')} />;
      case 'points':
        return <PointsScreen onBack={() => setActiveTab('dashboard')} />;
      case 'messages':
        return (
          <MessagesScreen
            onBack={() => setActiveTab('dashboard')}
            onMessagePress={(id: string) => setViewingMessageId(id)}
            onChatPress={(id: string) => setViewingChatId(id)}
            markMessageReadLocally={lastReadMessageId}
            markChatReadLocally={lastReadChatId}
          />
        );
      case 'reviews':
        return <ReviewsScreen onBack={() => setActiveTab('dashboard')} />;
      case 'referrals':
        return <ReferralsScreen onBack={() => setActiveTab('dashboard')} />;
      case 'catering':
        return <CateringScreen onBack={() => setActiveTab('dashboard')} />;
      case 'my-account':
        return <MyProfileScreen onBack={() => setActiveTab('dashboard')} />;
      case 'stripe-express':
        return <StripeConnectScreen onBack={() => setActiveTab('dashboard')} onConnected={() => { refreshCourier(); setActiveTab('wallet'); }} standalone />;
      default:
        return <PlaceholderScreen title={activeTab} />;
    }
  };

  return (
    <SafeAreaProvider>
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={styles.content}>{renderScreen()}</View>

        {/* Message Detail Overlay */}
        {viewingMessageId && (
          <View style={StyleSheet.absoluteFill}>
            <MessageDetailScreen messageId={viewingMessageId} onBack={() => { setLastReadMessageId(viewingMessageId); setViewingMessageId(null); }} />
          </View>
        )}

        {/* Chat Overlay */}
        {viewingChatId && (
          <View style={StyleSheet.absoluteFill}>
            <ChatScreen chatId={viewingChatId} onBack={() => { setLastReadChatId(viewingChatId); setViewingChatId(null); }} />
          </View>
        )}
        {!viewingChatId && !viewingMessageId && <BottomNav activeTab={activeTab} onTabPress={handleTabPress} hiddenTabs={hiddenTabs} />}
      </View>
    </SafeAreaProvider>
  );
}

// Exclusive Offer Splash Screen

interface ExclusiveOfferSplashProps {
  expiresAt: string | null;
  onOpen: () => void;
  onExpired: () => void;
}

function ExclusiveOfferSplash({ expiresAt, onOpen, onExpired }: ExclusiveOfferSplashProps) {
  const insets = useSafeAreaInsets();
  const [countdown, setCountdown] = useState<number | null>(null);

  useEffect(() => {
    if (!expiresAt) return;
    const update = () => {
      const now = new Date();
      const expires = new Date(expiresAt);
      const remaining = Math.max(0, Math.floor((expires.getTime() - now.getTime()) / 1000));
      if (remaining <= 0) { onExpired(); return; }
      setCountdown(remaining);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [expiresAt, onExpired]);

  return (
    <ImageBackground source={{ uri: EXCLUSIVE_BG_URL }} style={splashStyles.background} resizeMode="cover">
      <View style={[splashStyles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={splashStyles.content}>
          <Image source={{ uri: EXCLUSIVE_ICON_URL }} style={splashStyles.icon} resizeMode="contain" />
          <Text style={splashStyles.title}>Exclusive Offer!</Text>
          <TouchableOpacity style={splashStyles.openButton} onPress={onOpen} activeOpacity={0.8}>
            <Text style={splashStyles.openButtonText}>OPEN</Text>
          </TouchableOpacity>
          {countdown !== null && (
            <Text style={splashStyles.countdown}>
              Expires in {countdown} Second{countdown !== 1 ? 's' : ''}
            </Text>
          )}
        </View>
      </View>
    </ImageBackground>
  );
}

const splashStyles = StyleSheet.create({
  background: { flex: 1 },
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { alignItems: 'center', paddingHorizontal: 40 },
  icon: { width: 180, height: 180, marginBottom: 24 },
  title: { fontFamily: fontFamily.bold, fontSize: 34, color: '#FFFFFF', textAlign: 'center', marginBottom: 32 },
  openButton: { backgroundColor: '#27d20b', borderRadius: 12, paddingVertical: 18, paddingHorizontal: 80, alignItems: 'center', justifyContent: 'center', minWidth: 260, marginBottom: 20 },
  openButtonText: { fontFamily: fontFamily.bold, fontSize: 20, color: '#FFFFFF', letterSpacing: 1.5 },
  countdown: { fontFamily: fontFamily.regular, fontSize: 16, color: 'rgba(255,255,255,0.7)', textAlign: 'center' },
});

// Placeholder Screen

function PlaceholderScreen({ title }: { title: string }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: colors.backgroundSecondary }}>
      <View
        style={{
          flexDirection: 'row' as const,
          alignItems: 'center' as const,
          paddingTop: insets.top + 8,
          paddingBottom: 14,
          paddingHorizontal: 16,
          backgroundColor: colors.background,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <Text style={{ fontFamily: fontFamily.bold, fontSize: 18, color: colors.text, flex: 1, textAlign: 'center' }}>
          {title}
        </Text>
      </View>
      <View style={{ flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const }}>
        <Text style={{ fontFamily: fontFamily.regular, fontSize: 15, color: colors.textMuted }}>
          Coming soon!
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1 },
});
