import { Dimensions, Platform, PixelRatio } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Base dimensions (iPhone 14 Pro)
const baseWidth = 393;
const baseHeight = 852;

/**
 * Scales a value based on screen width
 */
export const scaleWidth = (size: number): number => {
  return (SCREEN_WIDTH / baseWidth) * size;
};

/**
 * Scales a value based on screen height
 */
export const scaleHeight = (size: number): number => {
  return (SCREEN_HEIGHT / baseHeight) * size;
};

/**
 * Scales font size based on screen width with optional max/min limits
 */
export const scaleFontSize = (size: number, factor: number = 0.5): number => {
  const newSize = size + (scaleWidth(size) - size) * factor;
  
  if (Platform.OS === 'ios') {
    return Math.round(PixelRatio.roundToNearestPixel(newSize));
  }
  
  return Math.round(newSize);
};

/**
 * Moderately scale - good for general spacing and sizes
 */
export const moderateScale = (size: number, factor: number = 0.5): number => {
  return size + (scaleWidth(size) - size) * factor;
};

/**
 * Get responsive font size with min/max limits
 */
export const getResponsiveFontSize = (
  size: number,
  minSize?: number,
  maxSize?: number
): number => {
  let scaled = scaleFontSize(size);
  
  if (minSize && scaled < minSize) {
    scaled = minSize;
  }
  
  if (maxSize && scaled > maxSize) {
    scaled = maxSize;
  }
  
  return scaled;
};
