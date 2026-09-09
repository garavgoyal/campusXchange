import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { router } from 'expo-router';
import { PhotoPicker } from '../../src/components/listings/PhotoPicker';
import { Banner } from '../../src/components/ui/Banner';
import { Button } from '../../src/components/ui/Button';
import { Chips } from '../../src/components/ui/Chips';
import { ErrorText } from '../../src/components/ui/ErrorText';
import { Field } from '../../src/components/ui/Field';
import { Segmented } from '../../src/components/ui/Segmented';
import { SignInPrompt } from '../../src/components/ui/SignInPrompt';
import {
  CATEGORIES,
  CONDITIONS,
  LISTING_MODES,
  MEETING_LOCATIONS,
} from '../../src/constants/categories';
import { colors, radius, typography } from '../../src/constants/colors';
import { createListing, uploadListingImage } from '../../src/features/listings/api';
import type { ListingType, RentUnit } from '../../src/features/listings/types';
import { useProfile } from '../../src/features/profile/hooks';

export default function CreateScreen() {
  const { isSignedIn, loading: profileLoading } = useProfile();

  const [type, setType] = useState<ListingType>('sell');
  const [photos, setPhotos] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [condition, setCondition] = useState<string | null>('Like New');
  const [price, setPrice] = useState('');
  const [rentAmount, setRentAmount] = useState('');
  const [rentUnit, setRentUnit] = useState<RentUnit>('day');
  const [wantTags, setWantTags] = useState('');
  const [meetingLocation, setMeetingLocation] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!profileLoading && !isSignedIn) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <Text style={styles.screenTitle}>Post on campus</Text>
        <View style={styles.centered}>
          <SignInPrompt action="post a listing" />
        </View>
      </SafeAreaView>
    );
  }

  function reset() {
    setPhotos([]);
    setTitle('');
    setDescription('');
    setCondition('Like New');
    setPrice('');
    setRentAmount('');
    setWantTags('');
    setMeetingLocation(null);
  }

  async function handleSubmit() {
    setError(null);

    if (title.trim().length < 3) return setError('Give your listing a title');
    if (!category) return setError('Pick a category');
    if (type === 'sell' && !price.trim()) return setError('Add a price');
    if (type === 'lend' && !rentAmount.trim()) return setError('Add a rent amount');
    if (type === 'exchange' && !wantTags.trim()) {
      return setError('List at least one thing you would accept in exchange');
    }

    setLoading(true);
    try {
      let imageUrls: string[] = [];
      if (photos.length) {
        setNote('Uploading photos…');
        imageUrls = await Promise.all(photos.map(uploadListingImage));
        setNote(null);
      }

      await createListing({
        type,
        title: title.trim(),
        description: description.trim() || undefined,
        category,
        condition: condition ?? undefined,
        price: type === 'sell' ? Number(price) : undefined,
        rent_amount: type === 'lend' ? Number(rentAmount) : undefined,
        rent_unit: type === 'lend' ? rentUnit : undefined,
        want_tags:
          type === 'exchange'
            ? wantTags.split(',').map((t) => t.trim()).filter(Boolean)
            : undefined,
        meeting_location: meetingLocation ?? undefined,
        images: imageUrls,
      });

      reset();
      router.push('/(tabs)/history');
    } catch (e) {
      setNote(null);
      setError(e instanceof Error ? e.message : 'Could not create listing');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAwareScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        bottomOffset={20}
      >
        <Text style={styles.screenTitle}>Post on campus</Text>
        <Text style={styles.screenSub}>
          List an item to sell, lend or barter with verified hostel mates.
        </Text>

        <Segmented options={LISTING_MODES} value={type} onChange={setType} />

        <Section label="Item photos">
          <PhotoPicker uris={photos} onChange={setPhotos} disabled={loading} />
        </Section>

        <Section label="Item title">
          <Field
            placeholder="Casio fx-991CW Scientific Calculator"
            value={title}
            onChangeText={setTitle}
            maxLength={120}
          />
        </Section>

        <Section label="Category">
          <Chips options={CATEGORIES} value={category} onChange={setCategory} wrap />
        </Section>

        <Section label="Item condition">
          <Chips options={CONDITIONS} value={condition} onChange={setCondition} wrap />
        </Section>

        {type === 'sell' && (
          <Section label="Selling price">
            <Field
              leftIcon="cash-outline"
              placeholder="650"
              keyboardType="number-pad"
              value={price}
              onChangeText={(t) => setPrice(t.replace(/[^0-9]/g, ''))}
            />
          </Section>
        )}

        {type === 'lend' && (
          <>
            <Section label="Rent amount">
              <Field
                leftIcon="cash-outline"
                placeholder="70"
                keyboardType="number-pad"
                value={rentAmount}
                onChangeText={(t) => setRentAmount(t.replace(/[^0-9]/g, ''))}
              />
            </Section>
            <Section label="Charged per">
              <Segmented
                options={[
                  { key: 'day', label: 'Per day' },
                  { key: 'week', label: 'Per week' },
                ] as const}
                value={rentUnit}
                onChange={setRentUnit}
              />
            </Section>
          </>
        )}

        {type === 'exchange' && (
          <Section label="What would you accept?">
            <Field
              placeholder="cricket bat, headphones, lab coat"
              value={wantTags}
              onChangeText={setWantTags}
            />
          </Section>
        )}

        <Section label="Campus pickup landmark">
          <Chips
            options={MEETING_LOCATIONS}
            value={meetingLocation}
            onChange={setMeetingLocation}
            icon="location-outline"
            wrap
          />
        </Section>

        <Section label="Description">
          <Field
            placeholder="Condition, edition, what's included — anything a buyer should know."
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
            style={styles.textarea}
            maxLength={2000}
          />
        </Section>

        <Banner
          icon="shield-checkmark"
          title="Reviewed before it goes live"
          message="An admin checks every listing. Yours shows as Pending review under History until it's approved."
        />

        {note ? <Text style={styles.note}>{note}</Text> : null}
        <ErrorText>{error}</ErrorText>

        <View style={styles.submit}>
          <Button label="Post listing to campus feed" loading={loading} onPress={handleSubmit} />
        </View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: 'center' },
  content: { paddingHorizontal: 16, paddingBottom: 40 },
  screenTitle: { fontSize: 24, fontWeight: '800', color: colors.text, paddingTop: 4 },
  screenSub: { fontSize: 13, color: colors.textMuted, marginTop: 4, marginBottom: 18 },
  section: { marginTop: 20, gap: 10 },
  sectionLabel: { ...typography.label, color: colors.textMuted, textTransform: 'uppercase' },
  textarea: { minHeight: 96, textAlignVertical: 'top', paddingTop: 12 },
  note: { color: colors.textMuted, fontSize: 13, marginTop: 12 },
  submit: { marginTop: 20 },
});
