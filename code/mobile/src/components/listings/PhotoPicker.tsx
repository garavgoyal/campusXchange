import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../constants/colors';

type Props = {
  uris: string[];
  onChange: (uris: string[]) => void;
  max?: number;
  disabled?: boolean;
};

/** Local photo picker — files are uploaded only when the listing is submitted. */
export function PhotoPicker({ uris, onChange, max = 4, disabled }: Props) {
  const full = uris.length >= max;

  async function addFromLibrary() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsMultipleSelection: true,
      selectionLimit: max - uris.length,
    });
    if (!result.canceled) {
      onChange([...uris, ...result.assets.map((a) => a.uri)].slice(0, max));
    }
  }

  async function addFromCamera() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return;

    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!result.canceled) onChange([...uris, result.assets[0].uri].slice(0, max));
  }

  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {uris.map((uri) => (
          <View key={uri} style={styles.thumbWrap}>
            <Image source={{ uri }} style={styles.thumb} resizeMode="cover" />
            <Pressable
              style={styles.remove}
              hitSlop={6}
              disabled={disabled}
              onPress={() => onChange(uris.filter((u) => u !== uri))}
              accessibilityLabel="Remove photo"
            >
              <Ionicons name="close" size={13} color="#fff" />
            </Pressable>
          </View>
        ))}

        {!full && (
          <>
            <Pressable style={styles.add} onPress={addFromLibrary} disabled={disabled}>
              <Ionicons name="images-outline" size={20} color={colors.primary} />
              <Text style={styles.addText}>Gallery</Text>
            </Pressable>
            <Pressable style={styles.add} onPress={addFromCamera} disabled={disabled}>
              <Ionicons name="camera-outline" size={20} color={colors.primary} />
              <Text style={styles.addText}>Camera</Text>
            </Pressable>
          </>
        )}
      </ScrollView>

      <Text style={styles.hint}>
        {uris.length}/{max} photos · the first one is used as the cover
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  row: { gap: 10, paddingRight: 16 },
  thumbWrap: { position: 'relative' },
  thumb: {
    width: 84,
    height: 84,
    borderRadius: 12,
    backgroundColor: colors.surfaceSunk,
    borderWidth: 1,
    borderColor: colors.border,
  },
  remove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  add: {
    width: 84,
    height: 84,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  addText: { color: colors.primary, fontSize: 11, fontWeight: '600' },
  hint: { color: colors.textMuted, fontSize: 12 },
});
