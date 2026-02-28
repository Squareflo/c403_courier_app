import React from 'react';
import { Image, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { fontFamily } from '../../constants/typography';
import { formatDistance } from '../../utils/distance';

function calculateMinutesUntilPickup(pickupEta: string | null): number | null {
  if (!pickupEta) return null;
  const now = new Date();
  const eta = new Date(pickupEta);
  return Math.round((eta.getTime() - now.getTime()) / 60000);
}

const STATUS_COLORS: Record<string, string> = {
  accepted_by_courier: '#1F48FF',
  arrived_at_pickup: '#8C52FF',
  en_route: '#FFD21F',
  arrived_at_dropoff: '#5CE1E6',
};

const STATUS_LABELS: Record<string, string> = {
  accepted_by_courier: 'ACCEPTED',
  arrived_at_pickup: 'AT PICKUP',
  en_route: 'EN ROUTE',
  arrived_at_dropoff: 'AT DROP OFF',
};

interface OfferCardProps {
  placeName: string;
  placeImage: string | null;
  points: number;
  distanceKm: number;
  pickupEta: string | null;
  onPress?: () => void;
  status?: string | null;
  distanceUnit?: string | null;
}

export function OfferCard({ placeName, placeImage, points, distanceKm, pickupEta, onPress, status, distanceUnit }: OfferCardProps) {
  const { colors, isDark } = useTheme();

  const minutes = calculateMinutesUntilPickup(pickupEta);
  const isLate = minutes !== null && minutes < 0;
  const badgeBg = isLate ? 'rgba(255, 49, 49, 0.15)' : 'rgba(39, 210, 11, 0.15)';
  const badgeTextColor = isLate ? '#ff3131' : '#27d20b';

  return (
    <View
      style={[
        styles.shadowWrapper,
        !isDark && styles.cardShadow,
        { backgroundColor: colors.card },
      ]}
    >
      <TouchableOpacity
        style={styles.card}
        onPress={onPress}
        activeOpacity={onPress ? 0.8 : 1}
        disabled={!onPress}
      >
        {placeImage ? (
          <Image source={{ uri: placeImage }} style={styles.image} resizeMode="cover" />
        ) : (
          <View style={[styles.imagePlaceholder, { backgroundColor: colors.backgroundSecondary }]}>
            <Text style={[styles.imagePlaceholderText, { color: colors.textMuted }]}>
              {placeName?.charAt(0)?.toUpperCase() || '?'}
            </Text>
          </View>
        )}

        <View style={styles.content}>
          {status && STATUS_LABELS[status] ? (
            <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[status] || '#666' }]}>
              <Text style={styles.statusBadgeText}>{STATUS_LABELS[status]}</Text>
            </View>
          ) : (
            <Text style={[styles.points, { color: colors.text }]}>
              {Math.round(points).toLocaleString()} Points
            </Text>
          )}
          <Text
            style={[styles.name, { color: colors.textTertiary }]}
            numberOfLines={1}
          >
            {placeName || 'Unknown Place'}
          </Text>
          <Text style={[styles.distance, { color: colors.textTertiary }]}>
            <Text style={{ fontFamily: 'Montserrat_700Bold', color: colors.text }}>{formatDistance(distanceKm, distanceUnit)}</Text> Away
          </Text>
        </View>

        {minutes !== null && (
          <View style={[styles.arriveInBadge, { backgroundColor: badgeBg }]}>
            <Text style={[styles.arriveInLabel, { color: badgeTextColor }]}>Arrive In</Text>
            <Text style={[styles.arriveInValue, { color: badgeTextColor }]}>{Math.abs(minutes)} Min</Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  shadowWrapper: {
    borderRadius: 14,
    marginHorizontal: 16,
    marginBottom: 10,
  },
  cardShadow: {
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 6,
      },
      android: {
        elevation: 3,
      },
      default: {},
    }),
  },
  card: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: 14,
    overflow: 'hidden',
  },
  image: {
    width: 92,
    height: '100%',
    minHeight: 86,
  },
  imagePlaceholder: {
    width: 92,
    minHeight: 86,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagePlaceholderText: {
    fontFamily: fontFamily.bold,
    fontSize: 24,
  },
  content: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  points: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
    marginBottom: 2,
  },
  name: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    marginBottom: 2,
  },
  distance: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
  },
  arriveInBadge: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    minWidth: 100,
  },
  arriveInLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
  },
  arriveInValue: {
    fontFamily: fontFamily.bold,
    fontSize: 20,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 4,
  },
  statusBadgeText: {
    fontFamily: fontFamily.bold,
    fontSize: 11,
    color: '#000000',
    letterSpacing: 0.5,
  },
});
