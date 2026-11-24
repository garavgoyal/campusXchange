import React, { useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { colors, radius, fonts, shadow } from '../../constants/colors';
import { useCampusLocations } from '../../features/campus/hooks';
import { Screen } from '../ui/Screen';

type Props = {
  visible: boolean;
  current: string | null;
  /** Resolves when saved; throw to show an error and keep the picker open. */
  onSelect: (hostel: string | null) => Promise<void>;
  onClose: () => void;
};

/**
 * Choose your hostel from the real TIET list. It only decides the order of
 * your own feed (nearest meeting points first), so it can be changed any time.
 */
export function HostelPicker({ visible, current, onSelect, onClose }: Props) {
  const { hostels, loading } = useCampusLocations();
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return hostels;
    return hostels.filter((h) =>
      [h.name, h.old_name ?? '', h.description ?? ''].some((v) => v.toLowerCase().includes(q)),
    );
  }, [hostels, query]);

  async function choose(name: string | null) {
    setSaving(name ?? '__clear__');
    setError(null);
    try {
      await onSelect(name);
      setQuery('');
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your hostel');
    } finally {
      setSaving(null);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <Screen style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <View style={styles.flex}>
            <Text style={styles.title}>Your hostel</Text>
            <Text style={styles.sub}>
              We show items with the nearest meeting points first. Only your own feed uses this.
            </Text>
          </View>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close">
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>
        </View>

        <View style={styles.search}>
          <Ionicons name="search" size={16} color={colors.textFaint} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search, e.g. Agira or Hostel-A"
            placeholderTextColor={colors.textFaint}
            style={styles.searchInput}
            autoCapitalize="none"
          />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {loading ? (
          <ActivityIndicator color={colors.primary} style={styles.loader} />
        ) : (
          <FlatList
            data={shown}
            keyExtractor={(h) => h.name}
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<Text style={styles.empty}>No hostel matches “{query}”.</Text>}
            renderItem={({ item }) => {
              const active = item.name === current;
              const sub = [item.old_name, item.description].filter(Boolean).join(' · ');
              return (
                <Pressable
                  onPress={() => choose(item.name)}
                  disabled={!!saving}
                  style={({ pressed }) => [styles.row, active && styles.rowActive, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <View style={styles.rowIcon}>
                    <Ionicons name="home" size={15} color={colors.primary} />
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.rowTitle}>{item.name}</Text>
                    {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
                  </View>
                  {saving === item.name ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : active ? (
                    <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                  ) : null}
                </Pressable>
              );
            }}
            ListFooterComponent={
              current ? (
                <Pressable onPress={() => choose(null)} style={styles.clear} disabled={!!saving}>
                  <Text style={styles.clearText}>Don't use a hostel (show newest first)</Text>
                </Pressable>
              ) : null
            }
          />
        )}
      </Screen>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 16, paddingBottom: 10 },
  title: { fontSize: 20, fontFamily: fonts.displayBold, color: colors.text },
  sub: { fontSize: 13, fontFamily: fonts.regular, color: colors.textMuted, marginTop: 4, lineHeight: 18 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    paddingHorizontal: 12,
    height: 42,
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  searchInput: { flex: 1, fontSize: 14, fontFamily: fonts.regular, color: colors.text },
  error: { color: colors.error, fontSize: 13, fontFamily: fonts.regular, marginHorizontal: 16, marginTop: 8 },
  loader: { marginTop: 40 },
  list: { padding: 16, gap: 8 },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    backgroundColor: colors.glass, ...shadow.card,
  },
  rowActive: { borderColor: colors.primary, backgroundColor: colors.primaryTint },
  pressed: { opacity: 0.7 },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryTint,
  },
  rowTitle: { fontSize: 15, fontFamily: fonts.bold, color: colors.text },
  rowSub: { fontSize: 12, fontFamily: fonts.regular, color: colors.textMuted, marginTop: 2 },
  clear: { paddingVertical: 14, alignItems: 'center' },
  clearText: { fontSize: 13, fontFamily: fonts.regular, color: colors.textMuted, textDecorationLine: 'underline' },
});
