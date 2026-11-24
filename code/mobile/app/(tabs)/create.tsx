import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { router } from 'expo-router';
import { ListingForm } from '../../src/components/listings/ListingForm';
import { SignInPrompt } from '../../src/components/ui/SignInPrompt';
import { VerifyNotice, canTrade } from '../../src/components/ui/VerifyNotice';
import { colors, fonts } from '../../src/constants/colors';
import { createListing } from '../../src/features/listings/api';
import { useProfile } from '../../src/features/profile/hooks';
import { Screen } from '../../src/components/ui/Screen';

export default function CreateScreen() {
  const { isSignedIn, profile, loading: profileLoading } = useProfile();
  const verified = canTrade(profile);

  if (!profileLoading && !isSignedIn) {
    return (
      <Screen style={styles.safe} edges={['top']}>
        <Text style={styles.screenTitle}>Post on campus</Text>
        <View style={styles.centered}>
          <SignInPrompt action="post a listing" />
        </View>
      </Screen>
    );
  }

  return (
    <Screen style={styles.safe} edges={['top']}>
      <KeyboardAwareScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        bottomOffset={20}
      >
        <Text style={styles.screenTitle}>Post on campus</Text>
        <Text style={styles.screenSub}>
          List an item to sell, lend or barter with verified hostel mates.
        </Text>

        <VerifyNotice profile={profile} />

        <ListingForm
          verified={verified}
          submitLabel="Post listing to campus feed"
          onSubmit={async (input) => {
            await createListing(input);
            router.push('/(tabs)/history');
          }}
        />
      </KeyboardAwareScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: 'center' },
  content: { paddingHorizontal: 16, paddingBottom: 40 },
  screenTitle: { fontSize: 28, fontFamily: fonts.displayBold, color: colors.text, letterSpacing: -0.6, paddingTop: 4 },
  screenSub: { fontSize: 13, fontFamily: fonts.regular, color: colors.textMuted, marginTop: 4, marginBottom: 18 },
});
