/**
 * CourseDetailScreen — the course PLAYER home for THIS tenant.
 *
 * Loads the full course tree (course + modules + lessons + the caller's own
 * enrollment) through `useCourseTree`, which is tenant-scoped by Postgres RLS:
 * the `[id]` param from a deep link can only ever resolve within the caller's own
 * tenant. It renders:
 *
 *   - a header Card with a status Badge and a ProgressBar driven by the
 *     enrollment progress AND locally-completed required lessons (so the bar is
 *     correct offline, the instant a completion is queued),
 *   - the module → lesson list (an Accordion of modules, each listing its ordered
 *     lessons with per-lesson completion state, kind, and duration), and
 *   - a primary "Continue" Button that opens the next incomplete lesson.
 *
 * Tapping a lesson pushes the LessonPlayer route. All identity/tenant come from
 * the verified session (via the hook's `useAuth`), never from route input. No
 * hardcoded brand hex — every color is a `@soteria-forge/ui` token.
 */
import { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  Accordion,
  Badge,
  Button,
  Card,
  Chip,
  Divider,
  ProgressBar,
  Skeleton,
  useTheme,
} from '@soteria-forge/ui';
import { CertificateView, Screen } from '../components';
import { useAuth } from '../auth';
import {
  useCertificate,
  useCourseTree,
  type CertificateRecord,
  type LessonNode,
} from '../api';

/** Human label for a lesson kind. */
function kindLabel(kind: LessonNode['kind']): string {
  switch (kind) {
    case 'video':
      return 'Video';
    case 'quiz':
      return 'Quiz';
    case 'reflection':
      return 'Reflection';
    case 'document':
      return 'Document';
    case 'practical-signoff':
      return 'Sign-off';
    case 'scorm':
      return 'Module';
    case 'game':
      return 'Interactive';
    default:
      return 'Lesson';
  }
}

export function CourseDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { tree, loading, backendPending, error, refetch } = useCourseTree(id);
  // The caller's own certificate for this course (RLS-scoped, owner-only). Null
  // until the course is complete + a certificate has been issued server-side.
  const { certificate, refetch: refetchCertificate } = useCertificate(id);
  const [certOpen, setCertOpen] = useState(false);

  // Pull-to-refresh keeps the loaded tree on screen (the skeleton state below
  // is only for the initial load); the spinner clears when loading settles.
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    if (!loading) setRefreshing(false);
  }, [loading]);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    refetch();
    refetchCertificate();
  }, [refetch, refetchCertificate]);

  // Re-read the tree (and thus the LOCAL completed-lesson set) whenever this
  // screen regains focus — so returning from the lesson player, where a
  // completion was just enqueued, advances the progress bar without a manual
  // refresh. The initial load is handled inside the hook; this only re-fires on
  // subsequent focuses.
  useFocusEffect(
    useCallback(() => {
      refetch();
      // Re-check the certificate too — it's issued server-side when the
      // enrollment completes, so a fresh visit after finishing surfaces it.
      refetchCertificate();
    }, [refetch, refetchCertificate]),
  );

  const openLesson = (lessonId: string) => {
    router.push({ pathname: '/(app)/lesson/[id]', params: { id: lessonId } });
  };

  if (loading && !refreshing) {
    // Skeletons shaped like the loaded layout: header card + accordion rows.
    return (
      <Screen scroll={false}>
        <Card raised>
          <View style={styles.headerTop}>
            <Skeleton variant="line" height={20} width={92} radius="pill" />
            <Skeleton variant="line" height={14} width={48} />
          </View>
          <Skeleton variant="line" height={22} width="78%" style={{ marginTop: 14 }} />
          <Skeleton variant="line" width="94%" style={{ marginTop: 12 }} />
          <Skeleton variant="line" width="66%" style={{ marginTop: 8 }} />
          <Skeleton variant="block" height={10} radius="pill" style={{ marginTop: 20 }} />
          <Skeleton variant="line" width={140} style={{ marginTop: 10 }} />
        </Card>
        <Card>
          <Skeleton variant="line" height={16} width="56%" />
        </Card>
        <Card>
          <Skeleton variant="line" height={16} width="48%" />
        </Card>
        <Card>
          <Skeleton variant="line" height={16} width="52%" />
        </Card>
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen>
        <Notice tone="danger" text={error} actionLabel="Retry" onAction={refetch} />
      </Screen>
    );
  }

  if (backendPending) {
    return (
      <Screen>
        <Notice text="Course details load once the app is connected to Supabase." />
      </Screen>
    );
  }

  if (!tree) {
    return (
      <Screen>
        <Notice text="Course not found in your organization." />
      </Screen>
    );
  }

  const { course } = tree;
  const progress = Math.min(1, Math.max(0, tree.progress));
  const completed = progress >= 1;

  // "Continue" opens the first not-yet-completed lesson (or the first lesson when
  // everything is done, for review).
  const nextLesson = tree.lessons.find((l) => !l.completed) ?? tree.lessons[0];
  const completedCount = tree.lessons.filter((l) => l.completed).length;

  return (
    <Screen onRefresh={onRefresh} refreshing={refreshing}>
      {/* Header card */}
      <Card raised>
        <View style={styles.headerTop}>
          <Badge
            label={completed ? 'Certified' : 'In progress'}
            tone={completed ? 'success' : 'primary'}
          />
          {course.durationMinutes ? (
            <Text
              style={{
                color: theme.colors.textMuted,
                fontFamily: theme.fonts.body,
                fontSize: 13,
              }}
            >
              {course.durationMinutes} min
            </Text>
          ) : null}
        </View>
        <Text
          style={{
            color: theme.colors.text,
            fontFamily: theme.fonts.display,
            fontWeight: '700',
            fontSize: 26,
            marginTop: 8,
          }}
        >
          {course.title}
        </Text>
        {course.description ? (
          <Text
            style={{
              color: theme.colors.textMuted,
              fontFamily: theme.fonts.body,
              fontSize: 15,
              lineHeight: 22,
              marginTop: 8,
            }}
          >
            {course.description}
          </Text>
        ) : null}

        <View style={styles.progressRow}>
          <ProgressBar value={progress} height={10} style={{ flex: 1 }} />
          <Text
            style={{
              color: theme.colors.primary,
              fontFamily: theme.fonts.display,
              fontWeight: '700',
              fontSize: 15,
              width: 44,
              textAlign: 'right',
            }}
          >
            {Math.round(progress * 100)}%
          </Text>
        </View>
        <Text
          style={{
            color: theme.colors.textMuted,
            fontFamily: theme.fonts.body,
            fontSize: 13,
            marginTop: 6,
          }}
        >
          {completedCount} of {tree.lessons.length} lessons complete
        </Text>

        {tree.lessons.length > 0 ? (
          <>
            <Divider spacing={16} />
            <Button
              title={completed ? 'Review course' : 'Continue'}
              fullWidth
              onPress={() => nextLesson && openLesson(nextLesson.id)}
            />
          </>
        ) : null}
      </Card>

      {/* Achievement / Certificate earned — shown once the course is complete AND
          a certificate has been issued (server-side, on enrollment completion).
          Tapping it opens the branded certificate. RLS makes the row owner-only. */}
      {completed && certificate ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="View your certificate"
          onPress={() => setCertOpen(true)}
          style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
        >
          <Card raised style={styles.certRow}>
            <View
              style={[
                styles.certGlyph,
                { backgroundColor: theme.colors.success, borderRadius: theme.radii.md },
              ]}
            >
              <Text style={{ color: theme.colors.onPrimary, fontSize: 22 }}>★</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  color: theme.colors.text,
                  fontFamily: theme.fonts.display,
                  fontWeight: '700',
                  fontSize: 17,
                }}
              >
                Certificate earned
              </Text>
              <Text
                style={{
                  color: theme.colors.textMuted,
                  fontFamily: theme.fonts.body,
                  fontSize: 13,
                  marginTop: 2,
                }}
              >
                {certificate.certificateNumber} · Tap to view
              </Text>
            </View>
            <Badge label="View" tone="success" />
          </Card>
        </Pressable>
      ) : null}

      {/* Modules → lessons */}
      {tree.modules.length > 0 ? (
        <Accordion
          defaultOpen={[0]}
          multiple
          items={tree.modules.map((mod) => ({
            title: `${mod.title}  ·  ${mod.lessons.length} lesson${
              mod.lessons.length === 1 ? '' : 's'
            }`,
            content: (
              <View style={styles.lessonList}>
                {mod.lessons.length === 0 ? (
                  <Text
                    style={{
                      color: theme.colors.textMuted,
                      fontFamily: theme.fonts.body,
                      fontSize: 14,
                    }}
                  >
                    No lessons in this module yet.
                  </Text>
                ) : (
                  mod.lessons.map((lesson) => (
                    <LessonRow key={lesson.id} lesson={lesson} onPress={() => openLesson(lesson.id)} />
                  ))
                )}
              </View>
            ),
          }))}
        />
      ) : (
        <Notice text="This course has no modules yet." />
      )}

      {/* Full-screen certificate viewer. Rendered from the OWNER's certificate
          row; recipient name comes from the verified session, never the row. */}
      {certificate && user ? (
        <Modal
          visible={certOpen}
          animationType="slide"
          transparent={false}
          onRequestClose={() => setCertOpen(false)}
          presentationStyle="fullScreen"
        >
          <CertificateModalBody
            certificate={certificate}
            recipientName={user.displayName ?? user.email ?? user.username}
            onClose={() => setCertOpen(false)}
          />
        </Modal>
      ) : null}
    </Screen>
  );
}

/** The scrollable body of the full-screen certificate modal (themed chrome). */
function CertificateModalBody({
  certificate,
  recipientName,
  onClose,
}: {
  certificate: CertificateRecord;
  recipientName: string;
  onClose: () => void;
}) {
  const theme = useTheme();
  // The modal is full-screen (outside Screen's SafeAreaView), so pad the top
  // bar below the real notch/status-bar inset instead of a magic constant.
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.modalRoot, { backgroundColor: theme.colors.bg }]}>
      <View style={[styles.modalBar, { paddingTop: insets.top + theme.spacing.md }]}>
        <Text
          style={{
            color: theme.colors.text,
            fontFamily: theme.fonts.display,
            fontWeight: '700',
            fontSize: 20,
          }}
        >
          Your certificate
        </Text>
        <Button title="Close" variant="secondary" size="sm" onPress={onClose} />
      </View>
      <ScrollView contentContainerStyle={styles.modalContent}>
        <CertificateView certificate={certificate} recipientName={recipientName} />
      </ScrollView>
    </View>
  );
}

/** One tappable lesson row with completion state, kind, and duration. */
function LessonRow({ lesson, onPress }: { lesson: LessonNode; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
    >
      <Card style={styles.lessonCard}>
      <View style={styles.lessonRow}>
        {/* Completion pip */}
        <View
          style={[
            styles.pip,
            {
              borderColor: lesson.completed ? theme.colors.success : theme.colors.border,
              backgroundColor: lesson.completed ? theme.colors.success : 'transparent',
            },
          ]}
        >
          {lesson.completed ? (
            <Text style={{ color: theme.colors.onPrimary, fontSize: 12, fontWeight: '700' }}>
              ✓
            </Text>
          ) : null}
        </View>

        <View style={{ flex: 1 }}>
          <Text
            numberOfLines={2}
            style={{
              color: theme.colors.text,
              fontFamily: theme.fonts.display,
              fontWeight: '600',
              fontSize: 15,
            }}
          >
            {lesson.title}
          </Text>
          <View style={styles.metaRow}>
            <Chip label={kindLabel(lesson.kind)} />
            {lesson.durationMinutes > 0 ? (
              <Text
                style={{
                  color: theme.colors.textMuted,
                  fontFamily: theme.fonts.body,
                  fontSize: 12,
                }}
              >
                {lesson.durationMinutes} min
              </Text>
            ) : null}
            {lesson.required ? (
              <Text
                style={{
                  color: theme.colors.textMuted,
                  fontFamily: theme.fonts.body,
                  fontSize: 12,
                }}
              >
                Required
              </Text>
            ) : null}
          </View>
        </View>

        {lesson.completed ? (
          <Badge label="Done" tone="success" />
        ) : (
          <Badge label="Start" tone="primary" />
        )}
      </View>
      </Card>
    </Pressable>
  );
}

/** Simple themed notice card for the error / pending / not-found states. */
function Notice({
  text,
  tone,
  actionLabel,
  onAction,
}: {
  text: string;
  tone?: 'danger';
  actionLabel?: string;
  onAction?: () => void;
}) {
  const theme = useTheme();
  return (
    <Card style={{ gap: 10 }}>
      <Text
        style={{
          color: tone === 'danger' ? theme.colors.danger : theme.colors.textMuted,
          fontFamily: theme.fonts.body,
          fontSize: 15,
          lineHeight: 22,
        }}
      >
        {text}
      </Text>
      {actionLabel && onAction ? (
        <Button title={actionLabel} variant="secondary" size="sm" onPress={onAction} />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 18 },
  lessonList: { gap: 10 },
  lessonCard: { paddingVertical: 12 },
  lessonRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6, flexWrap: 'wrap' },
  pip: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  certRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  certGlyph: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  modalRoot: { flex: 1 },
  modalBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    // paddingTop comes from the live safe-area inset at the call site.
    paddingBottom: 16,
  },
  modalContent: { padding: 16, paddingBottom: 48 },
});
