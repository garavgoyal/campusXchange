import React, { useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  FlatList,
  Image,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { colors, fonts } from '../../constants/colors';

type Props = {
  images: string[];
  height?: number;
};

/**
 * Swipeable photo gallery: page through every photo, dots + "2/4" counter,
 * tap a thumbnail to jump, tap the photo to open it full screen.
 */
export function PhotoGallery({ images, height = 260 }: Props) {
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const [viewer, setViewer] = useState(false);
  const pager = useRef<ScrollView>(null);

  if (!images.length) {
    return (
      <View style={[styles.frame, styles.empty, { height }]}>
        <Ionicons name="image-outline" size={30} color={colors.textMuted} />
      </View>
    );
  }

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (!width) return;
    const next = Math.round(e.nativeEvent.contentOffset.x / width);
    if (next !== index) setIndex(Math.max(0, Math.min(images.length - 1, next)));
  }

  function jump(i: number) {
    setIndex(i);
    pager.current?.scrollTo({ x: i * width, animated: true });
  }

  return (
    <View style={styles.wrap}>
      <View style={[styles.frame, { height }]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width ? (
          <ScrollView
            ref={pager}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={onScroll}
            scrollEventThrottle={16}
          >
            {images.map((uri, i) => (
              <Pressable key={`${uri}-${i}`} onPress={() => setViewer(true)} accessibilityLabel={`Photo ${i + 1} of ${images.length}`}>
                <Image source={{ uri }} style={{ width, height }} resizeMode="cover" />
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        {images.length > 1 ? (
          <>
            <View style={styles.counter}>
              <Text style={styles.counterText}>
                {index + 1}/{images.length}
              </Text>
            </View>
            <View style={styles.dots}>
              {images.map((_, i) => (
                <View key={i} style={[styles.dot, i === index && styles.dotOn]} />
              ))}
            </View>
          </>
        ) : null}
      </View>

      {images.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbs}>
          {images.map((uri, i) => (
            <Pressable key={`t-${uri}-${i}`} onPress={() => jump(i)}>
              <Image source={{ uri }} style={[styles.thumb, i === index && styles.thumbOn]} />
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      <PhotoViewer images={images} start={index} visible={viewer} onClose={() => setViewer(false)} />
    </View>
  );
}

/** Full-screen, swipeable viewer. Also used for the photos in an exchange offer. */
export function PhotoViewer({
  images,
  start,
  visible,
  onClose,
}: {
  images: string[];
  start: number;
  visible: boolean;
  onClose: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const [index, setIndex] = useState(start);
  const list = useRef<FlatList<string>>(null);

  useEffect(() => {
    if (visible) setIndex(start);
  }, [visible, start]);

  function go(next: number) {
    const i = Math.max(0, Math.min(images.length - 1, next));
    setIndex(i);
    list.current?.scrollToIndex({ index: i, animated: true });
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.viewer}>
        {visible ? (
          <FlatList
            // Remount per opening so it always starts on the photo that was tapped.
            key={`viewer-${start}`}
            ref={list}
            data={images}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={Math.min(start, Math.max(0, images.length - 1))}
            getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
            keyExtractor={(uri, i) => `v-${uri}-${i}`}
            onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
            renderItem={({ item }) => <Image source={{ uri: item }} style={{ width, height }} resizeMode="contain" />}
          />
        ) : null}
        <Pressable style={styles.close} onPress={onClose} hitSlop={12} accessibilityLabel="Close photos">
          <Ionicons name="close" size={26} color="#fff" />
        </Pressable>
        {images.length > 1 ? (
          <View style={styles.viewerBar}>
            <Pressable onPress={() => go(index - 1)} disabled={index === 0} hitSlop={10} accessibilityLabel="Previous photo">
              <Ionicons name="chevron-back" size={26} color={index === 0 ? 'rgba(255,255,255,0.3)' : '#fff'} />
            </Pressable>
            <Text style={styles.viewerCount}>
              {Math.min(images.length, index + 1)} / {images.length}
            </Text>
            <Pressable onPress={() => go(index + 1)} disabled={index === images.length - 1} hitSlop={10} accessibilityLabel="Next photo">
              <Ionicons name="chevron-forward" size={26} color={index === images.length - 1 ? 'rgba(255,255,255,0.3)' : '#fff'} />
            </Pressable>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  frame: {
    width: '100%',
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: colors.surfaceSunk,
  },
  empty: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  counter: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  counterText: { color: '#fff', fontSize: 12, fontFamily: fonts.bold },
  dots: {
    position: 'absolute',
    bottom: 10,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.55)' },
  dotOn: { backgroundColor: '#fff', width: 18 },
  thumbs: { gap: 8 },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: colors.surfaceSunk,
    borderWidth: 2,
    borderColor: 'transparent',
    opacity: 0.7,
  },
  thumbOn: { borderColor: colors.primary, opacity: 1 },
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center' },
  close: { position: 'absolute', top: 48, right: 20 },
  viewerBar: {
    position: 'absolute',
    bottom: 36,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
  },
  viewerCount: { color: '#fff', fontSize: 14, fontFamily: fonts.semibold, minWidth: 44, textAlign: 'center' },
});
