import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../../constants/colors';
import type { Listing } from '../../features/listings/types';

type Props = {
  listing: Listing;
  onPress?: () => void;
};

/** Price line differs by type — that's the point of the listing_type enum. */
function priceParts(listing: Listing): { main: string; suffix?: string } {
  switch (listing.type) {
    case 'sell':
      return { main: listing.price != null ? `₹${listing.price}` : 'Ask' };
    case 'lend':
      return listing.rent_amount != null
        ? { main: `₹${listing.rent_amount}`, suffix: `/ ${listing.rent_unit ?? 'day'}` }
        : { main: 'Ask' };
    case 'exchange': {
      const tags = listing.want_tags ?? [];
      return { main: tags.length ? `Wants ${tags[0]}` : 'Open to offers' };
    }
  }
}

/** Grid card: photo on top, badge overlay, price, title, then location. */
export function ListingCard({ listing, onPress }: Props) {
  const image = listing.images[0];
  const { main, suffix } = priceParts(listing);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.media}>
        {image ? (
          <Image source={{ uri: image }} style={styles.image} resizeMode="cover" />
        ) : (
          <View style={[styles.image, styles.imageEmpty]}>
            <Ionicons name="image-outline" size={22} color={colors.textFaint} />
          </View>
        )}

        {listing.condition ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText} numberOfLines={1}>
              {listing.condition}
            </Text>
          </View>
        ) : null}

        <View style={styles.locationTag}>
          <Ionicons
            name={listing.location_hidden ? 'lock-closed' : 'location'}
            size={10}
            color={colors.onBrand}
          />
          <Text style={styles.locationText} numberOfLines={1}>
            {listing.location_hidden ? 'Sign in' : (listing.meeting_location ?? 'On campus')}
          </Text>
        </View>
      </View>

      <View style={styles.body}>
        <View style={styles.priceRow}>
          <Text style={styles.price} numberOfLines={1}>
            {main}
          </Text>
          {suffix ? <Text style={styles.priceSuffix}>{suffix}</Text> : null}
        </View>

        <Text style={styles.title} numberOfLines={2}>
          {listing.title}
        </Text>

        {listing.description ? (
          <Text style={styles.description} numberOfLines={1}>
            {listing.description}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  pressed: { opacity: 0.9 },
  media: { position: 'relative' },
  image: { width: '100%', height: 128, backgroundColor: colors.surfaceSunk },
  imageEmpty: { alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: colors.surface,
    borderRadius: radius.chip,
    paddingHorizontal: 8,
    paddingVertical: 3,
    maxWidth: '75%',
  },
  badgeText: { fontSize: 10, fontWeight: '700', color: colors.text },
  locationTag: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(23,23,31,0.72)',
    borderRadius: radius.chip,
    paddingHorizontal: 7,
    paddingVertical: 3,
    maxWidth: '88%',
  },
  locationText: { fontSize: 10, fontWeight: '600', color: colors.onBrand, flexShrink: 1 },
  body: { padding: 10, gap: 2 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  price: { fontSize: 16, fontWeight: '800', color: colors.text, flexShrink: 1 },
  priceSuffix: { fontSize: 11, fontWeight: '600', color: colors.textMuted },
  title: { fontSize: 13, fontWeight: '600', color: colors.text, lineHeight: 18 },
  description: { fontSize: 11, color: colors.textMuted },
});
