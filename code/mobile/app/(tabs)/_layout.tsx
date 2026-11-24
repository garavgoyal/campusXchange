import React, { useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { StyleSheet, View, type ColorValue } from 'react-native';
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useProfile } from '../../src/features/profile/hooks';
import { colors, fonts, shadow } from '../../src/constants/colors';
import { GlassView } from '../../src/components/ui/Glass';
import { useUnreadChats } from '../../src/features/chat/unread';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** Tab icon that sits on a soft sage pill (fading in quickly) when its tab is open. */
function TabIcon({ name, focused, color }: { name: IconName; focused: boolean; color: ColorValue }) {
  const lift = useSharedValue(focused ? 1 : 0);
  useEffect(() => {
    lift.value = withTiming(focused ? 1 : 0, { duration: 150, reduceMotion: ReduceMotion.System });
  }, [focused, lift]);
  const pill = useAnimatedStyle(() => ({ opacity: lift.value }));
  return (
    <View style={styles.iconWrap}>
      <Animated.View style={[styles.pill, pill]} />
      <Ionicons name={focused ? name : (`${name}-outline` as IconName)} size={21} color={color} />
    </View>
  );
}

/** Home · Chats · + · My listings · Profile, plus Review when the user is an admin. */
export default function TabsLayout() {
  const { isAdmin } = useProfile();
  // How many chats have a message or offer the user hasn't opened yet.
  const { unread } = useUnreadChats();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: styles.bar,
        tabBarBackground: () => <GlassView intensity={60} style={styles.barGlass} />,
        // Six tabs for admins: a slightly smaller label keeps "My listings" whole.
        tabBarLabelStyle: { fontSize: isAdmin ? 9.5 : 11, fontFamily: fonts.semibold },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => <TabIcon name="home" focused={focused} color={color} />,
        }}
      />
      <Tabs.Screen
        name="chats"
        options={{
          title: 'Chats',
          tabBarBadge: unread.size > 0 ? (unread.size > 9 ? '9+' : unread.size) : undefined,
          tabBarBadgeStyle: styles.badge,
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="chatbubble-ellipses" focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: '',
          tabBarAccessibilityLabel: 'Post a listing',
          tabBarIcon: ({ focused }) => (
            <View style={[styles.fab, focused && styles.fabFocused]}>
              <Ionicons name="add" size={30} color={colors.onBrand} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'My listings',
          tabBarIcon: ({ color, focused }) => <TabIcon name="pricetags" focused={focused} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => <TabIcon name="person" focused={focused} color={color} />,
        }}
      />
      <Tabs.Screen
        name="admin"
        options={{
          title: 'Review',
          // href: null removes the tab entirely for non-admins.
          href: isAdmin ? '/(tabs)/admin' : null,
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="shield-checkmark" focused={focused} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor: colors.accent,
    color: colors.onBrand,
    fontSize: 10,
    fontFamily: fonts.bold,
    minWidth: 17,
    height: 17,
    lineHeight: 16,
    borderRadius: 9,
  },
  bar: {
    height: 70,
    paddingBottom: 10,
    paddingTop: 8,
    borderTopWidth: 0,
    backgroundColor: 'transparent',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    ...shadow.float,
  },
  barGlass: {
    flex: 1,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.glassBorder,
  },
  iconWrap: { alignItems: 'center', justifyContent: 'center', width: 52, height: 30 },
  pill: {
    position: 'absolute',
    width: 52,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.primaryTint,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -22,
    borderWidth: 4,
    borderColor: colors.background,
    shadowColor: colors.accent,
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  fabFocused: { backgroundColor: colors.accentPressed },
});
