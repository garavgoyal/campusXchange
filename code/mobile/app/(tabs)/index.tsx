import React, { useCallback, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { HostelPicker } from '../../src/components/campus/HostelPicker';
import { ListingCard } from '../../src/components/listings/ListingCard';
import { Banner } from '../../src/components/ui/Banner';
import { Chips } from '../../src/components/ui/Chips';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { ErrorText } from '../../src/components/ui/ErrorText';
import { Segmented } from '../../src/components/ui/Segmented';
import { CATEGORIES, LISTING_MODES } from '../../src/constants/categories';
import { colors, radius, fonts, shadow } from '../../src/constants/colors';
import { useListings } from '../../src/features/listings/hooks';
import type { ListingType } from '../../src/features/listings/types';
import { updateProfile } from '../../src/features/profile/api';
import { useProfile } from '../../src/features/profile/hooks';
import { useUnreadCount } from '../../src/features/notifications/hooks';
import { VerifyNotice } from '../../src/components/ui/VerifyNotice';
import { Screen } from '../../src/components/ui/Screen';
import { Appear, PressScale, PulseDot } from '../../src/components/ui/motion';

export default function FeedScreen() {
  const { isSignedIn, profile, reload } = useProfile();
  const unread = useUnreadCount();
  const [mode, setMode] = useState<ListingType>('sell');
  const [category, setCategory] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'newest' | 'nearest'>('newest');
  const [pickingHostel, setPickingHostel] = useState(false);
  const hostel = profile?.hostel ?? null;
  // "Nearest" only means something once we know your hostel.
  const effectiveSort = sort === 'nearest' && hostel ? 'nearest' : 'newest';

  function chooseSort(next: 'newest' | 'nearest') {
    if (next === 'nearest' && !hostel) {
      if (!isSignedIn) return router.push('/(auth)/signup');
      setPickingHostel(true);
    }
    setSort(next);
  }

  async function saveHostel(name: string | null) {
    const { error } = await updateProfile({ hostel: name });
    if (error) throw new Error(error);
    await reload();
  }

  const { listings, loading, refreshing, loadingMore, error, refresh, loadMore } = useListings({
    type: mode,
    category: category ?? undefined,
    search: search || undefined,
    sort: effectiveSort,
  }, { reloadKey: hostel });

  // Pick up a hostel changed on the Profile tab when you come back here.
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  return (
    <Screen style={styles.safe} edges={['top']}>
      <View style={styles.appBar}>
        <Image source={require('../../assets/logo.png')} style={styles.logo} resizeMode="contain" />
        <View style={styles.appBarText}>
          <Text style={styles.brand}>CampusXchange</Text>
          <View style={styles.brandPill}>
            <Ionicons name="school" size={10} color={colors.primary} />
            <Text style={styles.brandSub}>Thapar Institute</Text>
          </View>
        </View>
        {isSignedIn ? (
          <PressScale
            onPress={() => router.push('/notifications')}
            hitSlop={8}
            style={styles.bell}
            accessibilityLabel={unread ? `${unread} unread notifications` : 'Notifications'}
          >
            <Ionicons name="notifications-outline" size={21} color={colors.text} />
            {unread > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text>
              </View>
            ) : null}
          </PressScale>
        ) : null}
      </View>

      <FlatList
        data={listings}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.column}
        contentContainerStyle={styles.content}
        renderItem={({ item, index }) => (
          <Appear index={index % 8} style={styles.cell}>
            <ListingCard listing={item} onPress={() => router.push(`/listing/${item.id}`)} />
          </Appear>
        )}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />
        }
        keyboardShouldPersistTaps="handled"
        onEndReached={loadMore}
        onEndReachedThreshold={0.6}
        ListHeaderComponent={
          <View style={styles.header}>
            <Appear>
              <Text style={styles.hello}>
                {isSignedIn && profile?.name ? `Hey ${profile.name.split(' ')[0]} 👋` : 'Find it on campus'}
              </Text>
              {isSignedIn ? (
                <Pressable onPress={() => setPickingHostel(true)} style={styles.hostelRow} hitSlop={6}>
                  <Ionicons name="location-outline" size={14} color={colors.textMuted} />
                  <Text style={styles.hostelText}>{hostel ?? 'Set your hostel'}</Text>
                  <Ionicons name="chevron-down" size={13} color={colors.textMuted} />
                </Pressable>
              ) : (
                <Text style={styles.hostelText}>Buy, rent or swap with verified Thapar students.</Text>
              )}
            </Appear>

            <View style={styles.search}>
              <Ionicons name="search" size={18} color={colors.primary} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search drafters, cycles, textbooks…"
                placeholderTextColor={colors.textFaint}
                style={styles.searchInput}
                autoCapitalize="none"
                returnKeyType="search"
              />
            </View>

            <VerifyNotice profile={profile} />

            <Segmented options={LISTING_MODES} value={mode} onChange={setMode} />

            <Chips
              options={CATEGORIES}
              value={category}
              onChange={setCategory}
              allLabel="All items"
            />

            <View style={styles.sortRow}>
              <View style={styles.sectionTitleRow}>
                <PulseDot color={colors.accent} />
                <Text style={styles.sectionTitle} numberOfLines={1}>
                  {effectiveSort === 'nearest' ? 'Near your hostel' : 'Fresh on campus'}
                </Text>
              </View>
              {(['newest', 'nearest'] as const).map((key) => {
                const active = effectiveSort === key;
                return (
                  <Pressable
                    key={key}
                    onPress={() => chooseSort(key)}
                    style={[styles.sortChip, active && styles.sortChipOn]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Ionicons
                      name={key === 'newest' ? 'time-outline' : 'navigate-outline'}
                      size={13}
                      color={active ? colors.onBrand : colors.textMuted}
                    />
                    <Text style={[styles.sortText, active && styles.sortTextOn]}>
                      {key === 'newest' ? 'Newest' : 'Nearest'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {!isSignedIn ? (
              <Banner
                icon="eye-outline"
                tone="neutral"
                title="Browsing as a guest"
                message="Sign in with your @thapar.edu email to see meeting points and message sellers."
              />
            ) : null}

            <ErrorText>{error}</ErrorText>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={colors.primary} style={styles.loader} />
          ) : (
            <EmptyState
              icon="search-outline"
              title="Nothing here yet"
              message={
                search || category
                  ? 'Try a different category or search term.'
                  : 'No approved listings in this section yet.'
              }
            />
          )
        }
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator color={colors.primary} style={styles.moreLoader} />
          ) : listings.length ? (
            <View style={styles.footer}>
              <Banner
                icon="shield-checkmark"
                title="Safe campus exchange zones"
                message="Meet at busy, well-lit spots — Library foyer, academic blocks and hostel gates."
              />
            </View>
          ) : null
        }
      />
      <HostelPicker
        visible={pickingHostel}
        current={hostel}
        onSelect={saveHostel}
        onClose={() => setPickingHostel(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  sortRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  sectionTitleRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 18, fontFamily: fonts.displayBold, color: colors.text, letterSpacing: -0.3, flexShrink: 1 },
  sortChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.chip,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    backgroundColor: colors.glass,
  },
  sortChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  sortText: { fontSize: 12, fontFamily: fonts.bold, color: colors.textMuted },
  sortTextOn: { color: colors.onBrand },
  hello: { fontSize: 28, fontFamily: fonts.displayBold, color: colors.text, letterSpacing: -0.6 },
  hostelRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2, alignSelf: 'flex-start' },
  hostelText: { fontSize: 13, fontFamily: fonts.medium, color: colors.textMuted, marginTop: 2 },
  cell: { flex: 1 },
  safe: { flex: 1, backgroundColor: colors.background },
  appBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  logo: { width: 36, height: 36, borderRadius: 11 },
  appBarText: { flex: 1, gap: 2 },
  brand: { fontSize: 17, fontFamily: fonts.displayBold, color: colors.text, letterSpacing: -0.2 },
  brandPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: colors.primaryTint,
    borderRadius: radius.chip,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  brandSub: { fontSize: 10, fontFamily: fonts.bold, color: colors.primary },
  bell: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.glassStrong,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    ...shadow.card,
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 10, fontFamily: fonts.extrabold },
  content: { paddingHorizontal: 16, paddingBottom: 24 },
  header: { gap: 14, paddingBottom: 16 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: colors.glassStrong,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.input + 2,
    paddingHorizontal: 14,
    height: 50,
    ...shadow.card,
  },
  searchInput: { flex: 1, fontSize: 14, fontFamily: fonts.regular, color: colors.text, padding: 0 },
  column: { gap: 12, marginBottom: 12 },
  moreLoader: { marginVertical: 16 },
  loader: { marginTop: 56 },
  footer: { paddingTop: 8 },
});
