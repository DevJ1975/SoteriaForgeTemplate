import mongoose from 'mongoose'
import { env } from './env.js'
import { seedDemoData } from '../seed/demoData.js'

let connectionPromise: Promise<typeof mongoose> | null = null
let seeded = false

export async function connectDatabase() {
  if (mongoose.connection.readyState === 1) {
    if (!seeded) {
      await seedDemoData()
      seeded = true
    }
    return mongoose
  }

  if (connectionPromise) {
    await connectionPromise
    if (!seeded) {
      await seedDemoData()
      seeded = true
    }
    return mongoose
  }

  mongoose.connection.on('connected', () => {
    console.log('MongoDB connected')
  })

  mongoose.connection.on('error', (error) => {
    console.error('MongoDB connection error:', error.message)
  })

  connectionPromise = mongoose.connect(env.mongoUri, {
    serverSelectionTimeoutMS: 5000,
  })

  try {
    await connectionPromise
    await seedDemoData()
    seeded = true
    return mongoose
  } catch (error) {
    connectionPromise = null
    throw error
  }
}

export function getDatabaseStatus() {
  return mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
}
