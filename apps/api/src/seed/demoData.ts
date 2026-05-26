import bcrypt from 'bcryptjs'
import { normalizeTenantSlug } from '@soteria-forge/shared'
import { CourseModel, EnrollmentModel, TenantModel, UserModel } from '../models/index.js'

const demoPassword = 'SoteriaForgeDemo!2026'

export async function seedDemoData() {
  const slug = normalizeTenantSlug('demo')
  const tenant = await TenantModel.findOneAndUpdate(
    { slug },
    {
      $setOnInsert: {
        name: 'Soteria Forge Demo',
        slug,
        domains: ['demo.localhost'],
        status: 'trial',
        branding: {
          appName: 'Soteria Forge',
          primaryColor: '#1f3f86',
          accentColor: '#c9a84e',
        },
        settings: {
          offlineEnabled: true,
          lowBandwidthMode: true,
          vimeoDomainPrivacyRequired: true,
          defaultCertificateExpiryDays: 365,
        },
      },
    },
    { upsert: true, new: true },
  )

  const passwordHash = await bcrypt.hash(demoPassword, 12)
  const users = [
    {
      email: 'learner@soteriaforge.local',
      name: 'Jordan Lee',
      roles: ['learner'],
      jobTitle: 'Field Technician',
      department: 'Field Operations',
      crew: 'North Yard',
      site: 'Demo Plant',
    },
    {
      email: 'admin@soteriaforge.local',
      name: 'Avery Chen',
      roles: ['learner', 'manager', 'admin'],
      jobTitle: 'Safety Training Manager',
      department: 'EHS',
      crew: 'Training',
      site: 'Demo Plant',
    },
    {
      email: 'superadmin@soteriaforge.local',
      name: 'DevJ Superadmin',
      roles: ['superadmin'],
      jobTitle: 'Platform Owner',
      department: 'Soteria Forge',
    },
  ]

  const createdUsers = []
  for (const user of users) {
    const createdUser = await UserModel.findOneAndUpdate(
      { tenantId: tenant._id, email: user.email },
      { $setOnInsert: { ...user, tenantId: tenant._id, passwordHash } },
      { upsert: true, new: true },
    )
    createdUsers.push(createdUser)
  }

  const course = await CourseModel.findOneAndUpdate(
    { tenantId: tenant._id, title: 'Field Readiness Orientation' },
    {
      $setOnInsert: {
        tenantId: tenant._id,
        title: 'Field Readiness Orientation',
        description: 'A mobile-first introduction to safe, prepared work in spotty-connectivity field environments.',
        status: 'published',
        tags: ['field-ready', 'microlearning', 'safety'],
        fieldReadinessScore: 88,
        certificateExpiresInDays: 365,
        modules: [
          {
            title: 'Start Strong',
            description: 'Short lessons designed for crews, job sites, and low-bandwidth learning.',
            lessons: [
              {
                kind: 'video',
                title: 'Pre-Shift Readiness',
                description: 'A Vimeo-backed micro lesson with transcript-first offline support.',
                durationMinutes: 6,
                required: true,
                vimeoUrl: 'https://vimeo.com/000000000',
                transcript:
                  'Confirm PPE, review the task plan, understand the stop-work trigger, and sync your completion when connectivity returns.',
                offlineSummary:
                  'Offline summary: PPE check, task-plan check, stop-work authority, and supervisor escalation path.',
              },
              {
                kind: 'quiz',
                title: 'Spotty Signal Knowledge Check',
                description: 'Confirm what to do when the network drops mid-training.',
                durationMinutes: 4,
                required: true,
                quizQuestions: [
                  {
                    id: 'offline-q1',
                    prompt: 'What should happen when a learner completes training without connectivity?',
                    options: ['Lose the attempt', 'Queue the attempt and sync later', 'Mark everyone complete'],
                    answer: 'Queue the attempt and sync later',
                    coaching: 'Field-ready LMS flows must preserve attempts and sync with idempotency when online.',
                  },
                ],
              },
              {
                kind: 'practical-signoff',
                title: 'Supervisor Field Sign-Off',
                description: 'A supervisor confirms the learner can apply the procedure in the field.',
                durationMinutes: 5,
                required: true,
              },
            ],
          },
        ],
      },
    },
    { upsert: true, new: true },
  )

  for (const user of createdUsers.filter((candidate) => candidate.roles.includes('learner'))) {
    await EnrollmentModel.findOneAndUpdate(
      { tenantId: tenant._id, userId: user._id, courseId: course._id },
      { $setOnInsert: { tenantId: tenant._id, userId: user._id, courseId: course._id, status: 'assigned', progress: 0 } },
      { upsert: true, new: true },
    )
  }
}
