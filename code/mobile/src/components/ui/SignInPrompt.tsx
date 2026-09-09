import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Button } from './Button';
import { colors } from '../../constants/colors';

/** Shown wherever a guest hits something that needs an account. */
export function SignInPrompt({ action }: { action: string }) {
  return (
    <View style={styles.wrapper}>
      <Ionicons name="lock-closed-outline" size={34} color={colors.textMuted} />
      <Text style={styles.title}>Sign in to {action}</Text>
      <Text style={styles.message}>
        Browsing is open to everyone. Posting, messaging and your profile need a
        verified @thapar.edu account.
      </Text>
      <View style={styles.action}>
        <Button label="Sign in" onPress={() => router.push('/(auth)/signup')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignItems: 'center', gap: 10, paddingHorizontal: 32, paddingVertical: 40 },
  title: { color: colors.text, fontSize: 18, fontWeight: '600' },
  message: { color: colors.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  action: { alignSelf: 'stretch', marginTop: 12 },
});
