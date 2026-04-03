import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { fontFamily } from '../../constants/typography';
import { spacing, layout } from '../../constants/spacing';

interface TransactionCardProps {
  placeName: string;
  placeId: string;
  amount: number;
  type: string;
  date: string;
  description?: string | null;
  videoId?: string | null;
  orderId?: string | null;
}

const formatPrice = (price: number): string => {
  return price.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
};

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const formatTime = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
};

export function TransactionCard({ placeName, amount, type, date, description }: TransactionCardProps) {
  const { colors, isDark } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const cardBg = isDark ? colors.card : '#fff';
  const textColor = isDark ? colors.text : '#000';
  const subtextColor = isDark ? colors.text + '99' : '#666';
  const isCredit = type === 'earned' || type === 'refund';

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => setExpanded(!expanded)}
      style={[styles.container, { backgroundColor: cardBg }]}
    >
      <View style={styles.row}>
        <View style={styles.left}>
          <Text style={[styles.placeName, { color: textColor }]} numberOfLines={1}>
            {placeName}
          </Text>
          {description ? (
            <Text style={[styles.description, { color: subtextColor }]} numberOfLines={expanded ? undefined : 1}>
              {description}
            </Text>
          ) : null}
          <Text style={[styles.date, { color: subtextColor }]}>
            {formatDate(date)} at {formatTime(date)}
          </Text>
        </View>
        <View style={styles.right}>
          <Text style={[styles.amount, { color: isCredit ? '#16a34a' : '#dc2626' }]}>
            {isCredit ? '+' : '-'}{formatPrice(Math.abs(amount))}
          </Text>
          <Text style={[styles.type, { color: subtextColor }]}>
            {type === 'refund' ? 'Refund' : isCredit ? 'Earned' : 'Redeemed'}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    borderRadius: layout.cardBorderRadius,
    ...layout.cardShadow,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  left: {
    flex: 1,
    marginRight: spacing.md,
  },
  placeName: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
    marginBottom: 2,
  },
  description: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    marginBottom: 2,
  },
  date: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
  },
  right: {
    alignItems: 'flex-end',
  },
  amount: {
    fontFamily: fontFamily.bold,
    fontSize: 16,
    marginBottom: 2,
  },
  type: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
  },
  button: {
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  buttonText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 14,
  },
});
