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
 * states use the kit Card + Button. The FlatList, hook contract, and the
 * tenant-scoped id-based navigation are all preserved. No hardcoded brand hex.
 */
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { CourseRecord, CourseStatus } from '@soteria-forge/shared';
import {
  Badge,
  Button,
  Card,
  Chip,
  ProgressBar,
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

export function CourseListScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { courses, loading, backendPending, error, refetch } = useCourses();

  if (loading) {
    return (
      <Screen scroll={false} contentStyle={styles.center}>
        <ProgressBar value={0.4} style={{ width: 160 }} />
        <Text
          style={{
            color: theme.colors.textMuted,
            fontFamily: theme.fonts.body,
            fontSize: 14,
            marginTop: 12,
          }}
        >
          Loading your training…
        </Text>
      </Screen>
    );
  }

  const renderCourse = ({ item }: { item: CourseRecord }) => {
    const badge = statusBadge(item.status);
    const progress = Math.min(1, Math.max(0, item.fieldReadinessScore / 100));
    return (
      <Pressable
        accessibilityRole="button"
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
          title="Backend not deployed"
          body="Course data appears once the AppSync backend is running. Deploy backend/ or start a sandbox with `npx ampx sandbox`."
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  empty: { flex: 1, justifyContent: 'center', paddingHorizontal: 8 },
});
