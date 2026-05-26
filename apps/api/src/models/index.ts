import mongoose, { Schema } from 'mongoose'
import type {
  AssetKind,
  AttemptStatus,
  BillingStatus,
  CommerceStatus,
  CourseStatus,
  EnrollmentStatus,
  LessonKind,
  MarketplaceOrderStatus,
  SubscriptionStatus,
  TenantMode,
  TenantStatus,
  UserRole,
} from '@soteria-forge/shared'

const timestamps = { timestamps: true }

const tenantScoped = {
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
}

const tenantBrandingSchema = new Schema(
  {
    appName: { type: String, required: true },
    logoUrl: String,
    primaryColor: { type: String, default: '#3DA9FC' },
    accentColor: { type: String, default: '#FF6B1F' },
  },
  { _id: false },
)

const tenantSettingsSchema = new Schema(
  {
    offlineEnabled: { type: Boolean, default: true },
    lowBandwidthMode: { type: Boolean, default: true },
    vimeoDomainPrivacyRequired: { type: Boolean, default: true },
    defaultCertificateExpiryDays: Number,
  },
  { _id: false },
)

const lessonSchema = new Schema(
  {
    kind: { type: String, required: true, enum: ['video', 'quiz', 'game', 'scorm', 'document', 'reflection', 'practical-signoff'] satisfies LessonKind[] },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    durationMinutes: { type: Number, default: 5 },
    required: { type: Boolean, default: true },
    vimeoUrl: String,
    assetId: { type: Schema.Types.ObjectId, ref: 'Asset' },
    quizQuestions: [
      {
        id: String,
        prompt: String,
        options: [String],
        answer: String,
        coaching: String,
      },
    ],
    transcript: String,
    offlineSummary: String,
  },
  { _id: true },
)

const moduleSchema = new Schema(
  {
    title: { type: String, required: true },
    description: String,
    lessons: [lessonSchema],
  },
  { _id: true },
)

export const TenantModel = mongoose.model(
  'Tenant',
  new Schema(
    {
      name: { type: String, required: true },
      slug: { type: String, required: true, unique: true, index: true },
      domains: { type: [String], default: [] },
      status: { type: String, enum: ['active', 'trial', 'suspended', 'archived'] satisfies TenantStatus[], default: 'trial' },
      mode: { type: String, enum: ['marketplace', 'dedicated'] satisfies TenantMode[], default: 'dedicated', index: true },
      billingStatus: {
        type: String,
        enum: ['none', 'incomplete', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'manual'] satisfies BillingStatus[],
        default: 'none',
        index: true,
      },
      seatLimit: Number,
      marketplaceOriginTenantId: { type: Schema.Types.ObjectId, ref: 'Tenant' },
      dedicatedSubdomain: String,
      branding: { type: tenantBrandingSchema, required: true },
      settings: { type: tenantSettingsSchema, required: true },
    },
    timestamps,
  ),
)

export const CourseBundleModel = mongoose.model(
  'CourseBundle',
  new Schema(
    {
      name: { type: String, required: true },
      slug: { type: String, required: true, unique: true, index: true },
      description: { type: String, default: '' },
      category: { type: String, default: 'Field Training' },
      status: { type: String, enum: ['draft', 'active', 'archived'] satisfies CommerceStatus[], default: 'draft', index: true },
      courseIds: [{ type: Schema.Types.ObjectId, ref: 'Course' }],
      sortOrder: { type: Number, default: 100 },
    },
    timestamps,
  ),
)

export const ProductPackageModel = mongoose.model(
  'ProductPackage',
  new Schema(
    {
      name: { type: String, required: true },
      slug: { type: String, required: true, unique: true, index: true },
      description: { type: String, default: '' },
      status: { type: String, enum: ['draft', 'active', 'archived'] satisfies CommerceStatus[], default: 'draft', index: true },
      bundleIds: [{ type: Schema.Types.ObjectId, ref: 'CourseBundle' }],
      seatLimit: { type: Number, default: 1 },
      featureFlags: { type: Map, of: Boolean, default: {} },
      stripeProductId: String,
      stripePriceId: String,
      priceLabel: String,
      buyerType: { type: String, enum: ['individual', 'company', 'both'], default: 'both' },
      sortOrder: { type: Number, default: 100 },
    },
    timestamps,
  ),
)

export const UserModel = mongoose.model(
  'User',
  new Schema(
    {
      ...tenantScoped,
      email: { type: String, required: true, lowercase: true, trim: true },
      name: { type: String, required: true },
      passwordHash: { type: String, required: true },
      roles: { type: [String], enum: ['learner', 'manager', 'admin', 'superadmin'] satisfies UserRole[], default: ['learner'] },
      jobTitle: String,
      department: String,
      crew: String,
      site: String,
      invitedAt: Date,
      lastLoginAt: Date,
    },
    timestamps,
  ).index({ tenantId: 1, email: 1 }, { unique: true }),
)

export const RoleAssignmentModel = mongoose.model(
  'RoleAssignment',
  new Schema(
    {
      ...tenantScoped,
      userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      role: { type: String, required: true },
      scope: { type: String, default: 'tenant' },
      assignedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    },
    timestamps,
  ),
)

export const CourseModel = mongoose.model(
  'Course',
  new Schema(
    {
      ...tenantScoped,
      title: { type: String, required: true },
      description: { type: String, default: '' },
      status: { type: String, enum: ['draft', 'published', 'archived'] satisfies CourseStatus[], default: 'draft' },
      tags: { type: [String], default: [] },
      fieldReadinessScore: { type: Number, default: 80 },
      certificateExpiresInDays: Number,
      modules: [moduleSchema],
    },
    timestamps,
  ),
)

export const AssetModel = mongoose.model(
  'Asset',
  new Schema(
    {
      ...tenantScoped,
      kind: { type: String, enum: ['vimeo-video', 'scorm-package', 'document', 'thumbnail', 'offline-bundle'] satisfies AssetKind[], required: true },
      title: { type: String, required: true },
      storageKey: String,
      sourceUrl: String,
      mimeType: String,
      sizeBytes: Number,
      checksum: String,
    },
    timestamps,
  ),
)

export const EnrollmentModel = mongoose.model(
  'Enrollment',
  new Schema(
    {
      ...tenantScoped,
      userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
      status: { type: String, enum: ['assigned', 'in-progress', 'completed', 'overdue', 'expired'] satisfies EnrollmentStatus[], default: 'assigned' },
      dueAt: Date,
      completedAt: Date,
      progress: { type: Number, default: 0 },
    },
    timestamps,
  ).index({ tenantId: 1, userId: 1, courseId: 1 }, { unique: true }),
)

export const AttemptModel = mongoose.model(
  'Attempt',
  new Schema(
    {
      ...tenantScoped,
      userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
      lessonId: { type: String, required: true },
      kind: { type: String, required: true },
      status: { type: String, enum: ['started', 'completed', 'failed', 'synced', 'queued'] satisfies AttemptStatus[], default: 'started' },
      score: Number,
      idempotencyKey: { type: String, required: true },
      payload: Schema.Types.Mixed,
    },
    timestamps,
  ).index({ tenantId: 1, idempotencyKey: 1 }, { unique: true }),
)

export const CompletionModel = mongoose.model(
  'Completion',
  new Schema(
    {
      ...tenantScoped,
      userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
      lessonId: String,
      completedAt: { type: Date, default: Date.now },
      source: { type: String, default: 'online' },
      idempotencyKey: { type: String, required: true },
    },
    timestamps,
  ).index({ tenantId: 1, idempotencyKey: 1 }, { unique: true }),
)

export const CertificateModel = mongoose.model(
  'Certificate',
  new Schema(
    {
      ...tenantScoped,
      userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      courseId: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
      certificateNumber: { type: String, required: true },
      issuedAt: { type: Date, default: Date.now },
      expiresAt: Date,
      revokedAt: Date,
    },
    timestamps,
  ),
)

export const XapiStatementModel = mongoose.model(
  'XapiStatement',
  new Schema(
    {
      ...tenantScoped,
      statementId: { type: String, required: true },
      actor: Schema.Types.Mixed,
      verb: Schema.Types.Mixed,
      object: Schema.Types.Mixed,
      result: Schema.Types.Mixed,
      context: Schema.Types.Mixed,
      timestamp: { type: Date, required: true },
      stored: { type: Date, default: Date.now },
      idempotencyKey: String,
    },
    timestamps,
  ).index({ tenantId: 1, statementId: 1 }, { unique: true }),
)

export const ScormRuntimeModel = mongoose.model(
  'ScormRuntime',
  new Schema(
    {
      ...tenantScoped,
      attemptId: { type: Schema.Types.ObjectId, ref: 'Attempt', required: true },
      packageId: { type: Schema.Types.ObjectId, ref: 'Asset', required: true },
      version: { type: String, enum: ['1.2', '2004'], required: true },
      lessonStatus: String,
      completionStatus: String,
      successStatus: String,
      scoreRaw: Number,
      scoreMin: Number,
      scoreMax: Number,
      suspendData: String,
      location: String,
      sessionTime: String,
      totalTime: String,
      interactions: [Schema.Types.Mixed],
    },
    timestamps,
  ),
)

export const SubscriptionModel = mongoose.model(
  'Subscription',
  new Schema(
    {
      ...tenantScoped,
      buyerUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      packageId: { type: Schema.Types.ObjectId, ref: 'ProductPackage', required: true },
      status: {
        type: String,
        enum: ['incomplete', 'trialing', 'active', 'past_due', 'canceled', 'unpaid'] satisfies SubscriptionStatus[],
        required: true,
        index: true,
      },
      stripeCustomerId: { type: String, index: true },
      stripeSubscriptionId: { type: String, index: true },
      currentPeriodEnd: Date,
      cancelAtPeriodEnd: { type: Boolean, default: false },
    },
    timestamps,
  ),
)

export const EntitlementModel = mongoose.model(
  'Entitlement',
  new Schema(
    {
      ...tenantScoped,
      packageId: { type: Schema.Types.ObjectId, ref: 'ProductPackage', required: true },
      courseIds: [{ type: Schema.Types.ObjectId, ref: 'Course' }],
      seatLimit: { type: Number, default: 1 },
      features: { type: Map, of: Boolean, default: {} },
      source: { type: String, enum: ['stripe', 'manual', 'trial', 'demo'], default: 'stripe' },
    },
    timestamps,
  ).index({ tenantId: 1, packageId: 1 }, { unique: true }),
)

export const MarketplaceOrderModel = mongoose.model(
  'MarketplaceOrder',
  new Schema(
    {
      tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', index: true },
      packageId: { type: Schema.Types.ObjectId, ref: 'ProductPackage', required: true },
      buyerEmail: { type: String, required: true, lowercase: true, trim: true },
      buyerName: { type: String, required: true },
      buyerType: { type: String, enum: ['individual', 'company'], required: true },
      companyName: String,
      seatCount: { type: Number, default: 1 },
      status: {
        type: String,
        enum: ['pending', 'checkout-created', 'completed', 'canceled', 'failed'] satisfies MarketplaceOrderStatus[],
        default: 'pending',
        index: true,
      },
      stripeCheckoutSessionId: { type: String, index: true },
    },
    timestamps,
  ),
)

export const AuditEventModel = mongoose.model(
  'AuditEvent',
  new Schema(
    {
      tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', index: true },
      actorUserId: { type: Schema.Types.ObjectId, ref: 'User' },
      action: { type: String, required: true },
      resourceType: String,
      resourceId: String,
      metadata: Schema.Types.Mixed,
      ip: String,
      userAgent: String,
    },
    timestamps,
  ),
)
