/**
 * CourseListScreen — lists THIS tenant's courses.
 *
 * Data comes from `useCourses()`, which is bound to the verified tenantId and
 * (later) the offline store. This screen renders three explicit states:
 *   - loading
 *   - backendPending (backend not deployed yet — the expected state for now)
 *   - loaded list / empty
 *
 * It reads the standard hook shape so the offline agent can back `useCourses`
 * with a local WatermelonDB store without touching this file.
 *
 * Re-skinned on the @soteria-forge/ui kit: each course is a kit Card with a
 * status Badge, a ProgressBar of readiness, and tag Chips. Empty/loading/error
 * states use the kit Card + Button (loading = skeleton course cards). Cards
 * fade in with a light stagger (skipped under OS reduced-motion) and the list
 * supports pull-to-refresh. The FlatList, hook contract, and the tenant-scoped
 * id-based navigation are all preserved. No hardcoded brand hex.
 */
import { useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import type { CourseRecord, CourseStatus } from '@soteria-forge/shared';
import {
  Badge,
  Button,
  Card,
  Chip,
  ProgressBar,
  Skeleton,
  useReducedMotion,
  useTheme,
  type BadgeTone,
} from '@soteria-forge/ui';
import { Screen } from '../components';
import { useCourses } from '../api';

/** Map a course lifecycle status to a kit Badge tone + label. */
function statusBadge(status: CourseStatus): { label: string; tone: BadgeTone } {
  switch (status) {
    case 'published':
      return { label: 'Active', tone: 'success' };
    case 'draft':
      return { label: 'Draft', tone: 'warning' };
    case 'archived':
      return { label: 'Archived', tone: 'neutral' };
    default:
      return { label: status, tone: 'neutral' };
  }
}

/** One skeleton stand-in shaped like a course card (title/badge, body, bar, tags). */
function CourseCardSkeleton() {
  return (
    <Card>
      <View style={styles.cardHeader}>
        <Skeleton variant="line" height={18} width="62%" />
        <Skeleton variant="line" height={20} width={64} radius="pill" />
      </View>
      <Skeleton variant="line" width="90%" style={{ marginTop: 12 }} />
      <Skeleton variant="line" width="74%" style={{ marginTop: 8 }} />
      <Skeleton variant="block" height={8} radius="pill" style={{ marginTop: 18 }} />
      <View style={styles.tagRow}>
        <Skeleton variant="line" height={30} width={72} radius="pill" />
        <Skeleton variant="line" height={30} width={88} radius="pill" />
      </View>
    </Card>
  );
}

export function CourseListScreen() {
  const theme = useTheme();
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const { courses, loading, backendPending, error, refetch } = useCourses();

  // Pull-to-refresh keeps the list mounted (the skeleton state below is only
  // for the initial load); the spinner clears when the hook finishes loading.
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    if (!loading) setRefreshing(false);
  }, [loading]);
  const onRefresh = () => {
    setRefreshing(true);
    refetch();
  };

  if (loading && !refreshing) {
    return (
      <Screen scroll={false}>
        <Text
          style={{
            color: theme.colors.text,
            fontFamily: theme.fonts.display,
            fontWeight: '700',
            fontSize: 28,
          }}
        >
          Courses
        </Text>
        <View style={{ gap: 12, paddingTop: 4 }}>
          <CourseCardSkeleton />
          <CourseCardSkeleton />
          <CourseCardSkeleton />
        </View>
      </Screen>
    );
  }

  const renderCourse = ({ item, index }: { item: CourseRecord; index: number }) => {
    const badge = statusBadge(item.status);
    const progress = Math.min(1, Math.max(0, item.fieldReadinessScore / 100));
    const card = (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${item.title}, ${badge.label}, ${Math.round(progress * 100)} percent complete`}
        onPress={() => router.push({ pathname: '/(app)/course/[id]', params: { id: item.id } })}
        style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
      >
        <Card>
          <View style={styles.cardHeader}>
            <Text
              numberOfLines={2}
              style={{
                flex: 1,
                color: theme.colors.text,
                fontFamily: theme.fonts.display,
                fontWeight: '600',
                fontSize: 19,
              }}
            >
              {item.title}
            </Text>
            <Badge label={badge.label} tone={badge.tone} />
          </View>

          {item.description ? (
            <Text
              numberOfLines={2}
              style={{
                color: theme.colors.textMuted,
                fontFamily: theme.fonts.body,
                fontSize: 14,
                marginTop: 6,
                lineHeight: 20,
              }}
            >
              {item.description}
            </Text>
          ) : null}

          <View style={styles.progressRow}>
            <ProgressBar value={progress} style={{ flex: 1 }} />
            <Text
              style={{
                color: theme.colors.textMuted,
                fontFamily: theme.fonts.display,
                fontWeight: '600',
                fontSize: 13,
                width: 40,
                textAlign: 'right',
              }}
            >
              {Math.round(progress * 100)}%
            </Text>
          </View>

          {item.tags.length > 0 ? (
            <View style={styles.tagRow}>
              {item.tags.slice(0, 4).map((tag) => (
                <Chip key={tag} label={tag} />
              ))}
            </View>
          ) : null}
        </Card>
      </Pressable>
    );

    // Staggered fade-in on first appearance — skipped entirely under OS
    // reduced-motion (no entering animation at all).
    if (reducedMotion) return card;
    return (
      <Animated.View entering={FadeInDown.delay(index * 40).duration(260)}>{card}</Animated.View>
    );
  };

  return (
    <Screen scroll={false}>
      <Text
        style={{
          color: theme.colors.text,
          fontFamily: theme.fonts.display,
          fontWeight: '700',
          fontSize: 28,
        }}
      >
        Courses
      </Text>

      {error ? (
        <EmptyState
          title="Couldn't load courses"
          body={error}
          actionLabel="Retry"
          onAction={refetch}
        />
      ) : backendPending ? (
        <EmptyState
          title="Backend not configured"
          body="Course data appears once the app is configured with EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY — copy .env.example and restart."
        />
      ) : courses.length === 0 ? (
        <EmptyState
          title="No courses yet"
          body="No training has been assigned to your organization yet."
        />
      ) : (
        <FlatList
          data={courses}
          keyExtractor={(c) => c.id}
          renderItem={renderCourse}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          contentContainerStyle={{ paddingTop: 4, paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.colors.primary}
              colors={[theme.colors.primary]}
            />
          }
        />
      )}
    </Screen>
  );
}

function EmptyState({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.empty}>
      <Card style={{ alignItems: 'center', gap: 8 }}>
        <Text
          style={{
            color: theme.colors.text,
            fontFamily: theme.fonts.display,
            fontWeight: '600',
            fontSize: 18,
            textAlign: 'center',
          }}
        >
          {title}
        </Text>
        <Text
          style={{
            color: theme.colors.textMuted,
            fontFamily: theme.fonts.body,
            fontSize: 14,
            textAlign: 'center',
            lineHeight: 20,
          }}
        >
          {body}
        </Text>
        {actionLabel && onAction ? (
          <Button title={actionLabel} variant="secondary" size="sm" onPress={onAction} />
        ) : null}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  empty: { flex: 1, justifyContent: 'center', paddingHorizontal: 8 },
});
