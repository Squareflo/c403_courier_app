import { useCallback, useRef } from 'react';
import { Audio, InterruptionModeIOS, InterruptionModeAndroid } from 'expo-av';
import * as Haptics from 'expo-haptics';

const CLICK_SOUND_URL =
  'https://res.cloudinary.com/chowlocal/video/upload/v1772033392/346126__magicturtle985__click_t7j3zj.mp3';

/**
 * Hook that provides a `tapFeedback()` function.
 * Call it at the start of any button's onPress handler to play
 * a click sound + a light haptic tap.
 *
 * IMPORTANT: Audio mode is set to MixWithOthers so background music
 * from other apps is NOT ducked or interrupted.
 *
 * Usage:
 *   const { tapFeedback } = useButtonFeedback();
 *   <TouchableOpacity onPress={() => { tapFeedback(); doSomething(); }}>
 */
export function useButtonFeedback() {
  // Cache the sound object so we don't re-download every tap
  const soundRef = useRef<Audio.Sound | null>(null);
  const loadingRef = useRef(false);
  const audioModeSetRef = useRef(false);

  const tapFeedback = useCallback(async () => {
    // 1. Haptic — fire and forget (instant, no await needed)
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // Haptics not available (e.g. simulator)
    }

    // 2. Sound — load once, replay on subsequent taps
    try {
      // Set audio mode ONCE to MixWithOthers — never ducks background audio
      if (!audioModeSetRef.current) {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: false,
          staysActiveInBackground: false,
          interruptionModeIOS: InterruptionModeIOS.MixWithOthers,
          interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
          shouldDuckAndroid: false,
          playThroughEarpieceAndroid: false,
        });
        audioModeSetRef.current = true;
      }

      if (soundRef.current) {
        // Rewind and replay
        await soundRef.current.setPositionAsync(0);
        await soundRef.current.playAsync();
      } else if (!loadingRef.current) {
        loadingRef.current = true;
        const { sound } = await Audio.Sound.createAsync(
          { uri: CLICK_SOUND_URL },
          { shouldPlay: true, volume: 0.5 },
        );
        soundRef.current = sound;
        loadingRef.current = false;
      }
    } catch (err) {
      // Sound failed — not critical, UI still works
      console.warn('[useButtonFeedback] Sound error:', err);
      loadingRef.current = false;
    }
  }, []);

  return { tapFeedback };
}
