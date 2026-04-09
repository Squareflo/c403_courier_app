import React, { useState } from 'react';
import {
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import {
  Car,
  Coins,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Settings,
  Star,
  ThumbsUp,
  Users,
  UtensilsCrossed,
  Wallet,
  X,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import { fontFamily } from '../constants/typography';

// ── Tab definitions ──────────────────────────────────────────────────────────

export type TabId =
  | 'dashboard'
  | 'deliveries'
  | 'wallet'
  | 'messages'
  | 'reviews'
  | 'referrals'
  | 'points'
  | 'catering'
  | 'my-account'
  | 'stripe-express';

interface TabDef {
  id: TabId;
  label: string;
  icon: (color: string, size: number) => React.ReactNode;
}

const ALL_TABS: TabDef[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: (color, size) => <LayoutDashboard size={size} color={color} />,
  },
  {
    id: 'deliveries',
    label: 'Deliveries',
    icon: (color, size) => <Car size={size} color={color} />,
  },
  {
    id: 'wallet',
    label: 'Wallet',
    icon: (color, size) => <Wallet size={size} color={color} />,
  },
  {
    id: 'messages',
    label: 'Messages',
    icon: (color, size) => <MessageSquare size={size} color={color} />,
  },
  {
    id: 'reviews',
    label: 'Reviews',
    icon: (color, size) => <ThumbsUp size={size} color={color} />,
  },
  {
    id: 'referrals',
    label: 'Referrals',
    icon: (color, size) => <Users size={size} color={color} />,
  },
  {
    id: 'points',
    label: 'Points',
    icon: (color, size) => <Coins size={size} color={color} />,
  },
  {
    id: 'catering',
    label: 'Catering',
    icon: (color, size) => <UtensilsCrossed size={size} color={color} />,
  },
  {
    id: 'my-account',
    label: 'My Profile',
    icon: (color, size) => <Settings size={size} color={color} />,
  },
  {
    id: 'stripe-express',
    label: 'Stripe Express',
    icon: (color, size) => <CreditCard size={size} color={color} />,
  },
];

// Phone: show first 4 tabs + More
const PHONE_VISIBLE_COUNT = 4;

// ── Component ────────────────────────────────────────────────────────────────

interface BottomNavProps {
  activeTab: TabId;
  onTabPress: (tab: TabId) => void;
  hiddenTabs?: TabId[];
  onSignOut?: () => void;
}

export function BottomNav({ activeTab, onTabPress, hiddenTabs = [], onSignOut }: BottomNavProps) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const [showMoreDrawer, setShowMoreDrawer] = useState(false);

  const ICON_SIZE = 20;
  const activeColor = isDark ? '#FFFFFF' : '#000000';
  const inactiveColor = isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)';

  // Filter out hidden tabs
  const availableTabs = hiddenTabs.length > 0
    ? ALL_TABS.filter((t) => !hiddenTabs.includes(t.id))
    : ALL_TABS;

  const visibleTabs = isTablet ? availableTabs : availableTabs.slice(0, PHONE_VISIBLE_COUNT);
  const overflowTabs = isTablet ? [] : availableTabs.slice(PHONE_VISIBLE_COUNT);
  const hasMore = overflowTabs.length > 0;

  const renderTab = (tab: TabDef) => {
    const isActive = activeTab === tab.id;
    const color = isActive ? activeColor : inactiveColor;

    return (
      <TouchableOpacity
        key={tab.id}
        style={styles.tab}
        onPress={() => onTabPress(tab.id)}
        activeOpacity={0.7}
      >
        {tab.icon(color, ICON_SIZE)}
        <Text style={[styles.tabLabel, { color }]}>{tab.label}</Text>
      </TouchableOpacity>
    );
  };

  const isOverflowActive = overflowTabs.some((t) => t.id === activeTab);

  return (
    <>
      <View
        style={[
          styles.container,
          {
            backgroundColor: colors.tabBarBackground,
            borderTopColor: colors.tabBarBorder,
            paddingBottom: Platform.OS === 'ios' ? insets.bottom : Math.max(insets.bottom, 48),
          },
        ]}
      >
        <View style={styles.tabBar}>
          {visibleTabs.map(renderTab)}

          {hasMore && (
            <TouchableOpacity
              style={styles.tab}
              onPress={() => setShowMoreDrawer(true)}
              activeOpacity={0.7}
            >
              <Menu size={ICON_SIZE} color={isOverflowActive ? activeColor : inactiveColor} />
              <Text style={[styles.tabLabel, { color: isOverflowActive ? activeColor : inactiveColor }]}>
                More
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* More drawer */}
      <Modal
        visible={showMoreDrawer}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowMoreDrawer(false)}
      >
        <View style={[styles.drawerContainer, { backgroundColor: isDark ? colors.background : colors.backgroundTertiary }]}>
          {/* Header */}
          <View
            style={[
              styles.drawerHeader,
              { backgroundColor: colors.card, borderBottomColor: colors.border },
            ]}
          >
            <View style={{ width: 32 }} />
            <Text style={[styles.drawerTitle, { color: colors.text }]}>Navigate</Text>
            <TouchableOpacity onPress={() => setShowMoreDrawer(false)} style={styles.drawerClose}>
              <X size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.drawerScroll}
            contentContainerStyle={styles.drawerContent}
            showsVerticalScrollIndicator={false}
          >
            {overflowTabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <TouchableOpacity
                  key={tab.id}
                  style={[
                    styles.drawerItem,
                    {
                      backgroundColor: colors.card,
                      borderColor: isActive ? colors.text : 'transparent',
                      borderWidth: isActive ? 1.5 : 0,
                    },
                  ]}
                  onPress={() => {
                    setShowMoreDrawer(false);
                    onTabPress(tab.id);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={styles.drawerItemIcon}>
                    {tab.icon(colors.text, 24)}
                  </View>
                  <Text style={[styles.drawerItemLabel, { color: colors.text }]}>{tab.label}</Text>
                </TouchableOpacity>
              );
            })}

            {/* Sign Out */}
            {onSignOut && (
              <TouchableOpacity
                style={[styles.drawerItem, { backgroundColor: colors.card, marginTop: 16 }]}
                onPress={() => {
                  setShowMoreDrawer(false);
                  onSignOut();
                }}
                activeOpacity={0.7}
              >
                <View style={styles.drawerItemIcon}>
                  <LogOut size={24} color="#dc2626" />
                </View>
                <Text style={[styles.drawerItemLabel, { color: '#dc2626' }]}>Sign Out</Text>
              </TouchableOpacity>
            )}
            <View style={{ height: 50 }} />
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const BASE_TAB_HEIGHT = Platform.OS === 'ios' ? 85 : 100;

const styles = StyleSheet.create({
  container: {
    borderTopWidth: 1,
    overflow: 'hidden',
    height: BASE_TAB_HEIGHT,
  },
  tabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 8,
    flex: 1,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    fontSize: 10,
    fontFamily: fontFamily.semiBold,
    marginTop: 4,
    textAlign: 'center',
  },

  // Drawer
  drawerContainer: {
    flex: 1,
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 16 : 16,
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  drawerTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
  },
  drawerClose: {
    padding: 4,
  },
  drawerScroll: {
    flex: 1,
  },
  drawerContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  drawerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  drawerItemIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  drawerItemLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: 16,
  },
});
