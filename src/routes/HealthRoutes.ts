// src/routes/health.ts
import { Request, Response, Router } from 'express';
import { Sequelize } from 'sequelize';
import Redis, { RedisOptions } from 'ioredis';

interface HealthCheckResponse {
  status: 'OK' | 'Degraded' | 'Unavailable';
  services: {
    database: boolean;
    redis: boolean;
  };
  timestamp: string;
  uptime: number;
  details?: {
    databaseError?: string;
    redisError?: string;
  };
}

const router = Router();

const getRedisConfig = (): RedisOptions => {
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0', 10),
    retryStrategy: (times: number) => Math.min(times * 100, 3000),
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 5000,
  };
};

const checkDatabase = async (): Promise<{ ok: boolean; error?: string }> => {
  const sequelize = new Sequelize({
    dialect: 'postgres',
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    logging: false,
    retry: {
      max: 3,
      timeout: 5000,
    },
  });

  try {
    await sequelize.authenticate();
    await sequelize.close();
    return { ok: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { ok: false, error: errorMessage };
  }
};

const checkRedis = async (): Promise<{ ok: boolean; error?: string }> => {
  const redisClient = new Redis(getRedisConfig());

  try {
    // Teste básico de conexão
    await redisClient.ping();

    // Teste de escrita/leitura
    const testKey = 'healthcheck:test';
    const testValue = Date.now().toString();

    await redisClient.set(testKey, testValue, 'EX', 5);
    const retrievedValue = await redisClient.get(testKey);

    if (retrievedValue !== testValue) {
      throw new Error('Redis read/write inconsistency');
    }

    return { ok: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { ok: false, error: errorMessage };
  } finally {
    await redisClient.quit();
  }
};

router.get('/health', async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    const [dbResult, redisResult] = await Promise.all([
      checkDatabase(),
      checkRedis(),
    ]);

    const allServicesOk = dbResult.ok && redisResult.ok;
    const statusCode = allServicesOk ? 200 : 503;

    const response: HealthCheckResponse = {
      status: allServicesOk ? 'OK' : 'Degraded',
      services: {
        database: dbResult.ok,
        redis: redisResult.ok,
      },
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
    };

    if (!dbResult.ok || !redisResult.ok) {
      response.details = {
        ...(dbResult.error && { databaseError: dbResult.error }),
        ...(redisResult.error && { redisError: redisResult.error }),
      };
    }

    res.status(statusCode).json(response);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    res.status(500).json({
      status: 'Unavailable',
      services: {
        database: false,
        redis: false,
      },
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      details: {
        systemError: `Health check failed: ${errorMessage}`
      }
    });
  } finally {
    console.log(`Health check completed in ${Date.now() - startTime}ms`);
  }
});

export default router;
