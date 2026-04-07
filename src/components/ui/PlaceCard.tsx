import React from 'react';
import { Image, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Foundation } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { fontFamily } from '../../constants/typography';

interface PlaceCardPlace {
  name?: string | null;
  address_line_1?: string | null;
  city?: string | null;
  profile_picture_url?: string | null;
  cover_image_url?: string | null;
  photos?: string[] | null;
  rating?: number | null;
  average_rating?: number | null;
  total_reviews?: number | null;
  reviewCount?: number | null;
}

interface PlaceCardProps {
  place: PlaceCardPlace;
  onPress?: () => void;
  containerStyle?: object;
  rightAction?: React.ReactNode;
}

export function PlaceCard({ place, onPress, containerStyle, rightAction }: PlaceCardProps) {
  const { colors, isDark } = useTheme();

  const imageSource = place.profile_picture_url
    || place.cover_image_url
    || (place.photos && place.photos.length > 0 ? place.photos[0] : null);

  const address = [place.address_line_1, place.city]
    .filter(Boolean)
    .join(', ');

  const ratingValue = typeof place.rating === 'number' ? place.rating
    : typeof place.average_rating === 'number' ? place.average_rating : 0;
  const boundedRating = Math.min(Math.max(ratingValue, 0), 5);
  const fullStars = Math.floor(boundedRating);
  const reviewCount = typeof place.reviewCount === 'number' ? place.reviewCount
    : typeof place.total_reviews === 'number' ? place.total_reviews : 0;

  return (
    <View
      style={[
        styles.shadowWrapper,
        !isDark && styles.cardShadow,
        { backgroundColor: colors.card },
        containerStyle,
      ]}
    >
      <TouchableOpacity
        style={styles.card}
        onPress={onPress}
        activeOpacity={onPress ? 0.8 : 1}
        disabled={!onPress}
      >
        {imageSource ? (
          <Image source={{ uri: imageSource }} style={styles.image} resizeMode="cover" />
        ) : (
          <View style={[styles.imagePlaceholder, { backgroundColor: colors.backgroundSecondary }]}>
            <Text style={[styles.imagePlaceholderText, { color: colors.textMuted }]}>
              {place.name?.charAt(0)?.toUpperCase() || '?'}
            </Text>
          </View>
        )}

        <View style={[styles.content, rightAction ? styles.contentWithAction : undefined]}>
          <Text
            style={[styles.name, { color: colors.text }]}
            numberOfLines={1}
          >
            {place.name || 'Unknown Place'}
          </Text>

          {address ? (
            <View style={styles.addressRow}>
              <Text
                style={[styles.address, { color: colors.textTertiary }]}
                numberOfLines={1}
              >
                {address}
              </Text>
            </View>
          ) : null}

          <View style={styles.ratingRow}>
            <Text style={[styles.avgRatingText, { color: colors.starFilled }]}>
              {boundedRating.toFixed(1)}
            </Text>
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((star) => (
                <Foundation
                  key={star}
                  name="star"
                  size={15}
                  color={star <= fullStars ? colors.starFilled : colors.border}
                  style={styles.starIcon}
                />
              ))}
            </View>
            <Text style={[styles.reviewsText, { color: colors.textSecondary }]}>{`${reviewCount} Reviews`}</Text>
          </View>
        </View>
        {rightAction && (
          <View style={styles.rightActionContainer}>
            {rightAction}
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  shadowWrapper: {
    borderRadius: 14,
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
    flexDirection: 'row' as const,
    alignItems: 'stretch' as const,
    borderRadius: 14,
    overflow: 'hidden' as const,
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
    paddingVertical: 12,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  contentWithAction: {
    paddingRight: 4,
  },
  name: {
    fontFamily: fontFamily.bold,
    fontSize: 15,
    marginBottom: 4,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  address: {
    fontFamily: fontFamily.regular,
    fontSize: 15,
    flex: 1,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  avgRatingText: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    lineHeight: 16,
  },
  starsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  starIcon: {
    marginRight: 1,
    marginTop: -1,
  },
  reviewsText: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 16,
  },
  rightActionContainer: {
    justifyContent: 'center',
    paddingRight: 12,
  },
});
