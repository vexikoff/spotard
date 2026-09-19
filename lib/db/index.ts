import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

// DATABASE_URL's Neon project hit its data-transfer quota; POSTGRES_URL points
// at a working Neon host provisioned by the same integration.
export const pool = new Pool({
  connectionString: process.env.POSTGRES_URL ?? process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})
export const db = drizzle(pool, { schema })
