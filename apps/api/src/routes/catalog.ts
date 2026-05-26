import { Router } from 'express'
import { asyncHandler } from '../middleware/errors.js'
import { CourseBundleModel, CourseModel, ProductPackageModel } from '../models/index.js'
import { ensureMarketplaceCatalog } from '../utils/marketplace.js'
import { courseSlug, serializeCourseBundle, serializeProductPackage, serializePublicCourse } from '../utils/serialize.js'

export const catalogRouter = Router()

async function activeCatalog() {
  await ensureMarketplaceCatalog()
  const [packages, bundles] = await Promise.all([
    ProductPackageModel.find({ status: 'active' }).sort({ sortOrder: 1, name: 1 }),
    CourseBundleModel.find({ status: 'active' }).sort({ sortOrder: 1, name: 1 }),
  ])
  const courseIds = [...new Set(bundles.flatMap((bundle) => bundle.courseIds).map((id) => id.toString()))]
  const courses = await CourseModel.find({
    _id: { $in: courseIds },
    status: 'published',
    slug: { $exists: true, $ne: '' },
    publicSummary: { $exists: true, $ne: '' },
  }).sort({ updatedAt: -1 })
  const packageIdsByCourse = new Map<string, Set<string>>()

  for (const productPackage of packages) {
    const packageBundles = bundles.filter((bundle) =>
      (productPackage.bundleIds ?? []).some((id: any) => id.toString() === bundle.id),
    )
    for (const bundle of packageBundles) {
      for (const courseId of bundle.courseIds ?? []) {
        const key = courseId.toString()
        const packageIds = packageIdsByCourse.get(key) ?? new Set<string>()
        packageIds.add(productPackage.id)
        packageIdsByCourse.set(key, packageIds)
      }
    }
  }

  return { packages, bundles, courses, packageIdsByCourse }
}

function matches(value: unknown, query: unknown) {
  if (!query) return true
  return String(value ?? '').toLowerCase() === String(query).toLowerCase()
}

catalogRouter.get(
  '/packages',
  asyncHandler(async (_, res) => {
    const { packages } = await activeCatalog()
    res.json({ packages: packages.map(serializeProductPackage) })
  }),
)

catalogRouter.get(
  '/landing',
  asyncHandler(async (_, res) => {
    const { packages, courses, packageIdsByCourse } = await activeCatalog()
    const publicCourses = courses.map((course) =>
      serializePublicCourse(course, [...(packageIdsByCourse.get(course.id) ?? new Set<string>())]),
    )
    const categories = [...new Set(publicCourses.map((course) => course.category))]

    res.json({
      packages: packages.map(serializeProductPackage),
      courses: publicCourses.slice(0, 6),
      categories,
      stats: {
        packages: packages.length,
        courses: publicCourses.length,
        categories: categories.length,
        certificateCourses: publicCourses.filter((course) => /certificate/i.test(course.certificateLabel)).length,
      },
    })
  }),
)

catalogRouter.get(
  '/bundles',
  asyncHandler(async (_, res) => {
    const { bundles } = await activeCatalog()
    res.json({ bundles: bundles.map(serializeCourseBundle) })
  }),
)

catalogRouter.get(
  '/courses',
  asyncHandler(async (_, res) => {
    const { courses, packageIdsByCourse } = await activeCatalog()
    const query = String(reqQuery(_, 'q') ?? '').toLowerCase()
    const publicCourses = courses
      .map((course) => serializePublicCourse(course, [...(packageIdsByCourse.get(course.id) ?? new Set<string>())]))
      .filter((course) => matches(course.category, reqQuery(_, 'category')))
      .filter((course) => matches(course.role, reqQuery(_, 'role')))
      .filter((course) => matches(course.topic, reqQuery(_, 'topic')))
      .filter((course) => !reqQuery(_, 'certificate') || /certificate/i.test(course.certificateLabel))
      .filter((course) => {
        if (!query) return true
        return [course.title, course.publicSummary, course.category, course.role, course.topic, ...course.tags]
          .join(' ')
          .toLowerCase()
          .includes(query)
      })

    res.json({ courses: publicCourses })
  }),
)

catalogRouter.get(
  '/courses/:slug',
  asyncHandler(async (req, res) => {
    const { courses, packageIdsByCourse } = await activeCatalog()
    const course = courses.find((candidate) => courseSlug(candidate) === req.params.slug)

    if (!course) {
      res.status(404).json({ error: 'Course not found' })
      return
    }

    res.json({ course: serializePublicCourse(course, [...(packageIdsByCourse.get(course.id) ?? new Set<string>())]) })
  }),
)

function reqQuery(req: any, key: string) {
  const value = req.query?.[key]
  return Array.isArray(value) ? value[0] : value
}
