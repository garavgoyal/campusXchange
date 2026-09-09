import React, { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ListingCard } from '../../src/components/listings/ListingCard';
import { Banner } from '../../src/components/ui/Banner';
import { Chips } from '../../src/components/ui/Chips';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { ErrorText } from '../../src/components/ui/ErrorText';
import { Segmented } from '../../src/components/ui/Segmented';
import { CATEGORIES, LISTING_MODES } from '../../src/constants/categories';
import { colors, radius } from '../../src/constants/colors';
import { useListings } from '../../src/features/listings/hooks';
import type { ListingType } from '../../src/features/listings/types';
import { useProfile } from '../../src/features/profile/hooks';

export default function FeedScreen() {
  const { isSignedIn } = useProfile();
  const [mode, setMode] = useState<ListingType>('sell');
  const [category, setCategory] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const { listings, loading, refreshing, error, refresh } = useListings({
    type: mode,
    category: category ?? undefined,
    search: search || undefined,
  });

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.appBar}>
        <Image source={require('../../assets/logo.png')} style={styles.logo} resizeMode="contain" />
        <View style={styles.appBarText}>
          <Text style={styles.brand}>CampusXchange</Text>
          <Text style={styles.brandSub}>Thapar Institute</Text>
        </View>
      </View>

      <FlatList
        data={listings}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.column}
        contentContainerStyle={styles.content}
        renderItem={({ item }) => (
          <ListingCard listing={item} onPress={() => router.push(`/listing/${item.id}`)} />
        )}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />
        }
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.search}>
              <Ionicons name="search" size={17} color={colors.textFaint} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search books, lab gear, cycles…"
                placeholderTextColor={colors.textFaint}
                style={styles.searchInput}
                autoCapitalize="none"
                returnKeyType="search"
              />
            </View>

            <Segmented options={LISTING_MODES} value={mode} onChange={setMode} />

            <Chips
              options={CATEGORIES}
              value={category}
              onChange={setCategory}
              allLabel="All items"
            />

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
          listings.length ? (
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  appBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  logo: { width: 34, height: 34, borderRadius: 9 },
  appBarText: { flex: 1 },
  brand: { fontSize: 17, fontWeight: '800', color: colors.text },
  brandSub: { fontSize: 11, color: colors.textMuted },
  content: { paddingHorizontal: 16, paddingBottom: 24 },
  header: { gap: 14, paddingBottom: 16 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
    paddingHorizontal: 13,
    height: 48,
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.text, padding: 0 },
  column: { gap: 12, marginBottom: 12 },
  loader: { marginTop: 56 },
  footer: { paddingTop: 8 },
});
