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
 */
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { CourseRecord } from '@soteria-forge/shared';
import { Screen } from '../components';
import { useCourses } from '../api';
import { useTheme } from '../theme';

export function CourseListScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { courses, loading, backendPending, error, refetch } = useCourses();

  if (loading) {
    return (
      <Screen scroll={false} contentStyle={styles.center}>
        <ActivityIndicator color={theme.colors.brand.blue} />
      </Screen>
    );
  }

  const renderCourse = ({ item }: { item: CourseRecord }) => (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/(app)/course/[id]', params: { id: item.id } })}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: theme.colors.bg.surface,
          borderColor: theme.colors.border.subtle,
          borderRadius: theme.radii.lg,
          opacity: pressed ? 0.9 : 1,
        },
      ]}
    >
      <Text
        numberOfLines={2}
        style={{
          color: theme.colors.text.primary,
          fontSize: theme.fontSize.lg,
          fontWeight: theme.fontWeight.semibold,
        }}
      >
        {item.title}
      </Text>
      <Text
        numberOfLines={2}
        style={{ color: theme.colors.text.secondary, fontSize: theme.fontSize.sm }}
      >
        {item.description}
      </Text>
    </Pressable>
  );

  return (
    <Screen scroll={false}>
      <Text
        style={{
          color: theme.colors.text.primary,
          fontSize: theme.fontSize['2xl'],
          fontWeight: theme.fontWeight.bold,
          marginBottom: theme.spacing[4],
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
          ItemSeparatorComponent={() => <View style={{ height: theme.spacing[3] }} />}
          contentContainerStyle={{ paddingBottom: theme.spacing[8] }}
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
      <Text
        style={{
          color: theme.colors.text.primary,
          fontSize: theme.fontSize.lg,
          fontWeight: theme.fontWeight.semibold,
        }}
      >
        {title}
      </Text>
      <Text
        style={{ color: theme.colors.text.secondary, fontSize: theme.fontSize.sm, textAlign: 'center' }}
      >
        {body}
      </Text>
      {actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          onPress={onAction}
          style={{ paddingVertical: theme.spacing[2] }}
        >
          <Text style={{ color: theme.colors.text.link, fontSize: theme.fontSize.sm }}>
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { padding: 16, borderWidth: 1, gap: 6 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 24 },
});
