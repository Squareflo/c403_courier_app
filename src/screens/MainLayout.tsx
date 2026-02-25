import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { BottomNav, type TabId } from '../components/BottomNav';
import { DashboardScreen } from './DashboardScreen';
import { OnlineScreen } from './OnlineScreen';
import { OpenOfferScreen } from './OpenOfferScreen';
import { ActiveDeliveryScreen } from './ActiveDeliveryScreen';
import { fontFamily } from '../constants/typography';
import { supabase } from '../lib/supabase';

// Notification sound for exclusive offers (hosted on Cloudinary)
const EXCLUSIVE_OFFER_SOUND_URL = 'https://res.cloudinary.com/chowlocal/video/upload/v1772028075/exclusive-offer-sound-loud_oyvoy7.wav';

/**
 * MainLayout handles post-auth navigation with a bottom tab bar.
 *
 * EXCLUSIVE OFFER TAKEOVER:
 * If the courier has a pending exclusive delivery_offer, the OpenOfferScreen
 * is forced with no way to dismiss — accept, reject, or expiry only.
 * This check runs on mount and via realtime subscription, so it persists
 * even across app restarts.
 *
 * A notification sound plays when the exclusive offer appears, mixed with
 * any background audio from other apps (does not pause their music).
 */
export function MainLayout() {
  const { colors } = useTheme();
  const { signOut, courier } = useAuth();

  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [isOnline, setIsOnline] = useState(false);

  // Open offer navigation state
  const [selectedOffer, setSelectedOffer] = useState<{
    id: string;
    type: 'open' | 'exclusive';
  } | null>(null);

  // Active delivery navigation state
  const [activeDeliveryId, setActiveDeliveryId] = useState<string | null>(null);

  // Forced exclusive offer state — takes over entire app
  const [forcedExclusiveOffer, setForcedExclusiveOffer] = useState<{
    deliveryRequestId: string;
    offerId: string;
  } | null>(null);

  // Sound ref to allow cleanup
  const soundRef = useRef<Audio.Sound | null>(null);

  // Track which offer ID we already played sound for (prevent replays)
  const lastPlayedOfferIdRef = useRef<string | null>(null);

  // ── Play exclusive offer notification sound ─────────────────────────────

  const playExclusiveOfferSound = useCallback(async () => {
    try {
      console.log('[MainLayout] Setting audio mode...');

      // Configure audio to mix with other apps (don't pause their music)
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        interruptionModeIOS: InterruptionModeIOS.DuckOthers,
        interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });

      console.log('[MainLayout] Audio mode set. Unloading previous sound...');

      // Unload any previous sound
      if (soundRef.current) {
        try {
          await soundRef.current.unloadAsync();
        } catch {}
        soundRef.current = null;
      }

      console.log('[MainLayout] Loading sound from:', EXCLUSIVE_OFFER_SOUND_URL);

      // Load and play the notification sound
      const { sound, status } = await Audio.Sound.createAsync(
        { uri: EXCLUSIVE_OFFER_SOUND_URL },
        { shouldPlay: true, volume: 1.0 },
      );

      console.log('[MainLayout] Sound loaded, status:', JSON.stringify(status));
      soundRef.current = sound;

      // Auto-cleanup when done playing
      sound.setOnPlaybackStatusUpdate((playbackStatus) => {
        if (playbackStatus.isLoaded && playbackStatus.didJustFinish) {
          console.log('[MainLayout] Sound finished playing, cleaning up');
          sound.unloadAsync().catch(() => {});
          if (soundRef.current === sound) {
            soundRef.current = null;
          }
        }
      });

      console.log('[MainLayout] ✅ Exclusive offer notification sound playing');
    } catch (err) {
      console.error('[MainLayout] ❌ Could not play exclusive offer sound:', err);
    }
  }, []);

  // Cleanup sound on unmount
  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
      }
    };
  }, []);

  // ── Check for pending exclusive offers ──────────────────────────────────

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

      if (error) {
        console.error('[MainLayout] Error checking exclusive offers:', error);
        return;
      }

      if (data && data.length > 0) {
        const offer = data[0];

        // Check if it hasn't expired yet
        if (offer.expires_at) {
          const expiresAt = new Date(offer.expires_at);
          const now = new Date();
          if (expiresAt.getTime() <= now.getTime()) {
            // Already expired, clear it
            setForcedExclusiveOffer(null);
            return;
          }
        }

        console.log('[MainLayout] Found pending exclusive offer:', offer.id);

        // Play sound if this is a NEW offer we haven't played for yet
        if (lastPlayedOfferIdRef.current !== offer.id) {
          lastPlayedOfferIdRef.current = offer.id;
          playExclusiveOfferSound();
        }

        setForcedExclusiveOffer({
          deliveryRequestId: offer.delivery_request_id,
          offerId: offer.id,
        });
      } else {
        setForcedExclusiveOffer(null);
      }
    } catch (err) {
      console.error('[MainLayout] Error checking exclusive offers:', err);
    }
  }, [courier?.id, playExclusiveOfferSound]);

  // Check on mount and when courier changes
  useEffect(() => {
    checkForExclusiveOffer();
  }, [checkForExclusiveOffer]);

  // Realtime subscription for delivery_offer changes
  useEffect(() => {
    if (!courier?.id) return;

    const subscription = supabase
      .channel(`exclusive-offer-watch-${courier.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'delivery_offer',
        },
        (payload: any) => {
          console.log('[MainLayout] delivery_offer realtime event:', payload.eventType);

          // New exclusive offer inserted for this courier
          if (
            payload.eventType === 'INSERT' &&
            payload.new.type === 'exclusive' &&
            payload.new.courier_id === courier.id &&
            payload.new.status === 'pending'
          ) {
            console.log('[MainLayout] New exclusive offer detected — forcing screen');
            lastPlayedOfferIdRef.current = payload.new.id;
            playExclusiveOfferSound();
            setForcedExclusiveOffer({
              deliveryRequestId: payload.new.delivery_request_id,
              offerId: payload.new.id,
            });
          }

          // Offer status changed (accepted/rejected/timed_out) — re-check
          if (payload.eventType === 'UPDATE') {
            if (
              payload.new.type === 'exclusive' &&
              payload.new.courier_id === courier.id &&
              payload.new.status !== 'pending'
            ) {
              console.log('[MainLayout] Exclusive offer resolved — clearing forced screen');
              setForcedExclusiveOffer(null);
            }
          }
        }
      )
      .subscribe((status: string) => {
        console.log('[MainLayout] Exclusive offer subscription:', status);
      });

    return () => {
      subscription.unsubscribe();
    };
  }, [courier?.id, playExclusiveOfferSound]);

  // ── Tab navigation ──────────────────────────────────────────────────────

  const handleTabPress = (tab: TabId) => {
    setActiveTab(tab);
  };

  // ── Online mode (triggered from DashboardScreen's SlideToOnline) ────────

  const handleWentOnline = () => {
    setIsOnline(true);
  };

  const handleWentOffline = () => {
    setIsOnline(false);
    setSelectedOffer(null);
    setActiveDeliveryId(null);
    setActiveTab('dashboard');
  };

  // ── Handle exclusive offer resolved (accept/reject/expiry) ──────────────

  const handleExclusiveResolved = () => {
    setForcedExclusiveOffer(null);
    // Re-check in case there's another one queued
    checkForExclusiveOffer();
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // FORCED EXCLUSIVE OFFER — takes priority over EVERYTHING
  // ═══════════════════════════════════════════════════════════════════════════

  if (forcedExclusiveOffer) {
    return (
      <SafeAreaProvider>
        <View style={[styles.root, { backgroundColor: '#000000' }]}>
          <OpenOfferScreen
            deliveryRequestId={forcedExclusiveOffer.deliveryRequestId}
            offerType="exclusive"
            isForced
            onBack={handleExclusiveResolved}
            onOfferResolved={handleExclusiveResolved}
          />
        </View>
      </SafeAreaProvider>
    );
  }

  // ── If online, show OnlineScreen, OpenOfferScreen, or ActiveDeliveryScreen

  if (isOnline || courier?.is_online) {
    // If an offer is selected, show the OpenOfferScreen (takes priority so
    // tapping an offer from ActiveDeliveryScreen navigates here)
    if (selectedOffer) {
      return (
        <SafeAreaProvider>
          <View style={[styles.root, { backgroundColor: '#000000' }]}>
            <OpenOfferScreen
              deliveryRequestId={selectedOffer.id}
              offerType={selectedOffer.type}
              onBack={() => setSelectedOffer(null)}
              onOfferResolved={() => setSelectedOffer(null)}
            />
          </View>
        </SafeAreaProvider>
      );
    }

    // If an active delivery is selected, show the ActiveDeliveryScreen
    if (activeDeliveryId) {
      return (
        <SafeAreaProvider>
          <View style={[styles.root, { backgroundColor: '#000000' }]}>
            <ActiveDeliveryScreen
              deliveryRequestId={activeDeliveryId}
              onBack={() => setActiveDeliveryId(null)}
              onDeliveryCompleted={() => {
                setActiveDeliveryId(null);
              }}
              onOfferPress={(id, type) => setSelectedOffer({ id, type })}
            />
          </View>
        </SafeAreaProvider>
      );
    }

    // Otherwise show the OnlineScreen
    return (
      <SafeAreaProvider>
        <View style={[styles.root, { backgroundColor: '#000000' }]}>
          <OnlineScreen
            onGoOffline={handleWentOffline}
            onOfferPress={(id, type) => setSelectedOffer({ id, type })}
            onAcceptedDeliveryPress={(id) => setActiveDeliveryId(id)}
          />
        </View>
      </SafeAreaProvider>
    );
  }

  // ─── Offline: Main tab screens with bottom nav ──────────────────────────

  const renderScreen = () => {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardScreen onWentOnline={handleWentOnline} />;
      case 'deliveries':
        return <PlaceholderScreen title="Deliveries" />;
      case 'wallet':
        return <PlaceholderScreen title="Wallet" />;
      case 'messages':
        return <PlaceholderScreen title="Messages" />;
      case 'reviews':
        return <PlaceholderScreen title="Reviews" />;
      case 'referrals':
        return <PlaceholderScreen title="Referrals" />;
      case 'my-account':
        return <PlaceholderScreen title="My Account" />;
      default:
        return <PlaceholderScreen title={activeTab} />;
    }
  };

  return (
    <SafeAreaProvider>
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={styles.content}>{renderScreen()}</View>
        <BottomNav activeTab={activeTab} onTabPress={handleTabPress} />
      </View>
    </SafeAreaProvider>
  );
}

// Simple placeholder for screens not yet implemented
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
  root: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
});
