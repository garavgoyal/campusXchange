import React, { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Button } from '../../src/components/ui/Button';
import { ErrorText } from '../../src/components/ui/ErrorText';
import { startChat } from '../../src/features/chat/api';
import { deleteListing, fetchListing } from '../../src/features/listings/api';
import type { Listing } from '../../src/features/listings/types';
import { useProfile } from '../../src/features/profile/hooks';
import { colors } from '../../src/constants/colors';

/** The CTA wording differs by type, per the proposal's Section 4.4. */
const CTA: Record<Listing['type'], string> = {
  sell: 'Chat to negotiate',
  lend: 'Request to borrow',
  exchange: 'Propose exchange',
};

function priceLine(listing: Listing): string {
  if (listing.type === 'sell') return listing.price != null ? `₹${listing.price}` : 'Price on request';
  if (listing.type === 'lend') {
    return listing.rent_amount != null
      ? `₹${listing.rent_amount} per ${listing.rent_unit ?? 'day'}`
      : 'Rate on request';
  }
  const tags = listing.want_tags ?? [];
  return tags.length ? `Wants: ${tags.join(', ')}` : 'Open to offers';
}

export default function ListingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, profile } = useProfile();

  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    fetchListing(id)
      .then(setListing)
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load listing'))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleContact() {
    if (!session) {
      router.push('/(auth)/signup');
      return;
    }
    setError(null);
    setStarting(true);
    try {
      const chat = await startChat(id);
      router.push({ pathname: '/chat/[id]', params: { id: chat.id, listingId: id } });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the chat');
    } finally {
      setStarting(false);
    }
  }

  function confirmDelete() {
    if (!listing) return;
    Alert.alert(
      'Delete this listing?',
      `"${listing.title}" will be removed from the campus feed.`,
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setRemoving(true);
            try {
              await deleteListing(listing.id);
              router.replace('/(tabs)/history');
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Could not delete that listing');
              setRemoving(false);
            }
          },
        },
      ],
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      </SafeAreaView>
    );
  }

  if (!listing) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.content}>
          <ErrorText>{error ?? 'Listing not found'}</ErrorText>
          <Button label="Go back" variant="outline" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  const isOwner = profile?.id === listing.owner_id;
  const image = listing.images[0];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Button label="← Back" variant="outline" onPress={() => router.back()} />

        {image ? (
          <Image source={{ uri: image }} style={styles.hero} resizeMode="cover" />
        ) : (
          <View style={[styles.hero, styles.heroEmpty]}>
            <Ionicons name="image-outline" size={30} color={colors.textMuted} />
          </View>
        )}

        <Text style={styles.title}>{listing.title}</Text>
        <Text style={styles.price}>{priceLine(listing)}</Text>

        {listing.description ? (
          <Text style={styles.description}>{listing.description}</Text>
        ) : null}

        <View style={styles.metaCard}>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Category</Text>
            <Text style={styles.metaValue}>{listing.category}</Text>
          </View>
          {listing.condition ? (
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Condition</Text>
              <Text style={styles.metaValue}>{listing.condition}</Text>
            </View>
          ) : null}
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Meeting point</Text>
            <Text style={[styles.metaValue, listing.location_hidden && styles.locked]}>
              {listing.location_hidden
                ? 'Sign in to see'
                : (listing.meeting_location ?? 'Not set')}
            </Text>
          </View>
        </View>

        <ErrorText>{error}</ErrorText>

        {isOwner ? (
          <View style={styles.ownerBox}>
            <Text style={styles.ownNotice}>This is your listing.</Text>
            <Button
              label="Delete listing"
              variant="outline"
              loading={removing}
              onPress={confirmDelete}
              style={styles.deleteBtn}
            />
          </View>
        ) : (
          <Button label={CTA[listing.type]} loading={starting} onPress={handleContact} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 40, gap: 14 },
  loader: { marginTop: 64 },
  hero: { width: '100%', height: 220, borderRadius: 14, backgroundColor: colors.surfaceSunk },
  heroEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: { color: colors.text, fontSize: 22, fontWeight: '700' },
  price: { color: colors.primary, fontSize: 18, fontWeight: '700' },
  description: { color: colors.textMuted, fontSize: 15, lineHeight: 22 },
  metaCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  metaLabel: { color: colors.textMuted, fontSize: 13 },
  metaValue: { color: colors.text, fontSize: 14, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  locked: { color: colors.textMuted, fontStyle: 'italic', fontWeight: '400' },
  ownNotice: { color: colors.textMuted, fontSize: 14, textAlign: 'center' },
  ownerBox: { gap: 12 },
  deleteBtn: { borderColor: colors.error },
});
