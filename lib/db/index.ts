import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

const connectionString = process.env.DATABASE_URL
const isAiven = connectionString?.includes('aivencloud.com')

export const pool = new Pool({ 
  connectionString,
  ssl: isAiven ? { rejectUnauthorized: false } : undefined
})
export const db = drizzle(pool, { schema })
