// Distance formatting utility based on courier's preferred_distance_unit

const KM_TO_MILES = 0.621371;

/**
 * Check if courier uses miles
 */
export function usesMiles(preferredUnit?: string | null): boolean {
  return preferredUnit === 'mi';
}

/**
 * Format a distance value (stored as km in DB) for display
 */
export function formatDistance(km: number | null, preferredUnit?: string | null, decimals: number = 1): string {
  if (km === null || km === undefined) return '\u2014';
  const isMiles = usesMiles(preferredUnit);
  const value = isMiles ? km * KM_TO_MILES : km;
  const unit = isMiles ? 'Mi' : 'Km';
  return `${value.toFixed(decimals)}${unit}`;
}

/**
 * Format distance rounded (no decimals)
 */
export function formatDistanceRound(km: number | null, preferredUnit?: string | null): string {
  if (km === null || km === undefined) return '\u2014';
  const isMiles = usesMiles(preferredUnit);
  const value = isMiles ? km * KM_TO_MILES : km;
  const unit = isMiles ? 'Mi' : 'Km';
  return `${Math.round(value)}${unit}`;
}

/**
 * Get the unit label
 */
export function getDistanceUnit(preferredUnit?: string | null): string {
  return usesMiles(preferredUnit) ? 'Mi' : 'KM';
}

/**
 * Get "Per KM" or "Per Mi" label
 */
export function getPerDistanceLabel(preferredUnit?: string | null): string {
  return usesMiles(preferredUnit) ? 'Per Mi' : 'Per KM';
}

/**
 * Convert km value for display (without unit suffix)
 */
export function convertDistance(km: number | null, preferredUnit?: string | null, decimals: number = 1): string {
  if (km === null || km === undefined) return '\u2014';
  const isMiles = usesMiles(preferredUnit);
  const value = isMiles ? km * KM_TO_MILES : km;
  return value.toFixed(decimals);
}
