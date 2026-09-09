import React, { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { Banner } from '../../src/components/ui/Banner';
import { Button } from '../../src/components/ui/Button';
import { ErrorText } from '../../src/components/ui/ErrorText';
import { uploadIdCard } from '../../src/features/profile/api';
import { colors, radius, typography } from '../../src/constants/colors';

export default function IdCardScreen() {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function pickFromLibrary() {
    setError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      return setError('Photo library access is needed to upload your ID card.');
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsEditing: true,
    });
    if (!result.canceled) setImageUri(result.assets[0].uri);
  }

  async function takePhoto() {
    setError(null);
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      return setError('Camera access is needed to photograph your ID card.');
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: true });
    if (!result.canceled) setImageUri(result.assets[0].uri);
  }

  async function handleSubmit() {
    setError(null);
    if (!imageUri) return setError('Add a photo of your student ID first.');

    setLoading(true);
    const { error: uploadError } = await uploadIdCard(imageUri);
    setLoading(false);

    if (uploadError) return setError(uploadError);
    router.replace('/(tabs)');
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Verify your student ID</Text>
        <Text style={styles.subtitle}>
          Upload a clear photo of your TIET identity card. An admin checks it — you can keep
          using the app while it&apos;s pending.
        </Text>

        <Text style={styles.label}>Student ID card</Text>

        {imageUri ? (
          <View style={styles.previewWrap}>
            <Image source={{ uri: imageUri }} style={styles.preview} resizeMode="cover" />
            <Pressable style={styles.change} onPress={pickFromLibrary} hitSlop={6}>
              <Ionicons name="pencil" size={12} color={colors.text} />
              <Text style={styles.changeText}>Change</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.placeholder}>
            <Ionicons name="card-outline" size={28} color={colors.textFaint} />
            <Text style={styles.placeholderText}>No photo added yet</Text>
          </View>
        )}

        <View style={styles.actions}>
          <View style={styles.action}>
            <Button label="Take photo" variant="outline" onPress={takePhoto} />
          </View>
          <View style={styles.action}>
            <Button label="Choose photo" variant="outline" onPress={pickFromLibrary} />
          </View>
        </View>

        <ErrorText>{error}</ErrorText>

        <Banner
          icon="lock-closed"
          title="Kept private"
          message="Your ID is stored privately and only ever seen by a campus admin reviewing verifications. Other students never see it."
        />

        <View style={styles.submit}>
          <Button label="Submit for verification" loading={loading} onPress={handleSubmit} />
        </View>

        <Pressable style={styles.skip} onPress={() => router.replace('/(tabs)')}>
          <Text style={styles.skipText}>Skip for now</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingTop: 40, paddingBottom: 40 },
  title: { fontSize: 24, fontWeight: '800', color: colors.text, marginBottom: 6 },
  subtitle: { fontSize: 14, color: colors.textMuted, lineHeight: 20, marginBottom: 24 },
  label: {
    ...typography.label,
    color: colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  previewWrap: { position: 'relative', marginBottom: 16 },
  preview: {
    width: '100%',
    height: 200,
    borderRadius: radius.card,
    backgroundColor: colors.surfaceSunk,
  },
  change: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.surface,
    borderRadius: radius.chip,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  changeText: { fontSize: 12, fontWeight: '700', color: colors.text },
  placeholder: {
    height: 200,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
  },
  placeholderText: { color: colors.textFaint, fontSize: 13 },
  actions: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  action: { flex: 1 },
  submit: { marginTop: 18 },
  skip: { marginTop: 16, alignItems: 'center' },
  skipText: { color: colors.textMuted, fontSize: 14 },
});
