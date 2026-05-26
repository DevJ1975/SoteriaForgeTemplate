import type { OfflineSyncItem } from '@soteria-forge/shared'
import { api } from '../services/api'
import { getQueuedItems, queueOfflineItem, removeQueuedItems } from './db'

const deviceIdKey = 'soteria-forge:deviceId'

export function getDeviceId() {
  const existing = localStorage.getItem(deviceIdKey)
  if (existing) return existing
  const next = `device-${Date.now()}-${Math.random().toString(36).slice(2)}`
  localStorage.setItem(deviceIdKey, next)
  return next
}

export async function enqueueSyncItem(item: Omit<OfflineSyncItem, 'idempotencyKey' | 'createdAt'> & { idempotencyKey?: string }) {
  const queuedItem: OfflineSyncItem = {
    ...item,
    idempotencyKey: item.idempotencyKey ?? `${item.type}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    createdAt: new Date().toISOString(),
  }
  await queueOfflineItem(queuedItem)
  return queuedItem
}

export async function flushSyncQueue() {
  const items = await getQueuedItems()
  if (!items.length) return { accepted: [], rejected: [] }

  const response = await api.sync({
    deviceId: getDeviceId(),
    items,
  })

  await removeQueuedItems(response.accepted)
  return response
}
