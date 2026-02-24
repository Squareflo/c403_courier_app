import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { BottomNav, type TabId } from '../components/BottomNav';
import { DashboardScreen } from './DashboardScreen';
import { fontFamily } from '../constants/typography';

/**
 * MainLayout handles post-auth navigation with a bottom tab bar.
 * Default tab: Dashboard
 */
export function MainLayout() {
  const { colors } = useTheme();
  const { signOut, courier } = useAuth();

  const [activeTab, setActiveTab] = useState<TabId>('dashboard');

  // ── Tab navigation ──────────────────────────────────────────────────────

  const handleTabPress = (tab: TabId) => {
    setActiveTab(tab);
  };

  // ─── Main tab screens ───
  const renderScreen = () => {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardScreen />;
      case 'deliveries':
        return <PlaceholderScreen title="Deliveries" />;
      case 'wallet':
        return <PlaceholderScreen title="Wallet" />;
      case 'messages':
        return <PlaceholderScreen title="Messages" />;
      case 'reviews':
        return <PlaceholderScreen title="Reviews" />;
      case 'referrals':
        return <PlaceholderScreen title="Referrals" />;
      case 'my-account':
        return <PlaceholderScreen title="My Account" />;
      default:
        return <PlaceholderScreen title={activeTab} />;
    }
  };

  return (
    <SafeAreaProvider>
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={styles.content}>{renderScreen()}</View>
        <BottomNav activeTab={activeTab} onTabPress={handleTabPress} />
      </View>
    </SafeAreaProvider>
  );
}

// Simple placeholder for screens not yet implemented
function PlaceholderScreen({ title }: { title: string }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: colors.backgroundSecondary }}>
      <View
        style={{
          flexDirection: 'row' as const,
          alignItems: 'center' as const,
          paddingTop: insets.top + 8,
          paddingBottom: 14,
          paddingHorizontal: 16,
          backgroundColor: colors.background,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <Text style={{ fontFamily: fontFamily.bold, fontSize: 18, color: colors.text, flex: 1, textAlign: 'center' }}>
          {title}
        </Text>
      </View>
      <View style={{ flex: 1, alignItems: 'center' as const, justifyContent: 'center' as const }}>
        <Text style={{ fontFamily: fontFamily.regular, fontSize: 15, color: colors.textMuted }}>
          Coming soon!
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
});
