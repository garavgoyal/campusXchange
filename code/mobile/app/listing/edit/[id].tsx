import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { router, useLocalSearchParams } from 'expo-router';
import { ListingForm } from '../../../src/components/listings/ListingForm';
import { ErrorText } from '../../../src/components/ui/ErrorText';
import { canTrade } from '../../../src/components/ui/VerifyNotice';
import { colors, fonts } from '../../../src/constants/colors';
import { fetchListing, updateListing } from '../../../src/features/listings/api';
import type { Listing } from '../../../src/features/listings/types';
import { useProfile } from '../../../src/features/profile/hooks';
import { BackButton } from '../../../src/components/ui/BackButton';
import { Screen } from '../../../src/components/ui/Screen';

/** Edit your own listing. Saving sends it back to moderation. */
export default function EditListingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useProfile();
  const [listing, setListing] = useState<Listing | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchListing(id)
      .then(setListing)
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load listing'));
  }, [id]);

  return (
    <Screen style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <BackButton />
        <Text style={styles.headerTitle}>Edit listing</Text>
      </View>

      {!listing ? (
        error ? (
          <View style={styles.content}>
            <ErrorText>{error}</ErrorText>
          </View>
        ) : (
          <ActivityIndicator color={colors.primary} style={styles.loader} />
        )
      ) : (
        <KeyboardAwareScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          bottomOffset={20}
        >
          <Text style={styles.typeLine}>
            {listing.type === 'sell' ? 'Selling' : listing.type === 'lend' ? 'Lending' : 'Exchanging'} · the type
            can't be changed after posting
          </Text>
          <ListingForm
            initial={listing}
            verified={canTrade(profile)}
            submitLabel="Save and send for review"
            onSubmit={async (input) => {
              const { type: _type, ...changes } = input;
              await updateListing(listing.id, changes);
              router.back();
            }}
          />
        </KeyboardAwareScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingTop: 4, paddingBottom: 10 },
  headerTitle: { fontSize: 19, fontFamily: fonts.displayBold, color: colors.text, letterSpacing: -0.2 },
  loader: { marginTop: 64 },
  content: { paddingHorizontal: 16, paddingBottom: 40 },
  typeLine: { fontSize: 12, fontFamily: fonts.regular, color: colors.textMuted, marginTop: 4 },
});
