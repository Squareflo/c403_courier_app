import { TextStyle } from 'react-native';
import { scaleFontSize } from '../utils/responsive';

/**
 * Unified Typography System for ChowLocal App
 * 
 * Usage:
 * import { typography } from '../constants/typography';
 * <Text style={typography.sectionTitle}>Free Delivery</Text>
 */

// Font families
export const fontFamily = {
  regular: 'Montserrat_400Regular',
  medium: 'Montserrat_500Medium',
  semiBold: 'Montserrat_600SemiBold',
  bold: 'Montserrat_700Bold',
} as const;

// Base typography styles
export const typography = {
  screenTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 22,
    color: '#000',
  } as TextStyle,

  sectionTitle: {
    fontFamily: fontFamily.regular,
    fontSize: scaleFontSize(18),
    color: '#000',
  } as TextStyle,

  cardTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
    color: '#000',
  } as TextStyle,

  placeName: {
    fontFamily: fontFamily.bold,
    fontSize: 20,
    color: '#000',
  } as TextStyle,

  restaurantCardName: {
    fontFamily: fontFamily.bold,
    fontSize: scaleFontSize(15),
    color: '#000',
  } as TextStyle,

  itemTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    color: '#000',
  } as TextStyle,

  bodyText: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: '#333',
  } as TextStyle,

  bodyTextSmall: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: '#000',
  } as TextStyle,

  caption: {
    fontFamily: fontFamily.regular,
    fontSize: scaleFontSize(11),
    color: '#000',
  } as TextStyle,

  captionBold: {
    fontFamily: fontFamily.semiBold,
    fontSize: scaleFontSize(11),
    color: '#333',
  } as TextStyle,

  priceText: {
    fontFamily: fontFamily.regular,
    fontSize: 16,
    color: '#000',
  } as TextStyle,

  totalText: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
    color: '#000',
  } as TextStyle,

  linkText: {
    fontFamily: fontFamily.semiBold,
    fontSize: scaleFontSize(14),
    color: '#000',
  } as TextStyle,

  buttonText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    color: '#fff',
  } as TextStyle,

  ratingText: {
    fontFamily: fontFamily.bold,
    fontSize: scaleFontSize(13),
    color: '#000',
  } as TextStyle,

  reviewsText: {
    fontFamily: fontFamily.semiBold,
    fontSize: scaleFontSize(12),
    color: '#000',
  } as TextStyle,

  summaryLabel: {
    fontFamily: fontFamily.regular,
    fontSize: 15,
    color: '#000',
  } as TextStyle,

  summaryValue: {
    fontFamily: fontFamily.regular,
    fontSize: 15,
    color: '#000',
  } as TextStyle,

  scheduleTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
    color: '#000',
  } as TextStyle,

  scheduleSubtitle: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    color: '#000',
  } as TextStyle,

  orderModeText: {
    fontFamily: fontFamily.bold,
    fontSize: 14,
    color: '#000',
  } as TextStyle,

  headerTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
    color: '#000',
  } as TextStyle,

  tipButtonText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
    color: '#333',
  } as TextStyle,

  instructionsLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    color: '#000',
  } as TextStyle,

  successSubtitle: {
    fontFamily: fontFamily.regular,
    fontSize: 16,
    color: '#000',
  } as TextStyle,

  estimatedTimeLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    color: '#000',
  } as TextStyle,

  timelineTitle: {
    fontFamily: fontFamily.medium,
    fontSize: 15,
    color: '#000',
  } as TextStyle,

  timelineTitleActive: {
    fontFamily: fontFamily.semiBold,
    fontSize: 15,
    color: '#000',
  } as TextStyle,

  bannerTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
    color: '#fff',
  } as TextStyle,

  bannerSubtitle: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    color: '#fff',
  } as TextStyle,

  bannerButtonText: {
    fontFamily: fontFamily.bold,
    fontSize: 13,
    color: '#fff',
  } as TextStyle,
} as const;

export const typographyLight = {
  placeName: {
    ...typography.placeName,
    color: '#fff',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  } as TextStyle,

  restaurantCardName: {
    ...typography.restaurantCardName,
    color: '#fff',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  } as TextStyle,

  itemTitle: {
    ...typography.itemTitle,
    color: '#fff',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  } as TextStyle,

  sectionTitle: {
    ...typography.sectionTitle,
    color: '#fff',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  } as TextStyle,

  cardTitle: {
    ...typography.cardTitle,
    color: '#fff',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  } as TextStyle,

  ratingText: {
    ...typography.ratingText,
    color: '#fff',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  } as TextStyle,

  reviewsText: {
    ...typography.reviewsText,
    color: '#fff',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  } as TextStyle,

  bodyText: {
    ...typography.bodyText,
    color: 'rgba(255,255,255,0.9)',
  } as TextStyle,

  caption: {
    ...typography.caption,
    color: '#fff',
  } as TextStyle,
} as const;

export default typography;
