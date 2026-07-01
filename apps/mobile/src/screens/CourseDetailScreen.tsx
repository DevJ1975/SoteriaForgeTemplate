/**
 * CourseDetailScreen — a single course header for THIS tenant.
 *
 * Loads one course by id through the tenant-scoped data client. The lookup is
 * still tenant-scoped: `getCourse` targets the caller's own partition, and the
 * server refuses the read if the course belongs to another tenant. A course id
 * from a deep link is therefore NOT a way to reach another tenant's data.
 *
 * Video playback (react-native-video against a tenant-authorized, on-demand
 * playback URL for the lesson's VideoAsset) is intentionally left as a marked
 * seam — VideoAsset holds metadata only; the signed URL is resolved server-side.
 */
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import type { CourseRecord } from '@soteria-forge/shared';
import { Screen } from '../components';
import { getDataClient, BackendNotConfiguredError } from '../api';
import { useTenantId } from '../auth/AuthProvider';
import { useTheme } from '../theme';

export function CourseDetailScreen() {
  const theme = useTheme();
  const tenantId = useTenantId();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [course, setCourse] = useState<CourseRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [backendPending, setBackendPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    setBackendPending(false);
    try {
      const client = getDataClient(tenantId);
      setCourse(await client.getCourse(id));
    } catch (err) {
      if (err instanceof BackendNotConfiguredError) {
        setBackendPending(true);
      } else {
        setError(err instanceof Error ? err.message : 'Failed to load course');
      }
    } finally {
      setLoading(false);
    }
  }, [id, tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <Screen scroll={false} contentStyle={styles.center}>
        <ActivityIndicator color={theme.colors.brand.blue} />
      </Screen>
    );
  }

  return (
    <Screen>
      {error ? (
        <Text style={{ color: theme.colors.semantic.danger, fontSize: theme.fontSize.base }}>
          {error}
        </Text>
      ) : backendPending ? (
        <Text style={{ color: theme.colors.text.secondary, fontSize: theme.fontSize.base }}>
          Course details load once the AppSync backend is running.
        </Text>
      ) : !course ? (
        <Text style={{ color: theme.colors.text.secondary, fontSize: theme.fontSize.base }}>
          Course not found in your organization.
        </Text>
      ) : (
        <View style={styles.content}>
          <Text
            style={{
              color: theme.colors.text.primary,
              fontSize: theme.fontSize['2xl'],
              fontWeight: theme.fontWeight.bold,
            }}
          >
            {course.title}
          </Text>
          <Text style={{ color: theme.colors.text.secondary, fontSize: theme.fontSize.base }}>
            {course.description}
          </Text>

          {/* Video player seam: a lesson's VideoAsset plays here via
              react-native-video against a server-resolved, tenant-authorized
              signed playback URL. VideoAsset stores metadata only — never bytes. */}
          <View
            style={[
              styles.playerPlaceholder,
              { backgroundColor: theme.colors.bg.subtle, borderRadius: theme.radii.md },
            ]}
          >
            <Text style={{ color: theme.colors.text.muted, fontSize: theme.fontSize.sm }}>
              Lesson video appears here
            </Text>
          </View>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { gap: 12 },
  playerPlaceholder: { aspectRatio: 16 / 9, alignItems: 'center', justifyContent: 'center' },
});
