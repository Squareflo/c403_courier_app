import React, { useRef, useState } from 'react';
import { Animated, Dimensions, PanResponder, StyleSheet, Text, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { fontFamily } from '../../constants/typography';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface SlideToOnlineProps {
  onSlideComplete: () => void;
  height?: number;
}

export default function SlideToOnline({ onSlideComplete, height = 64 }: SlideToOnlineProps) {
  const [trackWidth, setTrackWidth] = useState(0);
  const translateX = useRef(new Animated.Value(0)).current;
  const THUMB_SIZE = height - 8;
  const maxSlide = trackWidth - THUMB_SIZE - 8;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gestureState) => {
        const newX = Math.max(0, Math.min(gestureState.dx, maxSlide));
        translateX.setValue(newX);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx >= maxSlide * 0.7) {
          Animated.spring(translateX, {
            toValue: maxSlide,
            useNativeDriver: true,
          }).start(() => {
            onSlideComplete();
            setTimeout(() => {
              Animated.spring(translateX, {
                toValue: 0,
                useNativeDriver: true,
              }).start();
            }, 500);
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

  return (
    <View
      style={[styles.track, { height }]}
      onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
    >
      <Text style={styles.label}>Slide To Go Online</Text>
      <Animated.View
        style={[
          styles.thumb,
          {
            width: THUMB_SIZE,
            height: THUMB_SIZE,
            borderRadius: THUMB_SIZE / 2,
            transform: [{ translateX }],
          },
        ]}
        {...panResponder.panHandlers}
      >
        <ChevronRight size={20} color="#fff" strokeWidth={3} />
        <ChevronRight size={20} color="#fff" strokeWidth={3} style={{ marginLeft: -10 }} />
        <ChevronRight size={20} color="#fff" strokeWidth={3} style={{ marginLeft: -10 }} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    backgroundColor: '#27d20b',
    borderRadius: 999,
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
    left: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
