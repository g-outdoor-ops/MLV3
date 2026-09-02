import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const appState = sqliteTable("app_state", {
  id: text("id").primaryKey(),
  payload: text("payload").notNull(),
  version: integer("version").notNull().default(1),
  updatedAt: text("updated_at").notNull(),
  updatedBy: text("updated_by"),
});

export const auditEvents = sqliteTable("audit_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  summary: text("summary").notNull(),
  createdAt: text("created_at").notNull(),
});
