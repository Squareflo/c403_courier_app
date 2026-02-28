import React, { useCallback, useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { fontFamily } from '../../constants/typography';
import { supabase } from '../../lib/supabase';
import { OfferCard } from './OfferCard';

interface OpenOffer {
  id: string;
  place_name?: string;
  place_profile_picture_url?: string | null;
  points_offered?: number;
  delivery_distance_km?: number;
  pickup_eta?: string | null;
  delivery_number?: string | null;
  [key: string]: any;
}

interface TerritorySettings {
  max_active_deliveries_per_courier: number;
  courier_must_be_en_route_to_accept_another_delivery: boolean;
}

interface OpenOffersSectionProps {
  offers: OpenOffer[];
  onOfferPress: (offer: OpenOffer) => void;
  /** When true, removes OfferCard's built-in horizontal margin (use inside containers that already have padding) */
  flush?: boolean;
}

export function OpenOffersSection({ offers, onOfferPress, flush = false }: OpenOffersSectionProps) {
  const { courier } = useAuth();
  const { colors } = useTheme();

  const [territorySettings, setTerritorySettings] = useState<TerritorySettings | null>(null);
  const [activeDeliveryCount, setActiveDeliveryCount] = useState(0);
  const [hasEnRouteDelivery, setHasEnRouteDelivery] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [modalMessage, setModalMessage] = useState('');

  // ── Fetch territory settings ──────────────────────────────────────────

  const loadTerritorySettings = useCallback(async () => {
    if (!courier?.territory_id) return;

    try {
      const { data, error } = await supabase
        .from('territory')
        .select('max_active_deliveries_per_courier, courier_must_be_en_route_to_accept_another_delivery')
        .eq('id', courier.territory_id)
        .single();

      if (!error && data) {
        setTerritorySettings(data as TerritorySettings);
      }
    } catch (err) {
      console.error('[OpenOffersSection] Error loading territory settings:', err);
    }
  }, [courier?.territory_id]);

  // ── Count active deliveries + check en_route status ───────────────────

  const loadActiveDeliveryInfo = useCallback(async () => {
    if (!courier?.id) return;

    try {
      const { data, error } = await supabase
        .from('delivery_request')
        .select('id, status')
        .eq('courier_id', courier.id)
        .in('status', ['accepted_by_courier', 'arrived_at_pickup', 'en_route', 'arrived_at_dropoff']);

      if (!error && data) {
        setActiveDeliveryCount(data.length);
        setHasEnRouteDelivery(data.some((d) => d.status === 'en_route' || d.status === 'arrived_at_dropoff'));
      }
    } catch (err) {
      console.error('[OpenOffersSection] Error loading active delivery info:', err);
    }
  }, [courier?.id]);

  useEffect(() => {
    loadTerritorySettings();
    loadActiveDeliveryInfo();
  }, [loadTerritorySettings, loadActiveDeliveryInfo]);

  // ── Determine if offers are locked ────────────────────────────────────

  const isAtMax =
    territorySettings !== null &&
    activeDeliveryCount >= territorySettings.max_active_deliveries_per_courier;

  const needsEnRoute =
    territorySettings !== null &&
    territorySettings.courier_must_be_en_route_to_accept_another_delivery &&
    activeDeliveryCount > 0 &&
    !hasEnRouteDelivery;

  const isLocked = isAtMax || needsEnRoute;

  // ── Handle locked card press ──────────────────────────────────────────

  const handleLockedPress = () => {
    if (isAtMax) {
      const max = territorySettings!.max_active_deliveries_per_courier;
      setModalMessage(
        `You've reached your maximum of ${max} active deliver${max === 1 ? 'y' : 'ies'}. Complete a delivery before accepting another.`
      );
    } else if (needsEnRoute) {
      setModalMessage(
        'You need to be en route on your current delivery before you can accept another.'
      );
    }
    setShowModal(true);
  };

  // ── Handle offer press (locked or normal) ─────────────────────────────

  const handleOfferPress = (offer: OpenOffer) => {
    if (isLocked) {
      handleLockedPress();
    } else {
      onOfferPress(offer);
    }
  };

  if (offers.length === 0) return null;

  const count = offers.length;

  return (
    <>
      <View style={[styles.header, flush && styles.headerFlush]}>
        <Text style={[styles.title, { color: colors.text }]}>
          {count} Open Offer{count !== 1 ? 's' : ''}
        </Text>
      </View>

      {offers.map((offer) => (
        <View
          key={offer.id}
          style={[
            flush ? styles.cardFlush : undefined,
            isLocked && styles.lockedCard,
          ]}
        >
          <OfferCard
            placeName={offer.place_name || `Delivery #${offer.delivery_number || offer.id?.slice(-6).toUpperCase()}`}
            placeImage={offer.place_profile_picture_url || null}
            points={offer.points_offered || 0}
            distanceKm={offer.delivery_distance_km || 0}
            pickupEta={offer.pickup_eta || null}
            onPress={() => handleOfferPress(offer)}
            distanceUnit={courier?.preferred_distance_unit}
          />
        </View>
      ))}

      {/* ── Max deliveries / en-route modal ── */}
      <Modal
        visible={showModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Can't Accept Offer</Text>
            <Text style={[styles.modalText, { color: colors.textTertiary }]}>
              {modalMessage}
            </Text>
            <TouchableOpacity
              style={[styles.modalButton, { backgroundColor: colors.primary }]}
              onPress={() => setShowModal(false)}
              activeOpacity={0.7}
            >
              <Text style={styles.modalButtonText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginTop: 24,
    marginBottom: 12,
  },
  headerFlush: {
    paddingHorizontal: 0,
  },
  title: {
    fontFamily: fontFamily.regular,
    fontSize: 20,
  },
  cardFlush: {
    marginHorizontal: -16,
  },
  lockedCard: {
    opacity: 0.5,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  modalContent: {
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
  },
  modalTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 20,
    marginBottom: 12,
  },
  modalText: {
    fontFamily: fontFamily.regular,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  modalButton: {
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 40,
    alignItems: 'center',
  },
  modalButtonText: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
    color: '#FFFFFF',
  },
});
