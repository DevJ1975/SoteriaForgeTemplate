import {
  calculateCourseProgress,
  isCourseCompleteFromRequiredLessons,
} from '@soteria-forge/shared'
import { CertificateModel, CompletionModel, CourseModel, EnrollmentModel } from '../models/index.js'
import { serializeCertificate, serializeCompletion, serializeEnrollment } from './serialize.js'

type CompletionRuleInput = {
  tenantId: any
  userId: any
  courseId: string
  lessonId?: string
  source?: string
  idempotencyKey: string
}

function requiredLessonIds(course: any) {
  return (course.modules ?? [])
    .flatMap((module: any) => module.lessons ?? [])
    .filter((lesson: any) => lesson.required !== false)
    .map((lesson: any) => String(lesson.id))
}

export async function recordCompletionAndProgress(input: CompletionRuleInput) {
  const course = await CourseModel.findOne({ _id: input.courseId, tenantId: input.tenantId, status: { $ne: 'archived' } })
  if (!course) {
    throw new Error('Course not found')
  }

  const completion = await CompletionModel.findOneAndUpdate(
    { tenantId: input.tenantId, idempotencyKey: input.idempotencyKey },
    {
      $setOnInsert: {
        tenantId: input.tenantId,
        userId: input.userId,
        courseId: input.courseId,
        lessonId: input.lessonId,
        source: input.source ?? 'online',
        idempotencyKey: input.idempotencyKey,
      },
    },
    { upsert: true, returnDocument: 'after' },
  )

  const requiredIds = requiredLessonIds(course)
  const completions = await CompletionModel.find({
    tenantId: input.tenantId,
    userId: input.userId,
    courseId: input.courseId,
    lessonId: { $in: requiredIds },
  }).select('lessonId')
  const completedLessonIds = completions.map((candidate) => String(candidate.lessonId))
  const progress = calculateCourseProgress(requiredIds, completedLessonIds)
  const isComplete = isCourseCompleteFromRequiredLessons(requiredIds, completedLessonIds)

  const enrollment = await EnrollmentModel.findOneAndUpdate(
    { tenantId: input.tenantId, userId: input.userId, courseId: input.courseId },
    {
      $set: {
        status: isComplete ? 'completed' : progress > 0 ? 'in-progress' : 'assigned',
        progress,
        completedAt: isComplete ? new Date() : undefined,
      },
    },
    { returnDocument: 'after' },
  )

  let certificate = null
  if (isComplete && enrollment) {
    const issuedAt = new Date()
    const expiresAt = course.certificateExpiresInDays
      ? new Date(issuedAt.getTime() + course.certificateExpiresInDays * 24 * 60 * 60 * 1000)
      : undefined

    certificate = await CertificateModel.findOneAndUpdate(
      { tenantId: input.tenantId, userId: input.userId, courseId: input.courseId, revokedAt: { $exists: false } },
      {
        $setOnInsert: {
          tenantId: input.tenantId,
          userId: input.userId,
          courseId: input.courseId,
          certificateNumber: `SF-${Date.now()}-${String(input.userId).slice(-5)}`,
          issuedAt,
          expiresAt,
        },
      },
      { upsert: true, returnDocument: 'after' },
    )
  }

  return {
    completion: serializeCompletion(completion),
    enrollment: enrollment ? serializeEnrollment(enrollment) : undefined,
    certificate: certificate ? serializeCertificate(certificate) : null,
  }
}
