import {sqliteTable,text,integer,index} from 'drizzle-orm/sqlite-core';
export const rooms=sqliteTable('rooms',{
  id:text('id').primaryKey().notNull(),revision:integer('revision').notNull(),data:text('data').notNull(),
  expiresAt:integer('expires_at').notNull(),seen0:integer('seen0').notNull(),seen1:integer('seen1').notNull().default(0)
},table=>[index('rooms_expiry').on(table.expiresAt)]);
export const roomLimits=sqliteTable('room_limits',{
  id:text('id').primaryKey().notNull(),count:integer('count').notNull(),expiresAt:integer('expires_at').notNull()
});
