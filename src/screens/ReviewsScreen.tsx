import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, MessageSquareText, Star } from 'lucide-react-native';
import { TouchableOpacity } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { fontFamily } from '../constants/typography';
import { supabase } from '../lib/supabase';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ── Types ─────────────────────────────────────────────────────────────────────

interface CourierReview {
  id: string;
  rating: number;
  review_text: string | null;
  created_at: string;
  customer_first_name: string | null;
}

interface ReviewsScreenProps {
  onBack: () => void;
}

// ── Star Rating (identical to DashboardScreen) ────────────────────────────────

function StarRating({ rating, size = 16 }: { rating: number; size?: number }) {
  const stars = [];
  for (let i = 1; i <= 5; i++) {
    stars.push(
      <Star
        key={i}
        size={size}
        color={i <= Math.round(rating) ? '#FFD700' : '#555'}
        fill={i <= Math.round(rating) ? '#FFD700' : 'none'}
      />
    );
  }
  return <View style={{ flexDirection: 'row', gap: 2 }}>{stars}</View>;
}

const PAGE_SIZE = 20;

// ── Component ─────────────────────────────────────────────────────────────────

export function ReviewsScreen({ onBack }: ReviewsScreenProps) {
  const { colors, isDark } = useTheme();
  const { courier } = useAuth();
  const insets = useSafeAreaInsets();

  const [reviews, setReviews] = useState<CourierReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  // ── Fetch reviews ─────────────────────────────────────────────────────────

  const fetchReviews = useCallback(
    async (offset: number = 0, isRefresh: boolean = false) => {
      if (!courier?.id) return;

      try {
        const { data, error } = await supabase
          .from('courier_review')
          .select('id, rating, review_text, created_at, customer:customer_id(first_name)')
          .eq('courier_id', courier.id)
          .order('created_at', { ascending: false })
          .range(offset, offset + PAGE_SIZE - 1);

        if (error) {
          console.error('[ReviewsScreen] Error fetching reviews:', error);
          return;
        }

        const mapped: CourierReview[] = (data || []).map((r: any) => ({
          id: r.id,
          rating: r.rating,
          review_text: r.review_text,
          created_at: r.created_at,
          customer_first_name: r.customer?.first_name || null,
        }));

        if (isRefresh || offset === 0) {
          setReviews(mapped);
        } else {
          setReviews((prev) => [...prev, ...mapped]);
        }

        setHasMore(mapped.length === PAGE_SIZE);
      } catch (err) {
        console.error('[ReviewsScreen] Error:', err);
      }
    },
    [courier?.id]
  );

  // ── Initial load ──────────────────────────────────────────────────────────

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await fetchReviews(0, true);
      setLoading(false);
    };
    load();
  }, [fetchReviews]);

  // ── Refresh ───────────────────────────────────────────────────────────────

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchReviews(0, true);
    setRefreshing(false);
  };

  // ── Load more ─────────────────────────────────────────────────────────────

  const handleLoadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    await fetchReviews(reviews.length, false);
    setLoadingMore(false);
  };

  // ── Review card (identical style to dashboard reviewCard) ─────────────────

  const renderReviewCard = ({ item }: { item: CourierReview }) => {
    const reviewDate = new Date(item.created_at);
    const now = new Date();
    const diffMs = now.getTime() - reviewDate.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const timeAgoStr = diffDays === 0 ? 'Today' : diffDays === 1 ? '1 Day Ago' : `${diffDays} Days Ago`;
    const customerName = item.customer_first_name || 'Customer';

    return (
      <View style={[styles.reviewCard, { backgroundColor: colors.card }]}>
        <Text style={[styles.reviewText, { color: colors.textSecondary }]} numberOfLines={3}>
          {item.review_text}
        </Text>
        <View style={{ marginVertical: 8 }}>
          <StarRating rating={item.rating} size={24} />
        </View>
        <Text style={[styles.reviewMeta, { color: colors.textSecondary }]}>
          {timeAgoStr} by <Text style={{ fontFamily: fontFamily.bold, color: colors.text }}>{customerName}</Text>
        </Text>
      </View>
    );
  };

  // ── Empty state ───────────────────────────────────────────────────────────

  const renderEmpty = () => {
    if (loading) return null;
    return (
      <View style={emptyStyles.container}>
        <View style={[emptyStyles.iconCircle, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}>
          <MessageSquareText size={40} color={colors.textMuted} />
        </View>
        <Text style={[emptyStyles.title, { color: colors.text }]}>No Reviews Yet</Text>
        <Text style={[emptyStyles.subtitle, { color: colors.textMuted }]}>
          Reviews from customers will appear here after you complete deliveries.
        </Text>
      </View>
    );
  };

  // ── Footer loader ─────────────────────────────────────────────────────────

  const renderFooter = () => {
    if (!loadingMore) return <View style={{ height: 30 }} />;
    return (
      <View style={{ paddingVertical: 20 }}>
        <ActivityIndicator color={colors.textMuted} />
      </View>
    );
  };

  // ── Main render ───────────────────────────────────────────────────────────

  return (
    <View style={[screenStyles.root, { backgroundColor: colors.backgroundSecondary }]}>
      {/* Header — no bottom border */}
      <View
        style={[
          screenStyles.header,
          {
            paddingTop: insets.top + 8,
            backgroundColor: colors.backgroundSecondary,
          },
        ]}
      >
        <TouchableOpacity onPress={onBack} style={screenStyles.backBtn} activeOpacity={0.7}>
          <ArrowLeft size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={[screenStyles.headerTitle, { color: colors.text }]}>Reviews</Text>
        <View style={{ width: 32 }} />
      </View>

      {/* Loading */}
      {loading ? (
        <View style={screenStyles.loaderContainer}>
          <ActivityIndicator size="large" color={colors.textMuted} />
        </View>
      ) : (
        <FlatList
          data={reviews}
          keyExtractor={(item) => item.id}
          renderItem={renderReviewCard}
          ListEmptyComponent={renderEmpty}
          ListFooterComponent={renderFooter}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.3}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.textMuted}
              colors={[colors.textMuted]}
            />
          }
        />
      )}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════════════════════════════

const screenStyles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    paddingHorizontal: 16,
  },
  backBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
    textAlign: 'center',
  },
  loaderContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 20,
  },

  // Review card — identical to dashboard reviewCard style
  reviewCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 6,
      },
      android: {
        elevation: 3,
      },
      default: {},
    }),
  },
  reviewText: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    fontStyle: 'italic',
  },
  reviewMeta: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
  },
});

const emptyStyles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    paddingHorizontal: 40,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});
