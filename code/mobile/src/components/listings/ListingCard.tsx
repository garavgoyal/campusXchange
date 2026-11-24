import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Image, StyleSheet, Text, View } from 'react-native';
import { PressScale } from '../ui/motion';
import { formatDistanceShort } from '../../utils/formatDistance';
import { colors, radius, fonts, shadow } from '../../constants/colors';
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
    <PressScale onPress={onPress} accessibilityRole="button" style={styles.card}>
      <View style={styles.media}>
        {image ? (
          <Image source={{ uri: image }} style={styles.image} resizeMode="cover" />
        ) : (
          <View style={[styles.image, styles.imageEmpty]}>
            <Ionicons name="image-outline" size={22} color={colors.textFaint} />
          </View>
        )}

        {listing.type !== 'sell' ? (
          <View style={[styles.typeTag, !listing.condition && styles.typeTagTop]}>
            <Text style={styles.typeTagText}>{listing.type === 'lend' ? 'For rent' : 'Swap'}</Text>
          </View>
        ) : null}

        {listing.images.length > 1 ? (
          <View style={styles.photoCount}>
            <Ionicons name="images" size={10} color="#fff" />
            <Text style={styles.photoCountText}>{listing.images.length}</Text>
          </View>
        ) : null}

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

        {formatDistanceShort(listing.distance_m) ? (
          <View style={styles.distanceRow}>
            <Ionicons name="navigate" size={10} color={colors.primary} />
            <Text style={styles.distanceText}>{formatDistanceShort(listing.distance_m)}</Text>
          </View>
        ) : null}
      </View>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.glass,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    overflow: 'hidden', ...shadow.card,
  },
  media: { position: 'relative' },
  image: { width: '100%', height: 132, backgroundColor: colors.surfaceSunk },
  imageEmpty: { alignItems: 'center', justifyContent: 'center' },
  distanceRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  distanceText: { fontSize: 11, fontFamily: fonts.bold, color: colors.primary },
  photoCount: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(30,43,34,0.55)',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  photoCountText: { color: '#fff', fontSize: 10, fontFamily: fonts.bold },
  typeTag: {
    position: 'absolute',
    top: 34,
    left: 8,
    backgroundColor: colors.accent,
    borderRadius: radius.chip,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  typeTagTop: { top: 8 },
  typeTagText: { fontSize: 10, fontFamily: fonts.bold, color: colors.onBrand },
  badge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: colors.glassStrong,
    borderRadius: radius.chip,
    paddingHorizontal: 8,
    paddingVertical: 3,
    maxWidth: '75%',
  },
  badgeText: { fontSize: 10, fontFamily: fonts.bold, color: colors.text },
  locationTag: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(30,43,34,0.62)',
    borderRadius: radius.chip,
    paddingHorizontal: 7,
    paddingVertical: 3,
    maxWidth: '88%',
  },
  locationText: { fontSize: 10, fontFamily: fonts.semibold, color: colors.onBrand, flexShrink: 1 },
  body: { padding: 10, gap: 2 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  price: { fontSize: 18, fontFamily: fonts.displayBold, color: colors.text, flexShrink: 1, letterSpacing: -0.3 },
  priceSuffix: { fontSize: 11, fontFamily: fonts.semibold, color: colors.textMuted },
  title: { fontSize: 13, fontFamily: fonts.semibold, color: colors.text, lineHeight: 18 },
  description: { fontSize: 11, fontFamily: fonts.regular, color: colors.textMuted },
});
