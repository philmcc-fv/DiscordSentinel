import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

// Create database connection with postgres-js
const sql = postgres(process.env.DATABASE_URL!, { 
  ssl: 'require',
  max: 10, // Connection pool size
});
export const db = drizzle(sql);
