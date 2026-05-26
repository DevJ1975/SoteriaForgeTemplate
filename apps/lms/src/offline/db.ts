import { openDB, type DBSchema } from 'idb'
import type { CourseDTO, OfflineSyncItem } from '@soteria-forge/shared'

type OfflineCourse = CourseDTO & {
  cachedAt: string
}

interface SoteriaOfflineSchema extends DBSchema {
  courses: {
    key: string
    value: OfflineCourse
  }
  syncQueue: {
    key: string
    value: OfflineSyncItem
  }
}

const dbPromise = openDB<SoteriaOfflineSchema>('soteria-forge-offline', 1, {
  upgrade(db) {
    db.createObjectStore('courses', { keyPath: 'id' })
    db.createObjectStore('syncQueue', { keyPath: 'idempotencyKey' })
  },
})

export async function cacheCourses(courses: CourseDTO[]) {
  const db = await dbPromise
  const transaction = db.transaction('courses', 'readwrite')
  const cachedAt = new Date().toISOString()

  await Promise.all(courses.map((course) => transaction.store.put({ ...course, cachedAt })))
  await transaction.done
}

export async function getCachedCourses() {
  return (await dbPromise).getAll('courses')
}

export async function queueOfflineItem(item: OfflineSyncItem) {
  return (await dbPromise).put('syncQueue', item)
}

export async function getQueuedItems() {
  return (await dbPromise).getAll('syncQueue')
}

export async function removeQueuedItems(keys: string[]) {
  const db = await dbPromise
  const transaction = db.transaction('syncQueue', 'readwrite')
  await Promise.all(keys.map((key) => transaction.store.delete(key)))
  await transaction.done
}
