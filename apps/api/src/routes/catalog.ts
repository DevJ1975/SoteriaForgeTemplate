import { Router } from 'express'
import { asyncHandler } from '../middleware/errors.js'
import { CourseBundleModel, CourseModel, ProductPackageModel } from '../models/index.js'
import { ensureMarketplaceCatalog } from '../utils/marketplace.js'
import { serializeCourse, serializeCourseBundle, serializeProductPackage } from '../utils/serialize.js'

export const catalogRouter = Router()

catalogRouter.get(
  '/packages',
  asyncHandler(async (_, res) => {
    await ensureMarketplaceCatalog()
    const packages = await ProductPackageModel.find({ status: 'active' }).sort({ sortOrder: 1, name: 1 })
    res.json({ packages: packages.map(serializeProductPackage) })
  }),
)

catalogRouter.get(
  '/bundles',
  asyncHandler(async (_, res) => {
    await ensureMarketplaceCatalog()
    const bundles = await CourseBundleModel.find({ status: 'active' }).sort({ sortOrder: 1, name: 1 })
    res.json({ bundles: bundles.map(serializeCourseBundle) })
  }),
)

catalogRouter.get(
  '/courses',
  asyncHandler(async (_, res) => {
    await ensureMarketplaceCatalog()
    const bundles = await CourseBundleModel.find({ status: 'active' })
    const courseIds = bundles.flatMap((bundle) => bundle.courseIds)
    const courses = await CourseModel.find({ _id: { $in: courseIds }, status: 'published' }).sort({ updatedAt: -1 })
    res.json({ courses: courses.map(serializeCourse) })
  }),
)
