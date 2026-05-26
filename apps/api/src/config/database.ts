import mongoose from 'mongoose'
import { env } from './env.js'
import { seedDemoData } from '../seed/demoData.js'

export async function connectDatabase() {
  mongoose.connection.on('connected', () => {
    console.log('MongoDB connected')
  })

  mongoose.connection.on('error', (error) => {
    console.error('MongoDB connection error:', error.message)
  })

  await mongoose.connect(env.mongoUri, {
    serverSelectionTimeoutMS: 5000,
  })

  await seedDemoData()
}

export function getDatabaseStatus() {
  return mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
}
