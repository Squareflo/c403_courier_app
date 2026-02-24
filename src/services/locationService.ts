/**
 * Location Service
 * Handles device location tracking and updates to the server.
 */

import * as Location from 'expo-location';
import { updateCourierLocationInDB } from './api';

const LOCATION_UPDATE_INTERVAL = 30000; // 30 seconds

let locationSubscription: Location.LocationSubscription | null = null;
let updateInterval: ReturnType<typeof setInterval> | null = null;
let lastLocation: { latitude: number; longitude: number } | null = null;

/**
 * Request location permissions
 */
export async function requestLocationPermission(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    console.warn('[Location] Permission denied');
    return false;
  }
  return true;
}

/**
 * Get current device location
 */
export async function getCurrentLocation(): Promise<{ latitude: number; longitude: number } | null> {
  try {
    const hasPermission = await requestLocationPermission();
    if (!hasPermission) return null;

    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });

    lastLocation = {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    };

    return lastLocation;
  } catch (error) {
    console.error('[Location] Error getting current location:', error);
    return null;
  }
}

/**
 * Start tracking location and periodically update the server
 */
export async function startLocationTracking(courierId: string): Promise<void> {
  const hasPermission = await requestLocationPermission();
  if (!hasPermission) return;

  // Get initial location and update server
  const initialLocation = await getCurrentLocation();
  if (initialLocation) {
    try {
      await updateCourierLocationInDB(
        courierId,
        initialLocation.latitude,
        initialLocation.longitude
      );
    } catch (error) {
      console.error('[Location] Error updating initial location:', error);
    }
  }

  // Watch for location changes
  locationSubscription = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.High,
      distanceInterval: 50, // meters
      timeInterval: 10000, // 10 seconds
    },
    (location) => {
      lastLocation = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };
    }
  );

  // Periodically send location to the server
  updateInterval = setInterval(async () => {
    if (lastLocation) {
      try {
        await updateCourierLocationInDB(
          courierId,
          lastLocation.latitude,
          lastLocation.longitude
        );
      } catch (error) {
        console.error('[Location] Error updating location:', error);
      }
    }
  }, LOCATION_UPDATE_INTERVAL);
}

/**
 * Stop tracking location
 */
export function stopLocationTracking(): void {
  if (locationSubscription) {
    locationSubscription.remove();
    locationSubscription = null;
  }
  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
  }
  lastLocation = null;
}

/**
 * Get the last known location
 */
export function getLastKnownLocation(): { latitude: number; longitude: number } | null {
  return lastLocation;
}
