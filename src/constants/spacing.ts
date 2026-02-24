/**
 * Unified Spacing System for ChowLocal App
 * 
 * Usage:
 * import { spacing } from '../constants/spacing';
 * <View style={{ padding: spacing.md }}>
 * 
 * Base unit: 4px
 * Scale: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64
 */

// Base spacing values
export const spacing = {
  /** 4px - Minimal spacing, tight gaps */
  xs: 4,
  
  /** 8px - Small spacing, icon gaps, tight padding */
  sm: 8,
  
  /** 12px - Medium-small spacing, card internal padding */
  md: 12,
  
  /** 16px - Standard spacing, section padding, margins */
  lg: 16,
  
  /** 20px - Medium-large spacing */
  xl: 20,
  
  /** 24px - Large spacing, section gaps */
  xxl: 24,
  
  /** 32px - Extra large spacing */
  xxxl: 32,
  
  /** 40px - Component gaps */
  '4xl': 40,
  
  /** 48px - Large component gaps */
  '5xl': 48,
  
  /** 64px - Screen-level spacing */
  '6xl': 64,
} as const;

// Screen-level layout constants
export const layout = {
  screenPaddingHorizontal: spacing.lg,
  cardPadding: spacing.lg,
  sectionGap: spacing.xl,
  listItemGap: spacing.md,
  horizontalListGap: spacing.md,
  scrollBottomPadding: 100,
  headerOffset: 120,
  cardBorderRadius: spacing.md,
  modalBorderRadius: spacing.lg,
  buttonBorderRadius: spacing.sm,
  pillBorderRadius: spacing.xl,
  cardShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
} as const;

// Component-specific spacing
export const componentSpacing = {
  sectionHeaderMarginBottom: spacing.md,
  iconTextGap: spacing.sm,
  horizontalListPadding: spacing.lg,
  cardMarginBottom: spacing.lg,
  inputPaddingVertical: spacing.md,
  inputPaddingHorizontal: spacing.lg,
} as const;

export default spacing;
