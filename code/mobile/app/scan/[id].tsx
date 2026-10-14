import React, { useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import { Button } from '../../src/components/ui/Button';
import { ErrorText } from '../../src/components/ui/ErrorText';
import { colors, radius } from '../../src/constants/colors';
import { scanQr } from '../../src/features/transactions/api';

/**
 * The person RECEIVING the item scans the QR shown by the person handing it
 * over. If the camera can't read it (glare, cracked screen), the 8-character
 * code under the QR can be typed instead — the backend checks both the same way.
 */
export default function ScanScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const [manual, setManual] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The camera fires many times per second; only act on the first read.
  const handled = useRef(false);

  async function submit(token: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const deal = await scanQr(id, token);
      Alert.alert(
        deal.status === 'in_use' ? 'Handoff confirmed' : 'Confirmed',
        deal.status === 'in_use'
          ? 'Enjoy! Remember to return it by the due date.'
          : deal.type === 'lend'
            ? 'Item returned. Rent released and deposit refunded.'
            : 'Payment released to the seller. Deal complete.',
      );
      router.replace({ pathname: '/deal/[id]', params: { id } });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That code did not work');
      // Let the camera try again after a short pause.
      setTimeout(() => {
        handled.current = false;
      }, 1500);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Scan QR</Text>
      </View>

      <View style={styles.content}>
        <Text style={styles.sub}>
          Only scan once you have checked the item and taken its condition photos.
        </Text>

        <View style={styles.cameraBox}>
          {permission?.granted ? (
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={({ data }) => {
                if (handled.current || !data) return;
                handled.current = true;
                submit(data);
              }}
            />
          ) : (
            <View style={styles.noCamera}>
              <Ionicons name="camera-outline" size={30} color={colors.textMuted} />
              <Text style={styles.sub}>Camera access is needed to scan.</Text>
              <Button label="Allow camera" size="sm" onPress={requestPermission} />
            </View>
          )}
          <View pointerEvents="none" style={styles.frame} />
        </View>

        <ErrorText>{error}</ErrorText>

        <Text style={styles.or}>or type the code shown under the QR</Text>
        <View style={styles.manualRow}>
          <TextInput
            value={manual}
            onChangeText={(t) => setManual(t.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            placeholder="8-character code"
            placeholderTextColor={colors.textFaint}
            autoCapitalize="characters"
            maxLength={8}
            style={styles.input}
          />
          <Button
            label="Confirm"
            size="sm"
            loading={busy}
            disabled={manual.length < 6}
            onPress={() => submit(manual)}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingBottom: 10 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: colors.text },
  content: { padding: 16, gap: 14 },
  sub: { fontSize: 13, color: colors.textMuted, textAlign: 'center' },
  cameraBox: {
    height: 320,
    borderRadius: radius.sheet,
    overflow: 'hidden',
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  noCamera: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surfaceSunk,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 20,
  },
  frame: {
    width: 210,
    height: 210,
    borderWidth: 3,
    borderColor: colors.onBrand,
    borderRadius: 18,
    opacity: 0.85,
  },
  or: { fontSize: 12, color: colors.textMuted, textAlign: 'center' },
  manualRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  input: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
    paddingHorizontal: 12,
    fontSize: 17,
    letterSpacing: 3,
    fontWeight: '700',
    color: colors.text,
    backgroundColor: colors.surface,
  },
});
