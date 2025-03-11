import { drizzle } from "drizzle-orm/neon-serverless";
import { neon } from "@neondatabase/serverless";

// Create database connection
const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle(sql);
