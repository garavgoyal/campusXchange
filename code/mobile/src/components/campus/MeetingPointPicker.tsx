import React, { useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MEETING_LOCATIONS } from '../../constants/categories';
import { colors, radius, fonts, shadow } from '../../constants/colors';
import { useCampusLocations } from '../../features/campus/hooks';
import { Screen } from '../ui/Screen';

type Props = {
  value: string | null;
  onChange: (name: string) => void;
  placeholder?: string;
  disabled?: boolean;
};

type Row = { name: string; sub: string | null; icon: 'location-outline' | 'home-outline' };

/**
 * One field that opens a searchable list of campus meeting points — instead of
 * showing all ~40 places as chips. Common spots first, then hostel receptions.
 */
export function MeetingPointPicker({ value, onChange, placeholder = 'Choose a meeting point', disabled }: Props) {
  const { hostels, spots, loading } = useCampusLocations();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    const fits = (r: Row) => !q || r.name.toLowerCase().includes(q) || (r.sub ?? '').toLowerCase().includes(q);
    const spotRows: Row[] = spots.length
      ? spots.map((s) => ({ name: s.name, sub: s.description ?? s.category, icon: 'location-outline' }))
      : MEETING_LOCATIONS.map((name) => ({ name, sub: null, icon: 'location-outline' }));
    const hostelRows: Row[] = hostels.map((h) => ({
      name: h.name,
      sub: [h.old_name, h.description].filter(Boolean).join(' · ') || null,
      icon: 'home-outline',
    }));
    return [
      { title: 'Common spots', data: spotRows.filter(fits) },
      { title: 'Hostel reception', data: hostelRows.filter(fits) },
    ].filter((s) => s.data.length);
  }, [spots, hostels, query]);

  function choose(name: string) {
    onChange(name);
    setQuery('');
    setOpen(false);
  }

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        disabled={disabled}
        style={[styles.field, disabled && styles.disabled]}
        accessibilityRole="button"
        accessibilityLabel={value ? `Meeting point: ${value}. Change` : placeholder}
      >
        <Ionicons name="location" size={16} color={value ? colors.primary : colors.textFaint} />
        <Text style={[styles.value, !value && styles.placeholder]} numberOfLines={1}>
          {value ?? placeholder}
        </Text>
        <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
      </Pressable>

      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
        <Screen style={styles.safe} edges={['top', 'bottom']}>
          <View style={styles.header}>
            <Text style={styles.title}>Meeting point</Text>
            <Pressable onPress={() => setOpen(false)} hitSlop={12} accessibilityLabel="Close">
              <Ionicons name="close" size={24} color={colors.text} />
            </Pressable>
          </View>
          <View style={styles.search}>
            <Ionicons name="search" size={16} color={colors.textFaint} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search, e.g. library, canteen, Agira"
              placeholderTextColor={colors.textFaint}
              style={styles.searchInput}
              autoCapitalize="none"
              autoFocus
            />
          </View>
          {loading && !spots.length ? (
            <ActivityIndicator color={colors.primary} style={styles.loader} />
          ) : (
            <SectionList
              sections={sections}
              keyExtractor={(r) => r.name}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.list}
              stickySectionHeadersEnabled={false}
              renderSectionHeader={({ section }) => <Text style={styles.section}>{section.title}</Text>}
              ListEmptyComponent={<Text style={styles.empty}>No place matches “{query}”.</Text>}
              renderItem={({ item }) => {
                const active = item.name === value;
                return (
                  <Pressable
                    onPress={() => choose(item.name)}
                    style={({ pressed }) => [styles.row, active && styles.rowActive, pressed && styles.pressed]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Ionicons name={item.icon} size={16} color={colors.primary} />
                    <View style={styles.flex}>
                      <Text style={styles.rowTitle}>{item.name}</Text>
                      {item.sub ? <Text style={styles.rowSub}>{item.sub}</Text> : null}
                    </View>
                    {active ? <Ionicons name="checkmark-circle" size={20} color={colors.primary} /> : null}
                  </Pressable>
                );
              }}
            />
          )}
        </Screen>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 46,
    paddingHorizontal: 12,
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  disabled: { opacity: 0.5 },
  value: { flex: 1, fontSize: 14, fontFamily: fonts.semibold, color: colors.text },
  placeholder: { color: colors.textFaint, fontFamily: fonts.regular },
  safe: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, paddingBottom: 10 },
  title: { fontSize: 20, fontFamily: fonts.displayBold, color: colors.text },
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
  loader: { marginTop: 40 },
  list: { padding: 16, paddingTop: 4, gap: 6 },
  section: { fontSize: 12, fontFamily: fonts.bold, color: colors.textMuted, marginTop: 14, marginBottom: 4, textTransform: 'uppercase' },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    backgroundColor: colors.glass,
    marginBottom: 6, ...shadow.card,
  },
  rowActive: { borderColor: colors.primary, backgroundColor: colors.primaryTint },
  pressed: { opacity: 0.7 },
  rowTitle: { fontSize: 14, fontFamily: fonts.bold, color: colors.text },
  rowSub: { fontSize: 12, fontFamily: fonts.regular, color: colors.textMuted, marginTop: 1 },
});
