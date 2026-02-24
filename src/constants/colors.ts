/**
 * ChowLocal Color System with Dark Mode Support
 * 
 * Usage:
 * import { useTheme } from '../contexts/ThemeContext';
 * const { colors } = useTheme();
 * <View style={{ backgroundColor: colors.background }}>
 */

// Brand colors (same for both themes)
export const brand = {
  primary: '#ec2227',
  primaryLight: '#ff4d52',
  primaryDark: '#c41c20',
  secondary: '#6B7280',
} as const;

// Light theme colors
export const lightColors = {
  // Brand
  primary: brand.primary,
  primaryLight: brand.primaryLight,
  primaryDark: brand.primaryDark,
  secondary: brand.secondary,

  // Backgrounds
  background: '#FFFFFF',
  backgroundSecondary: '#f4f4f4',
  backgroundTertiary: '#f9fafb',
  surface: '#FFFFFF',
  surfaceSecondary: '#f5f5f5',
  surfaceTertiary: '#fafafa',

  // Cards & Containers
  card: '#FFFFFF',
  cardElevated: '#FFFFFF',
  cardPressed: '#f5f5f5',

  // Text
  text: '#000000',
  textSecondary: '#333333',
  textTertiary: '#666666',
  textMuted: '#999999',
  textInverse: '#FFFFFF',
  textOnPrimary: '#FFFFFF',

  // Borders & Dividers
  border: '#E5E7EB',
  borderLight: '#F3F4F6',
  borderDark: '#D1D5DB',
  divider: '#eeeeee',

  // Input fields
  inputBackground: '#FFFFFF',
  inputBorder: '#E5E7EB',
  inputPlaceholder: '#9CA3AF',
  inputText: '#000000',

  // Status colors
  success: '#10B981',
  successBackground: '#D1FAE5',
  warning: '#F59E0B',
  warningBackground: '#FEF3C7',
  error: '#EF4444',
  errorBackground: '#FEE2E2',
  info: '#3B82F6',
  infoBackground: '#DBEAFE',

  // Interactive states
  pressed: 'rgba(0, 0, 0, 0.05)',
  disabled: '#E5E7EB',
  disabledText: '#9CA3AF',

  // Overlays
  overlay: 'rgba(0, 0, 0, 0.5)',
  overlayLight: 'rgba(0, 0, 0, 0.3)',

  // Shadows (for shadow color prop)
  shadow: '#000000',

  // Rating stars
  starFilled: '#FFD700',
  starEmpty: '#DDDDDD',

  // Tab bar
  tabBarBackground: '#FFFFFF',
  tabBarBorder: '#E5E7EB',
  tabBarActive: '#000000',
  tabBarInactive: '#9CA3AF',

  // Header
  headerBackground: '#f4f4f4',
  headerText: '#000000',
  headerIcon: '#000000',

  // Modal
  modalBackground: '#FFFFFF',
  modalOverlay: 'rgba(0, 0, 0, 0.5)',

  // Skeleton loading
  skeleton: '#E5E7EB',
  skeletonHighlight: '#F3F4F6',

  // Badge
  badge: brand.primary,
  badgeText: '#FFFFFF',

  // Chip/Tag
  chip: '#F3F4F6',
  chipText: '#374151',
  chipSelected: brand.primary,
  chipSelectedText: '#FFFFFF',

  // Search
  searchBackground: '#FFFFFF',
  searchPlaceholder: '#9CA3AF',
  searchIcon: '#9CA3AF',

  // Pull to refresh
  refreshControl: brand.primary,

  // Activity indicator
  activityIndicator: brand.primary,

  // Icons
  icon: '#000000',
  iconSecondary: '#666666',
  iconMuted: '#999999',

  // Links
  link: brand.primary,

  // Wallet/Money
  money: '#10B981',
  moneyBackground: '#D1FAE5',

  // Order status
  orderPending: '#F59E0B',
  orderPendingBg: '#FEF3C7',
  orderConfirmed: '#3B82F6',
  orderConfirmedBg: '#DBEAFE',
  orderPreparing: '#8B5CF6',
  orderPreparingBg: '#EDE9FE',
  orderReady: '#10B981',
  orderReadyBg: '#D1FAE5',
  orderDelivered: '#10B981',
  orderDeliveredBg: '#D1FAE5',
  orderCancelled: '#EF4444',
  orderCancelledBg: '#FEE2E2',

  // Specific UI elements
  followButton: '#000000',
  followButtonText: '#FFFFFF',
  followingButton: '#E5E7EB',
  followingButtonText: '#374151',
} as const;

// Dark theme colors
export const darkColors = {
  // Brand (stays the same)
  primary: brand.primary,
  primaryLight: brand.primaryLight,
  primaryDark: brand.primaryDark,
  secondary: '#9CA3AF',

  // Backgrounds
  background: '#000000',
  backgroundSecondary: '#111111',
  backgroundTertiary: '#1a1a1a',
  surface: '#1a1a1a',
  surfaceSecondary: '#2a2a2a',
  surfaceTertiary: '#333333',

  // Cards & Containers
  card: '#2a2a2a',
  cardElevated: '#333333',
  cardPressed: '#3a3a3a',

  // Text
  text: '#FFFFFF',
  textSecondary: '#E5E7EB',
  textTertiary: '#9CA3AF',
  textMuted: '#6B7280',
  textInverse: '#000000',
  textOnPrimary: '#FFFFFF',

  // Borders & Dividers
  border: '#444444',
  borderLight: '#333333',
  borderDark: '#555555',
  divider: '#444444',

  // Input fields
  inputBackground: '#2a2a2a',
  inputBorder: '#444444',
  inputPlaceholder: '#6B7280',
  inputText: '#FFFFFF',

  // Status colors (slightly adjusted for dark mode)
  success: '#34D399',
  successBackground: '#064E3B',
  warning: '#FBBF24',
  warningBackground: '#78350F',
  error: '#F87171',
  errorBackground: '#7F1D1D',
  info: '#60A5FA',
  infoBackground: '#1E3A5F',

  // Interactive states
  pressed: 'rgba(255, 255, 255, 0.1)',
  disabled: '#333333',
  disabledText: '#6B7280',

  // Overlays
  overlay: 'rgba(0, 0, 0, 0.7)',
  overlayLight: 'rgba(0, 0, 0, 0.5)',

  // Shadows
  shadow: '#000000',

  // Rating stars
  starFilled: '#FFD700',
  starEmpty: '#444444',

  // Tab bar
  tabBarBackground: '#111111',
  tabBarBorder: '#333333',
  tabBarActive: '#FFFFFF',
  tabBarInactive: '#6B7280',

  // Header
  headerBackground: '#111111',
  headerText: '#FFFFFF',
  headerIcon: '#FFFFFF',

  // Modal
  modalBackground: '#2a2a2a',
  modalOverlay: 'rgba(0, 0, 0, 0.7)',

  // Skeleton loading
  skeleton: '#333333',
  skeletonHighlight: '#444444',

  // Badge
  badge: brand.primary,
  badgeText: '#FFFFFF',

  // Chip/Tag
  chip: '#333333',
  chipText: '#E5E7EB',
  chipSelected: brand.primary,
  chipSelectedText: '#FFFFFF',

  // Search
  searchBackground: '#2a2a2a',
  searchPlaceholder: '#6B7280',
  searchIcon: '#6B7280',

  // Pull to refresh
  refreshControl: brand.primary,

  // Activity indicator
  activityIndicator: brand.primary,

  // Icons
  icon: '#FFFFFF',
  iconSecondary: '#E5E7EB',
  iconMuted: '#6B7280',

  // Links
  link: '#ff4d52',

  // Wallet/Money
  money: '#34D399',
  moneyBackground: '#064E3B',

  // Order status
  orderPending: '#FBBF24',
  orderPendingBg: '#78350F',
  orderConfirmed: '#60A5FA',
  orderConfirmedBg: '#1E3A5F',
  orderPreparing: '#A78BFA',
  orderPreparingBg: '#4C1D95',
  orderReady: '#34D399',
  orderReadyBg: '#064E3B',
  orderDelivered: '#34D399',
  orderDeliveredBg: '#064E3B',
  orderCancelled: '#F87171',
  orderCancelledBg: '#7F1D1D',

  // Specific UI elements
  followButton: '#FFFFFF',
  followButtonText: '#000000',
  followingButton: '#333333',
  followingButtonText: '#E5E7EB',
} as const;

// Type for theme colors
export type ThemeColors = typeof lightColors | typeof darkColors;

// Get colors for a specific theme
export const getThemeColors = (isDark: boolean): ThemeColors => {
  return isDark ? darkColors : lightColors;
};

export default { lightColors, darkColors, brand, getThemeColors };
