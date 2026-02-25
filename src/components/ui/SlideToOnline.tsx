import React, { useCallback, useRef, useState } from 'react';
import {
  Animated,
  LayoutChangeEvent,
  PanResponder,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { fontFamily } from '../../constants/typography';

interface SlideToOnlineProps {
  onSlideComplete: () => void;
  height?: number;
}

export default function SlideToOnline({ onSlideComplete, height = 64 }: SlideToOnlineProps) {
  const THUMB_SIZE = height - 8;
  const BORDER_RADIUS = 10;
  const PADDING = 4;

  const translateX = useRef(new Animated.Value(0)).current;
  const trackWidthRef = useRef(0);
  const completedRef = useRef(false);
  const onSlideCompleteRef = useRef(onSlideComplete);
  onSlideCompleteRef.current = onSlideComplete;

  const [ready, setReady] = useState(false);

  const getMax = () => Math.max(0, trackWidthRef.current - THUMB_SIZE - PADDING * 2);

  const panResponder = useRef(
    PanResponder.create({
      // Capture touch BEFORE ScrollView can grab it
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false, // Don't let ScrollView steal it
      onPanResponderGrant: () => {
        translateX.stopAnimation();
        completedRef.current = false;
      },
      onPanResponderMove: (_, gs) => {
        const max = getMax();
        if (max <= 0) return;
        const clamped = Math.max(0, Math.min(gs.dx, max));
        translateX.setValue(clamped);
      },
      onPanResponderRelease: (_, gs) => {
        const max = getMax();
        if (max <= 0) return;

        if (gs.dx >= max * 0.7 && !completedRef.current) {
          completedRef.current = true;
          Animated.spring(translateX, {
            toValue: max,
            useNativeDriver: true,
            bounciness: 0,
          }).start(() => {
            onSlideCompleteRef.current();
            setTimeout(() => {
              completedRef.current = false;
              Animated.spring(translateX, {
                toValue: 0,
                useNativeDriver: true,
              }).start();
            }, 600);
          });
        } else {
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    trackWidthRef.current = e.nativeEvent.layout.width;
    if (!ready) setReady(true);
  }, [ready]);

  return (
    <View
      style={[styles.track, { height, borderRadius: BORDER_RADIUS }]}
      onLayout={onLayout}
    >
      <Text style={styles.label}>Slide To Go Online</Text>

      {ready && (
        <Animated.View
          {...panResponder.panHandlers}
          style={[
            styles.thumb,
            {
              width: THUMB_SIZE,
              height: THUMB_SIZE,
              borderRadius: BORDER_RADIUS - 2,
              left: PADDING,
              transform: [{ translateX }],
            },
          ]}
        >
          <ChevronRight size={20} color="#fff" strokeWidth={3} />
          <ChevronRight size={20} color="#fff" strokeWidth={3} style={{ marginLeft: -10 }} />
          <ChevronRight size={20} color="#fff" strokeWidth={3} style={{ marginLeft: -10 }} />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    backgroundColor: '#27d20b',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  label: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
    color: '#fff',
    position: 'absolute',
    textAlign: 'center',
    width: '100%',
  },
  thumb: {
    backgroundColor: 'rgba(255,255,255,0.3)',
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
