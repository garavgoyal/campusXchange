import React, { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../../constants/colors';
import { uploadConditionPhoto } from '../../features/transactions/api';
import type { ConditionPhoto, PhotoStage } from '../../features/transactions/types';

type Props = {
  dealId: string;
  stage: PhotoStage;
  photos: ConditionPhoto[];
  /** Show the "take photo" button. */
  canAdd: boolean;
  onAdded: () => void;
  onError: (message: string) => void;
};

const STAGE_LABEL: Record<PhotoStage, string> = {
  handoff: 'Condition at handoff',
  return: 'Condition at return',
};

/**
 * Before/after evidence. These are what an admin compares if a dispute is
 * raised, so taking them is required before the QR scan is accepted.
 */
export function ConditionPhotos({ dealId, stage, photos, canAdd, onAdded, onError }: Props) {
  const [uploading, setUploading] = useState(false);
  const mine = photos.filter((p) => p.stage === stage);

  async function take() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      onError('Camera permission is needed to photograph the item');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.6 });
    if (result.canceled) return;

    setUploading(true);
    try {
      await uploadConditionPhoto(dealId, stage, result.assets[0].uri);
      onAdded();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not upload that photo');
    } finally {
      setUploading(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{STAGE_LABEL[stage].toUpperCase()}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {mine.map((photo) =>
          photo.url ? (
            <Image key={photo.id} source={{ uri: photo.url }} style={styles.thumb} />
          ) : (
            <View key={photo.id} style={[styles.thumb, styles.empty]}>
              <Ionicons name="image-outline" size={18} color={colors.textFaint} />
            </View>
          ),
        )}
        {canAdd ? (
          <Pressable style={styles.add} onPress={take} disabled={uploading}>
            {uploading ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <>
                <Ionicons name="camera-outline" size={20} color={colors.primary} />
                <Text style={styles.addText}>Add photo</Text>
              </>
            )}
          </Pressable>
        ) : null}
        {!mine.length && !canAdd ? <Text style={styles.none}>No photos</Text> : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, color: colors.textMuted },
  row: { gap: 8, alignItems: 'center' },
  thumb: { width: 76, height: 76, borderRadius: 12, backgroundColor: colors.surfaceSunk },
  empty: { alignItems: 'center', justifyContent: 'center' },
  add: {
    width: 76,
    height: 76,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  addText: { fontSize: 11, color: colors.primary, fontWeight: '600' },
  none: { fontSize: 13, color: colors.textFaint, borderRadius: radius.card },
});
