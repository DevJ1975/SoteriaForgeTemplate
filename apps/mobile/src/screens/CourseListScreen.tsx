/**
 * CourseListScreen — the learner's ASSIGNED training first, then the browsable
 * published catalog.
 *
 * Data comes from two owner/tenant-scoped hooks:
 *   - `useCourses()` — the tenant's PUBLISHED courses (the data client filters
 *     status server-side; drafts/archived are authoring states and never reach
 *     a worker's device).
 *   - `useEnrollments()` — the caller's OWN enrollments (verified session only),
 *     whose `progress` is the server's integer percent computed from real
 *     completion statements.
 *
 * The list is grouped into two sections:
 *   1. "Assigned to me" — courses the learner is enrolled in, sorted overdue →
 *      soonest due → title, each showing its REAL enrollment progress, its
 *      enrollment status, and the due date when one is set.
 *   2. "Course catalog" — the remaining published courses, browsable but not
 *      yet assigned (no fake progress bar — there is no enrollment to report).
 *
 * States: loading skeletons / backendPending / error / empty, with
 * pull-to-refresh re-reading both sources. Cards fade in with a light stagger
 * (skipped under OS reduced-motion). Navigation stays id-based and
 * tenant-scoped (RLS resolves the id within the caller's tenant only). No
 * hardcoded brand hex.
 */
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import type { EnrollmentRecord } from '@soteria-forge/shared';
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
import { useCourses, useEnrollments } from '../api';
import {
  buildCourseSections,
  isEnrollmentComplete,
  isEnrollmentOverdue,
  type CourseListItem,
} from './courseSections';

// The grouping/sorting/status logic lives in ./courseSections.ts (pure,
// unit-tested); this file renders it.

/** Badge for an ASSIGNED course, from the enrollment's real state. */
function enrollmentBadge(e: EnrollmentRecord, now: number): { label: string; tone: BadgeTone } {
  if (isEnrollmentComplete(e)) return { label: 'Complete', tone: 'success' };
  if (isEnrollmentOverdue(e, now)) return { label: 'Overdue', tone: 'danger' };
  if (e.status === 'in-progress' || e.progress > 0) return { label: 'In progress', tone: 'primary' };
  if (e.status === 'expired') return { label: 'Expired', tone: 'warning' };
  return { label: 'Assigned', tone: 'info' };
}

/** Short human date for a due-date chip, tolerant of a missing Intl runtime. */
function formatDueDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return d.toDateString();
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
  const {
    enrollments,
    loading: enrollmentsLoading,
    error: enrollmentsError,
    refetch: refetchEnrollments,
  } = useEnrollments();

  // Pull-to-refresh keeps the list mounted (the skeleton state below is only
  // for the initial load); the spinner clears when both hooks finish loading.
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    if (!loading && !enrollmentsLoading) setRefreshing(false);
  }, [loading, enrollmentsLoading]);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    refetch();
    refetchEnrollments();
  }, [refetch, refetchEnrollments]);

  if ((loading || enrollmentsLoading) && !refreshing) {
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

  const now = Date.now();
  const sections = buildCourseSections(courses, enrollments, now);

  const renderItem = ({ item, index }: { item: CourseListItem; index: number }) => {
    const card = (
      <CourseCard item={item} now={now} onPress={() =>
        router.push({ pathname: '/(app)/course/[id]', params: { id: item.course.id } })
      } />
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
          onAction={onRefresh}
        />
      ) : backendPending ? (
        <EmptyState
          title="Backend not configured"
          body="Course data appears once the app is configured with EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY — copy .env.example and restart."
        />
      ) : sections.length === 0 ? (
        <EmptyState
          title="No courses yet"
          body="No published training is available to your organization yet."
        />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.course.id}
          renderItem={renderItem}
          renderSectionHeader={({ section }) => (
            <Text
              style={{
                color: theme.colors.textMuted,
                fontFamily: theme.fonts.display,
                fontWeight: '700',
                fontSize: 12,
                letterSpacing: 3,
                textTransform: 'uppercase',
                paddingTop: 14,
                paddingBottom: 10,
                backgroundColor: theme.colors.bg,
              }}
            >
              {section.title}
            </Text>
          )}
          ListHeaderComponent={
            // Enrollments failing while the catalog loaded must not blank the
            // screen — but silently showing an empty "Assigned" grouping would
            // mislead, so surface the partial failure inline.
            enrollmentsError ? (
              <Card style={{ marginTop: 4 }}>
                <Text
                  style={{
                    color: theme.colors.danger,
                    fontFamily: theme.fonts.body,
                    fontSize: 13,
                    lineHeight: 19,
                  }}
                >
                  Couldn’t load your assignments — pull to retry. Showing the catalog only.
                </Text>
              </Card>
            ) : null
          }
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          contentContainerStyle={{ paddingTop: 4, paddingBottom: 32 }}
          stickySectionHeadersEnabled={false}
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

/**
 * One course card. Assigned courses show the enrollment's REAL progress
 * percent, its status badge, and the due date when set; catalog courses show a
 * browsable header with no progress claim (there is no enrollment to report).
 */
function CourseCard({
  item,
  now,
  onPress,
}: {
  item: CourseListItem;
  now: number;
  onPress: () => void;
}) {
  const theme = useTheme();
  const { course, enrollment } = item;
  const badge = enrollment
    ? enrollmentBadge(enrollment, now)
    : { label: 'Available', tone: 'neutral' as BadgeTone };
  // UNITS: enrollment.progress is the server's INTEGER PERCENT (0–100);
  // ProgressBar takes the app-internal 0–1 fraction.
  const progress = enrollment ? Math.min(1, Math.max(0, enrollment.progress / 100)) : null;
  const overdue = enrollment ? isEnrollmentOverdue(enrollment, now) : false;

  const a11yLabel = enrollment
    ? `${course.title}, ${badge.label}, ${Math.round((progress ?? 0) * 100)} percent complete${
        enrollment.dueAt !== undefined ? `, due ${formatDueDate(enrollment.dueAt)}` : ''
      }`
    : `${course.title}, available in the catalog`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      onPress={onPress}
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
            {course.title}
          </Text>
          <Badge label={badge.label} tone={badge.tone} />
        </View>

        {course.description ? (
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
            {course.description}
          </Text>
        ) : null}

        {enrollment && progress !== null ? (
          <>
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
            {enrollment.dueAt !== undefined ? (
              <Text
                style={{
                  color: overdue ? theme.colors.danger : theme.colors.textMuted,
                  fontFamily: theme.fonts.body,
                  fontSize: 12.5,
                  marginTop: 8,
                }}
              >
                {overdue ? 'Was due ' : 'Due '}
                {formatDueDate(enrollment.dueAt)}
              </Text>
            ) : null}
          </>
        ) : null}

        {course.tags.length > 0 ? (
          <View style={styles.tagRow}>
            {course.tags.slice(0, 4).map((tag) => (
              <Chip key={tag} label={tag} />
            ))}
          </View>
        ) : null}
      </Card>
    </Pressable>
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
