import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

// Create database connection with postgres-js
const postgresClient = postgres(process.env.DATABASE_URL!, { 
  ssl: 'require',
  max: 10, // Connection pool size
});
export const sql = postgresClient;
export const db = drizzle(postgresClient);
