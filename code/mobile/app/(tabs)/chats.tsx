import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { ErrorText } from '../../src/components/ui/ErrorText';
import { ScreenTitle } from '../../src/components/ui/ScreenTitle';
import { SignInPrompt } from '../../src/components/ui/SignInPrompt';
import { fetchChats } from '../../src/features/chat/api';
import type { ChatThread } from '../../src/features/chat/types';
import { useProfile } from '../../src/features/profile/hooks';
import { colors, fonts, shadow } from '../../src/constants/colors';
import { Screen } from '../../src/components/ui/Screen';
import { Ionicons } from '@expo/vector-icons';
import { Appear, PressScale } from '../../src/components/ui/motion';
import { formatClock, formatDay } from '../../src/utils/formatTime';
import { useUnreadChats } from '../../src/features/chat/unread';
import { useRealtimeRefresh } from '../../src/lib/realtime';

/** Fallback refresh while the tab is open, in case realtime is unavailable. */
const POLL_MS = 20000;

/** Newest activity first: the last message, or when the chat was started. */
function lastActivity(t: ChatThread) {
  return Date.parse(t.last_message?.sent_at ?? t.created_at) || 0;
}

export default function ChatsScreen() {
  const { isSignedIn, loading: profileLoading, session } = useProfile();
  const { unread, refresh: refreshUnread } = useUnreadChats();
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isSignedIn) {
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const list = await fetchChats();
      setThreads([...list].sort((a, b) => lastActivity(b) - lastActivity(a)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load chats');
    } finally {
      setLoading(false);
    }
  }, [isSignedIn]);

  // Load when the tab opens, then keep it fresh while it stays open.
  useFocusEffect(
    useCallback(() => {
      load();
      const timer = setInterval(() => {
        load();
        refreshUnread();
      }, POLL_MS);
      return () => clearInterval(timer);
    }, [load, refreshUnread]),
  );

  // A new message or offer in any of my chats (Realtime only sends rows I may
  // read) refreshes the list at once, so a brand-new chat shows up straight away.
  useRealtimeRefresh(
    [{ table: 'messages' }, { table: 'offers' }],
    () => {
      load();
      refreshUnread();
    },
    !!session,
  );

  if (!profileLoading && !isSignedIn) {
    return (
      <Screen style={styles.safe} edges={['top']}>
        <ScreenTitle>Chats</ScreenTitle>
        <View style={styles.centered}>
          <SignInPrompt action="message sellers" />
        </View>
      </Screen>
    );
  }

  return (
    <Screen style={styles.safe} edges={['top']}>
      <FlatList
        data={threads}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={() => {
              load();
              refreshUnread();
            }}
            tintColor={colors.textMuted}
          />
        }
        ListHeaderComponent={
          <>
            <ScreenTitle>Chats</ScreenTitle>
            <ErrorText>{error}</ErrorText>
          </>
        }
        renderItem={({ item, index }) => {
          const isNew = unread.has(item.id);
          return (
          <Appear index={index}>
            <PressScale
              scaleTo={0.98}
              style={styles.thread}
              onPress={() => router.push({ pathname: '/chat/[id]', params: { id: item.id, listingId: item.listing_id } })}
            >
              {item.listing?.images?.[0] ? (
                <Image source={{ uri: item.listing.images[0] }} style={styles.thumb} />
              ) : (
                <View style={[styles.thumb, styles.thumbEmpty]}>
                  <Ionicons name="chatbubbles-outline" size={18} color={colors.primary} />
                </View>
              )}
              <View style={styles.threadBody}>
                <View style={styles.threadTop}>
                  <Text style={styles.title} numberOfLines={1}>
                    {item.listing?.title ?? 'Listing'}
                  </Text>
                  {item.last_message ? (
                    <Text style={[styles.time, isNew && styles.timeNew]}>{formatDay(item.last_message.sent_at) === formatDay(new Date().toISOString()) ? formatClock(item.last_message.sent_at) : formatDay(item.last_message.sent_at)}</Text>
                  ) : null}
                </View>
                <View style={styles.threadBottom}>
                  <Text style={[styles.preview, isNew && styles.previewNew]} numberOfLines={1}>
                    {item.last_message?.content ?? 'No messages yet'}
                  </Text>
                  {isNew ? <View style={styles.newDot} accessibilityLabel="New" /> : null}
                </View>
              </View>
            </PressScale>
          </Appear>
          );
        }}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={colors.primary} style={styles.loader} />
          ) : (
            <EmptyState
              icon="chatbubble-ellipses-outline"
              title="No conversations yet"
              message="Open a listing and tap Chat to negotiate to start one."
            />
          )
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: 'center' },
  content: { paddingHorizontal: 16, paddingBottom: 24 },
  separator: { height: 10 },
  thread: {
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: 14,
    padding: 12,
    gap: 12,
    flexDirection: 'row',
    alignItems: 'center', ...shadow.card,
  },
  thumb: { width: 52, height: 52, borderRadius: 14, backgroundColor: colors.surfaceSunk },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryTint },
  threadBody: { flex: 1, gap: 3 },
  threadTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  time: { color: colors.textFaint, fontSize: 11, fontFamily: fonts.medium },
  title: { flex: 1, color: colors.text, fontSize: 15, fontFamily: fonts.bold },
  threadBottom: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  preview: { flex: 1, color: colors.textMuted, fontSize: 13, fontFamily: fonts.regular },
  previewNew: { color: colors.text, fontFamily: fonts.semibold },
  timeNew: { color: colors.accent, fontFamily: fonts.bold },
  newDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.accent },
  loader: { marginTop: 48 },
});
