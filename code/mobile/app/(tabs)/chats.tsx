import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { ErrorText } from '../../src/components/ui/ErrorText';
import { ScreenTitle } from '../../src/components/ui/ScreenTitle';
import { SignInPrompt } from '../../src/components/ui/SignInPrompt';
import { fetchChats } from '../../src/features/chat/api';
import type { ChatThread } from '../../src/features/chat/types';
import { useProfile } from '../../src/features/profile/hooks';
import { colors } from '../../src/constants/colors';

export default function ChatsScreen() {
  const { isSignedIn, loading: profileLoading } = useProfile();
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
      setThreads(await fetchChats());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load chats');
    } finally {
      setLoading(false);
    }
  }, [isSignedIn]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!profileLoading && !isSignedIn) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScreenTitle>Chats</ScreenTitle>
        <View style={styles.centered}>
          <SignInPrompt action="message sellers" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <FlatList
        data={threads}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        refreshControl={
          <RefreshControl refreshing={false} onRefresh={load} tintColor={colors.textMuted} />
        }
        ListHeaderComponent={
          <>
            <ScreenTitle>Chats</ScreenTitle>
            <ErrorText>{error}</ErrorText>
          </>
        }
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.thread, pressed && styles.pressed]}
            onPress={() => router.push({ pathname: '/chat/[id]', params: { id: item.id, listingId: item.listing_id } })}
          >
            <Text style={styles.title} numberOfLines={1}>
              {item.listing?.title ?? 'Listing'}
            </Text>
            <Text style={styles.preview} numberOfLines={1}>
              {item.last_message?.content ?? 'No messages yet'}
            </Text>
          </Pressable>
        )}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: 'center' },
  content: { paddingHorizontal: 16, paddingBottom: 24 },
  separator: { height: 10 },
  thread: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 14,
    gap: 4,
  },
  pressed: { opacity: 0.85 },
  title: { color: colors.text, fontSize: 15, fontWeight: '600' },
  preview: { color: colors.textMuted, fontSize: 13 },
  loader: { marginTop: 48 },
});
