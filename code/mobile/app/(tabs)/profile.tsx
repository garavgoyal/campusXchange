import React, { useCallback, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { SignInPrompt } from '../../src/components/ui/SignInPrompt';
import { signOut } from '../../src/features/auth/api';
import { fetchChats } from '../../src/features/chat/api';
import { fetchMyListings } from '../../src/features/listings/api';
import { updateProfile } from '../../src/features/profile/api';
import { useProfile } from '../../src/features/profile/hooks';
import { MEETING_LOCATIONS } from '../../src/constants/categories';
import { colors, radius, typography } from '../../src/constants/colors';

type Counts = { total: number; live: number; chats: number };

export default function ProfileScreen() {
  const { profile, session, isSignedIn, loading, reload } = useProfile();
  const [counts, setCounts] = useState<Counts | null>(null);
  const [showZones, setShowZones] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [savingName, setSavingName] = useState(false);

  useFocusEffect(
    useCallback(() => {
      reload();
      if (!isSignedIn) return;
      Promise.all([fetchMyListings(), fetchChats()])
        .then(([listings, chats]) =>
          setCounts({
            total: listings.length,
            live: listings.filter((l) => l.status === 'live').length,
            chats: chats.length,
          }),
        )
        .catch(() => setCounts(null));
    }, [isSignedIn, reload]),
  );

  if (!loading && !isSignedIn) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <AppBar />
        <View style={styles.centered}>
          <SignInPrompt action="see your profile" />
        </View>
      </SafeAreaView>
    );
  }

  const email = profile?.email ?? session?.user.email ?? '';
  const initial = (profile?.name || email || '?').trim().charAt(0).toUpperCase();
  const status = profile?.id_verified ?? 'pending';
  const verified = status === 'verified';

  async function handleSaveName() {
    const value = nameDraft.trim();
    if (value.length < 2) return;
    setSavingName(true);
    await updateProfile({ name: value });
    await reload();
    setSavingName(false);
    setEditingName(false);
  }

  async function handleSignOut() {
    await signOut();
    router.replace('/(auth)/signup');
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <AppBar />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.titleRow}>
          <View>
            <Text style={styles.screenTitle}>Student profile</Text>
            <Text style={styles.screenSub}>Verified Thapar peer network</Text>
          </View>
        </View>

        {/* identity */}
        <View style={styles.identityCard}>
          <View style={styles.avatarWrap}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initial}</Text>
            </View>
            {verified ? (
              <View style={styles.avatarCheck}>
                <Ionicons name="checkmark" size={12} color={colors.onBrand} />
              </View>
            ) : null}
          </View>

          {editingName ? (
            <View style={styles.nameEdit}>
              <TextInput
                value={nameDraft}
                onChangeText={setNameDraft}
                placeholder="Your full name"
                placeholderTextColor={colors.textFaint}
                autoCapitalize="words"
                autoFocus
                style={styles.nameInput}
                onSubmitEditing={handleSaveName}
                returnKeyType="done"
              />
              <Pressable
                onPress={handleSaveName}
                disabled={savingName || nameDraft.trim().length < 2}
                style={[
                  styles.nameSave,
                  (savingName || nameDraft.trim().length < 2) && styles.nameSaveOff,
                ]}
              >
                {savingName ? (
                  <ActivityIndicator size="small" color={colors.onBrand} />
                ) : (
                  <Ionicons name="checkmark" size={17} color={colors.onBrand} />
                )}
              </Pressable>
              <Pressable onPress={() => setEditingName(false)} hitSlop={8}>
                <Ionicons name="close" size={20} color={colors.textMuted} />
              </Pressable>
            </View>
          ) : (
            <Pressable
              style={styles.nameRow}
              onPress={() => {
                setNameDraft(profile?.name ?? '');
                setEditingName(true);
              }}
            >
              <Text style={[styles.name, !profile?.name?.trim() && styles.namePlaceholder]}>
                {profile?.name?.trim() || 'Add your name'}
              </Text>
              <Ionicons name="pencil" size={14} color={colors.textFaint} />
            </Pressable>
          )}

          <Text style={styles.meta}>
            {profile?.roll_number ? `Roll no. ${profile.roll_number}` : 'Roll number not added'}
          </Text>
          <View style={styles.instRow}>
            <Ionicons name="business" size={12} color={colors.textMuted} />
            <Text style={styles.meta}>Thapar Institute (TIET)</Text>
          </View>

          <View style={styles.pillRow}>
            <View style={[styles.pill, verified ? styles.pillOk : styles.pillPending]}>
              <Ionicons
                name={verified ? 'shield-checkmark' : 'time'}
                size={12}
                color={verified ? colors.success : colors.warning}
              />
              <Text style={[styles.pillText, verified ? styles.pillTextOk : styles.pillTextPending]}>
                {verified ? 'Verified student ID' : 'ID awaiting review'}
              </Text>
            </View>
          </View>
        </View>

        {/* stats — real counts only */}
        <View style={styles.stats}>
          <Stat value={counts?.total ?? '—'} label="Listings" />
          <Stat value={counts?.live ?? '—'} label="Live now" tone="primary" />
          <Stat value={counts?.chats ?? '—'} label="Chats" />
        </View>

        {/* credentials */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <View style={styles.cardHeadLeft}>
              <View style={styles.cardIcon}>
                <Ionicons name="shield-checkmark" size={15} color={colors.onBrand} />
              </View>
              <Text style={styles.cardTitle}>TIET credentials</Text>
            </View>
            <View style={styles.activePill}>
              <Text style={styles.activeText}>{verified ? 'ACTIVE' : 'PENDING'}</Text>
            </View>
          </View>

          <View style={styles.subRow}>
            <Ionicons name="mail" size={16} color={colors.textMuted} />
            <View style={styles.subBody}>
              <Text style={styles.subLabel}>University mailbox</Text>
              <Text style={styles.subValue} numberOfLines={1}>
                {email}
              </Text>
            </View>
            <Ionicons name="checkmark-circle" size={18} color={colors.success} />
          </View>

          <View style={styles.subRow}>
            <Ionicons name="id-card" size={16} color={colors.textMuted} />
            <View style={styles.subBody}>
              <Text style={styles.subLabel}>Student ID card</Text>
              <Text style={styles.subValue}>
                {profile?.id_card_image_url ? 'Uploaded' : 'Not uploaded'}
              </Text>
            </View>
            <Ionicons
              name={verified ? 'checkmark-circle' : 'time-outline'}
              size={18}
              color={verified ? colors.success : colors.warning}
            />
          </View>
        </View>

        {/* menu */}
        <View style={styles.card}>
          <MenuRow
            icon="pricetags"
            title="My listings"
            subtitle="Edit or delete what you've posted"
            badge={counts ? `${counts.live} live` : undefined}
            onPress={() => router.push('/(tabs)/history')}
          />
          <View style={styles.divider} />
          <MenuRow
            icon="chatbubbles"
            title="My chats"
            subtitle="Ongoing negotiations"
            onPress={() => router.push('/(tabs)/chats')}
          />
          <View style={styles.divider} />
          <MenuRow
            icon="location"
            title="Campus safe zones"
            subtitle="Recommended daylight meeting points"
            onPress={() => setShowZones((v) => !v)}
            expanded={showZones}
          />
          {showZones ? (
            <View style={styles.zones}>
              {MEETING_LOCATIONS.map((zone) => (
                <View key={zone} style={styles.zone}>
                  <Ionicons name="location-outline" size={11} color={colors.primary} />
                  <Text style={styles.zoneText}>{zone}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        {/* logout */}
        <Pressable style={styles.logoutCard} onPress={handleSignOut}>
          <Ionicons name="log-out-outline" size={17} color={colors.error} />
          <Text style={styles.logoutText}>Log out of CampusXchange</Text>
        </Pressable>

        <Text style={styles.footer}>CampusXchange · Thapar Institute of Eng. & Tech.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function AppBar() {
  return (
    <View style={styles.appBar}>
      <Image source={require('../../assets/logo.png')} style={styles.logo} resizeMode="contain" />
      <Text style={styles.brand}>CampusXchange</Text>
      <Text style={styles.appBarTag}>PROFILE</Text>
    </View>
  );
}

function Stat({
  value,
  label,
  tone,
}: {
  value: number | string;
  label: string;
  tone?: 'primary';
}) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, tone === 'primary' && styles.statValuePrimary]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function MenuRow({
  icon,
  title,
  subtitle,
  badge,
  onPress,
  expanded,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  badge?: string;
  onPress: () => void;
  expanded?: boolean;
}) {
  return (
    <Pressable style={({ pressed }) => [styles.menuRow, pressed && styles.pressed]} onPress={onPress}>
      <View style={styles.menuIcon}>
        <Ionicons name={icon} size={16} color={colors.primary} />
      </View>
      <View style={styles.menuBody}>
        <Text style={styles.menuTitle}>{title}</Text>
        <Text style={styles.menuSub} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      {badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : null}
      <Ionicons
        name={expanded ? 'chevron-up' : 'chevron-forward'}
        size={17}
        color={colors.textFaint}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: 'center' },
  content: { paddingHorizontal: 16, paddingBottom: 32 },

  appBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  logo: { width: 28, height: 28, borderRadius: 8 },
  brand: { flex: 1, fontSize: 16, fontWeight: '800', color: colors.text },
  appBarTag: { ...typography.label, color: colors.textFaint, letterSpacing: 1.2 },

  titleRow: { paddingTop: 2, paddingBottom: 16 },
  screenTitle: { fontSize: 24, fontWeight: '800', color: colors.text },
  screenSub: { fontSize: 13, color: colors.textMuted, marginTop: 2 },

  identityCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sheet,
    padding: 20,
    alignItems: 'center',
  },
  avatarWrap: { marginBottom: 12 },
  avatar: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 32, fontWeight: '800', color: colors.primary },
  avatarCheck: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  name: { fontSize: 20, fontWeight: '800', color: colors.text },
  namePlaceholder: { color: colors.textFaint, fontStyle: 'italic' },
  nameEdit: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'stretch' },
  nameInput: {
    flex: 1,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  nameSave: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameSaveOff: { opacity: 0.4 },
  meta: { fontSize: 13, color: colors.textMuted, marginTop: 3 },
  instRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  pillRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.chip,
  },
  pillOk: { backgroundColor: colors.successTint },
  pillPending: { backgroundColor: colors.warningTint },
  pillText: { fontSize: 12, fontWeight: '700' },
  pillTextOk: { color: colors.success },
  pillTextPending: { color: colors.warning },

  stats: { flexDirection: 'row', gap: 10, marginTop: 12 },
  stat: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    paddingVertical: 16,
    alignItems: 'center',
    gap: 2,
  },
  statValue: { fontSize: 22, fontWeight: '800', color: colors.text },
  statValuePrimary: { color: colors.primary },
  statLabel: { fontSize: 11, color: colors.textMuted, fontWeight: '600' },

  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sheet,
    padding: 14,
    marginTop: 12,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  cardHeadLeft: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  cardIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { fontSize: 14, fontWeight: '800', color: colors.text },
  activePill: {
    backgroundColor: colors.primaryTint,
    borderRadius: radius.chip,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  activeText: { fontSize: 10, fontWeight: '800', color: colors.primary, letterSpacing: 0.6 },

  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  subBody: { flex: 1, gap: 1 },
  subLabel: { fontSize: 11, color: colors.textMuted, fontWeight: '600' },
  subValue: { fontSize: 13, color: colors.text, fontWeight: '600' },

  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  pressed: { opacity: 0.6 },
  menuIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuBody: { flex: 1, gap: 1 },
  menuTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  menuSub: { fontSize: 12, color: colors.textMuted },
  badge: {
    backgroundColor: colors.accentTint,
    borderRadius: radius.chip,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  badgeText: { fontSize: 11, fontWeight: '700', color: colors.accent },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 10 },

  zones: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 12 },
  zone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.background,
    borderRadius: radius.chip,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  zoneText: { fontSize: 11, color: colors.textMuted, fontWeight: '500' },

  logoutCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
    paddingVertical: 16,
    borderRadius: radius.sheet,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  logoutText: { color: colors.error, fontSize: 14, fontWeight: '700' },
  footer: { textAlign: 'center', color: colors.textFaint, fontSize: 11, marginTop: 18 },
});
