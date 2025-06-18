import {Pool} from 'pg'

const connectionString = process.env.DATABASE_URL;

export const pool = new Pool({
    connectionString,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
})

