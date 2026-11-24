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
import { router, useFocusEffect } from 'expo-router';
import { HostelPicker } from '../../src/components/campus/HostelPicker';
import { SignInPrompt } from '../../src/components/ui/SignInPrompt';
import { signOut } from '../../src/features/auth/api';
import { useCampusLocations } from '../../src/features/campus/hooks';
import { unregisterPush } from '../../src/lib/push';
import { fetchChats } from '../../src/features/chat/api';
import { fetchMyListings } from '../../src/features/listings/api';
import { updateProfile } from '../../src/features/profile/api';
import { useProfile } from '../../src/features/profile/hooks';
import { colors, radius, typography, fonts, shadow } from '../../src/constants/colors';
import { LinearGradient } from 'expo-linear-gradient';
import { Appear } from '../../src/components/ui/motion';
import { Screen } from '../../src/components/ui/Screen';

type Counts = { total: number; live: number; chats: number };

export default function ProfileScreen() {
  const { profile, session, isSignedIn, loading, reload } = useProfile();
  const [counts, setCounts] = useState<Counts | null>(null);
  const [showZones, setShowZones] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [pickingHostel, setPickingHostel] = useState(false);
  const { spots } = useCampusLocations();

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
      <Screen style={styles.safe} edges={['top']}>
        <AppBar />
        <View style={styles.centered}>
          <SignInPrompt action="see your profile" />
        </View>
      </Screen>
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

  async function saveHostel(hostel: string | null) {
    const { error } = await updateProfile({ hostel });
    if (error) throw new Error(error);
    await reload();
  }

  async function handleSignOut() {
    // Stop this phone getting the account's notifications once signed out.
    await unregisterPush();
    await signOut();
    router.replace('/(auth)/signup');
  }

  return (
    <Screen style={styles.safe} edges={['top']}>
      <AppBar />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.titleRow}>
          <View>
            <Text style={styles.screenTitle}>Student profile</Text>
            <Text style={styles.screenSub}>Verified Thapar peer network</Text>
          </View>
        </View>

        {/* identity */}
        <Appear style={styles.identityCard}>
          <View style={styles.avatarWrap}>
            <LinearGradient
              colors={[colors.primarySoft, colors.primary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.avatar}
            >
              <Text style={styles.avatarText}>{initial}</Text>
            </LinearGradient>
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
        </Appear>

        {/* stats — real counts only */}
        <Appear index={1} style={styles.stats}>
          <Stat value={counts?.total ?? '—'} label="Listings" />
          <Stat value={counts?.live ?? '—'} label="Live now" tone="primary" />
          <Stat value={counts?.chats ?? '—'} label="Chats" />
        </Appear>

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
                {verified
                  ? 'Checked by an admin'
                  : status === 'rejected'
                    ? 'Rejected: upload a clearer photo'
                    : profile?.id_card_image_url
                      ? 'Waiting for review'
                      : 'Not uploaded'}
              </Text>
            </View>
            <Ionicons
              name={verified ? 'checkmark-circle' : status === 'rejected' ? 'close-circle' : 'time-outline'}
              size={18}
              color={verified ? colors.success : status === 'rejected' ? colors.error : colors.warning}
            />
          </View>
        </View>

        {/* menu */}
        <View style={styles.card}>
          <MenuRow
            icon="home"
            title="Your hostel"
            subtitle={
              profile?.hostel
                ? `${profile.hostel} · items nearest you show first`
                : 'Not set · choose it to see what\'s nearest you'
            }
            badge={profile?.hostel ? 'Change' : 'Set'}
            onPress={() => setPickingHostel(true)}
          />
          <View style={styles.divider} />
          <MenuRow
            icon="bag-check"
            title="My deals"
            subtitle="Payments, QR handoffs, returns and disputes"
            onPress={() => router.push('/deals')}
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
              {spots.map((zone) => (
                <View key={zone.name} style={styles.zone}>
                  <Ionicons name="location-outline" size={11} color={colors.primary} />
                  <Text style={styles.zoneText}>{zone.name}</Text>
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

      <HostelPicker
        visible={pickingHostel}
        current={profile?.hostel ?? null}
        onSelect={saveHostel}
        onClose={() => setPickingHostel(false)}
      />
    </Screen>
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
  brand: { flex: 1, fontSize: 16, fontFamily: fonts.extrabold, color: colors.text },
  appBarTag: { ...typography.label, color: colors.textFaint, letterSpacing: 1.2 },

  titleRow: { paddingTop: 2, paddingBottom: 16 },
  screenTitle: { fontSize: 28, fontFamily: fonts.displayBold, color: colors.text, letterSpacing: -0.6 },
  screenSub: { fontSize: 13, fontFamily: fonts.regular, color: colors.textMuted, marginTop: 2 },

  identityCard: {
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.sheet,
    padding: 20,
    alignItems: 'center', ...shadow.card,
  },
  avatarWrap: { marginBottom: 12 },
  avatar: {
    width: 82,
    height: 82,
    borderRadius: 41,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.glassBorder,
  },
  avatarText: { fontSize: 34, fontFamily: fonts.displayBold, color: colors.onBrand },
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
  name: { fontSize: 20, fontFamily: fonts.displayBold, color: colors.text },
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
    fontFamily: fonts.bold,
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
  meta: { fontSize: 13, fontFamily: fonts.regular, color: colors.textMuted, marginTop: 3 },
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
  pillText: { fontSize: 12, fontFamily: fonts.bold },
  pillTextOk: { color: colors.success },
  pillTextPending: { color: colors.warning },

  stats: { flexDirection: 'row', gap: 10, marginTop: 12 },
  stat: {
    flex: 1,
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.card,
    paddingVertical: 16,
    alignItems: 'center',
    gap: 2, ...shadow.card,
  },
  statValue: { fontSize: 22, fontFamily: fonts.displayBold, color: colors.text },
  statValuePrimary: { color: colors.primary },
  statLabel: { fontSize: 11, color: colors.textMuted, fontFamily: fonts.semibold },

  card: {
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.sheet,
    padding: 14,
    marginTop: 12, ...shadow.card,
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
  cardTitle: { fontSize: 14, fontFamily: fonts.extrabold, color: colors.text },
  activePill: {
    backgroundColor: colors.primaryTint,
    borderRadius: radius.chip,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  activeText: { fontSize: 10, fontFamily: fonts.extrabold, color: colors.primary, letterSpacing: 0.6 },

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
  subLabel: { fontSize: 11, color: colors.textMuted, fontFamily: fonts.semibold },
  subValue: { fontSize: 13, color: colors.text, fontFamily: fonts.semibold },

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
  menuTitle: { fontSize: 14, fontFamily: fonts.bold, color: colors.text },
  menuSub: { fontSize: 12, fontFamily: fonts.regular, color: colors.textMuted },
  badge: {
    backgroundColor: colors.accentTint,
    borderRadius: radius.chip,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  badgeText: { fontSize: 11, fontFamily: fonts.bold, color: colors.accent },
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
  zoneText: { fontSize: 11, color: colors.textMuted, fontFamily: fonts.medium },

  logoutCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
    paddingVertical: 16,
    borderRadius: radius.sheet,
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorder, ...shadow.card,
  },
  logoutText: { color: colors.error, fontSize: 14, fontFamily: fonts.bold },
  footer: { textAlign: 'center', color: colors.textFaint, fontSize: 11, fontFamily: fonts.regular, marginTop: 18 },
});
