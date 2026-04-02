import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../constants/typography';

interface SectionHeaderProps {
  title: string;
  onViewAllPress?: () => void;
  showViewAll?: boolean;
  actionText?: string;
  style?: ViewStyle;
}

export function SectionHeader({
  title,
  onViewAllPress,
  showViewAll = true,
  actionText = 'View All',
  style
}: SectionHeaderProps) {
  const { colors, isDark } = useTheme();

  return (
    <View style={[styles.container, style]}>
      <Text style={[styles.title, { color: isDark ? colors.text : undefined }]}>{title}</Text>
      {showViewAll && onViewAllPress && (
        <TouchableOpacity onPress={onViewAllPress}>
          <Text style={[styles.viewAll, { color: isDark ? colors.textTertiary : '#666666' }]}>{actionText}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: {
    ...typography.sectionTitle,
  },
  viewAll: {
    ...typography.linkText,
    color: '#666666',
  },
});
