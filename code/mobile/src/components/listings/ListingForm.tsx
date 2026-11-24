import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MeetingPointPicker } from '../campus/MeetingPointPicker';
import { PhotoPicker } from './PhotoPicker';
import { Banner } from '../ui/Banner';
import { Button } from '../ui/Button';
import { Chips } from '../ui/Chips';
import { ErrorText } from '../ui/ErrorText';
import { Field } from '../ui/Field';
import { Segmented } from '../ui/Segmented';
import { CATEGORIES, CONDITIONS, LISTING_MODES } from '../../constants/categories';
import { colors, typography, fonts } from '../../constants/colors';
import { uploadNewPhotos } from '../../features/listings/api';
import type { CreateListingInput, Listing, ListingType, RentUnit } from '../../features/listings/types';

type Props = {
  /** Present when editing: prefills every field and locks the listing type. */
  initial?: Listing;
  verified: boolean;
  submitLabel: string;
  /** Receives the finished input with photos already uploaded. */
  onSubmit: (input: CreateListingInput) => Promise<void>;
};

/** The listing form shared by "Post on campus" and "Edit listing". */
export function ListingForm({ initial, verified, submitLabel, onSubmit }: Props) {
  const editing = !!initial;
  const [type, setType] = useState<ListingType>(initial?.type ?? 'sell');
  const [photos, setPhotos] = useState<string[]>(initial?.images ?? []);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [category, setCategory] = useState<string | null>(initial?.category ?? null);
  const [condition, setCondition] = useState<string | null>(initial ? initial.condition : 'Like New');
  const [price, setPrice] = useState(initial?.price != null ? String(initial.price) : '');
  const [rentAmount, setRentAmount] = useState(initial?.rent_amount != null ? String(initial.rent_amount) : '');
  const [rentUnit, setRentUnit] = useState<RentUnit>(initial?.rent_unit ?? 'day');
  const [wantTags, setWantTags] = useState((initial?.want_tags ?? []).join(', '));
  const [meetingLocation, setMeetingLocation] = useState<string | null>(initial?.meeting_location ?? null);

  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
        imageUrls = await uploadNewPhotos(photos);
        setNote(null);
      }

      await onSubmit({
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

      if (!editing) reset();
    } catch (e) {
      setNote(null);
      setError(e instanceof Error ? e.message : 'Could not create listing');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {editing ? null : <Segmented options={LISTING_MODES} value={type} onChange={setType} />}

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
        <MeetingPointPicker value={meetingLocation} onChange={setMeetingLocation} />
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
        message={
          editing
            ? 'Saving changes sends the listing back to an admin. It leaves the feed until it is approved again.'
            : "An admin checks every listing. Yours shows as Pending review under History until it's approved."
        }
      />

      {note ? <Text style={styles.note}>{note}</Text> : null}
      <ErrorText>{error}</ErrorText>

      <View style={styles.submit}>
        <Button
          label={verified ? submitLabel : 'Verify your ID to post'}
          loading={loading}
          disabled={!verified}
          onPress={handleSubmit}
        />
      </View>
    </>
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
  section: { marginTop: 20, gap: 10 },
  sectionLabel: { ...typography.label, color: colors.textMuted, textTransform: 'uppercase' },
  textarea: { minHeight: 96, textAlignVertical: 'top', paddingTop: 12 },
  note: { color: colors.textMuted, fontSize: 13, fontFamily: fonts.regular, marginTop: 12 },
  submit: { marginTop: 20 },
});
