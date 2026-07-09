import { boolean, doublePrecision, integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core'

// --- Better Auth required tables -------------------------------------------
// Column names are camelCase to match Better Auth's defaults. Do not rename.

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('emailVerified').notNull().default(false),
  image: text('image'),
  banned: boolean('banned').notNull().default(false),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
})

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expiresAt').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
  ipAddress: text('ipAddress'),
  userAgent: text('userAgent'),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
})

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('accountId').notNull(),
  providerId: text('providerId').notNull(),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('accessToken'),
  refreshToken: text('refreshToken'),
  idToken: text('idToken'),
  accessTokenExpiresAt: timestamp('accessTokenExpiresAt'),
  refreshTokenExpiresAt: timestamp('refreshTokenExpiresAt'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
})

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expiresAt').notNull(),
  createdAt: timestamp('createdAt').defaultNow(),
  updatedAt: timestamp('updatedAt').defaultNow(),
})

// --- App tables ------------------------------------------------------------

export const spots = pgTable('spots', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  lat: doublePrecision('lat').notNull(),
  lng: doublePrecision('lng').notNull(),
  spotType: text('spot_type').notNull().default('street'),
  difficulty: integer('difficulty').notNull().default(3),
  surface: text('surface').notNull().default('concrete'),
  security: text('security').notNull().default('chill'),
  lighting: boolean('lighting').notNull().default(false),
  covered: boolean('covered').notNull().default(false),
  description: text('description').notNull().default(''),
  tags: text('tags').notNull().default(''),
  userId: text('userId'),
  authorName: text('authorName').notNull().default(''),
  images: text('images').notNull().default('[]'),
  likes: text('likes').notNull().default('[]'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
})

export const reports = pgTable('reports', {
  id: serial('id').primaryKey(),
  spotId: integer('spotId').notNull(),
  reason: text('reason').notNull().default(''),
  reporterId: text('reporterId'),
  reporterName: text('reporterName').notNull().default(''),
  status: text('status').notNull().default('open'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
})

export const comments = pgTable('comments', {
  id: serial('id').primaryKey(),
  spotId: integer('spotId').notNull(),
  userId: text('userId'),
  authorName: text('authorName').notNull().default(''),
  text: text('text').notNull(),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
})

export const messages = pgTable('messages', {
  id: serial('id').primaryKey(),
  userId: text('userId'),
  authorName: text('authorName').notNull().default(''),
  text: text('text').notNull(),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
})

export type Spot = typeof spots.$inferSelect
export type NewSpot = typeof spots.$inferInsert
export type Report = typeof reports.$inferSelect
export type Comment = typeof comments.$inferSelect
export type Message = typeof messages.$inferSelect
