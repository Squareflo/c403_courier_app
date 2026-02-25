import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { BottomNav, type TabId } from '../components/BottomNav';
import { DashboardScreen } from './DashboardScreen';
import { OnlineScreen } from './OnlineScreen';
import { OpenOfferScreen } from './OpenOfferScreen';
import { ActiveDeliveryScreen } from './ActiveDeliveryScreen';
import { fontFamily } from '../constants/typography';
import { supabase } from '../lib/supabase';

/**
 * MainLayout handles post-auth navigation with a bottom tab bar.
 *
 * EXCLUSIVE OFFER TAKEOVER:
 * If the courier has a pending exclusive delivery_offer, the OpenOfferScreen
 * is forced with no way to dismiss — accept, reject, or expiry only.
 * This check runs on mount and via realtime subscription, so it persists
 * even across app restarts.
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
  }, [courier?.id]);

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
  }, [courier?.id]);

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
