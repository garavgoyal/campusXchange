import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSession } from '../src/features/auth/hooks';
import { colors } from '../src/constants/colors';

/** Entry point: sends the user to the app if signed in, to login if not. */
export default function Index() {
  const { session, loading } = useSession();

  useEffect(() => {
    if (loading) return;
    // Guest browsing: everyone lands on the feed. Signing in is required only
    // for actions (posting, chatting, profile), not for looking around.
    router.replace('/(tabs)');
  }, [loading, session]);

  return (
    <View style={styles.container}>
      <ActivityIndicator color={colors.primary} size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
