// Variável que controla o ambiente de desenvolvimento - mesma do database.ts
const development = true;

// Configurações do Redis para desenvolvimento e produção
const redisConfig = {
  // Em ambiente de desenvolvimento, usamos o Redis na porta padrão 6379
  development: {
    uri: process.env.REDIS_URI || "redis://127.0.0.1:6379",
    limiterMax: process.env.REDIS_OPT_LIMITER_MAX || 1,
    limiterDuration: process.env.REDIS_OPT_LIMITER_DURATION || 3000
  },
  // Em produção, usamos a configuração original
  production: {
    uri: process.env.REDIS_URI || "redis://127.0.0.1:6379",
    limiterMax: process.env.REDIS_OPT_LIMITER_MAX || 1,
    limiterDuration: process.env.REDIS_OPT_LIMITER_DURATION || 3000
  }
};

// Exportar as configurações com base no ambiente
export const REDIS_URI_CONNECTION = development ? redisConfig.development.uri : redisConfig.production.uri;
export const REDIS_OPT_LIMITER_MAX = development ? redisConfig.development.limiterMax : redisConfig.production.limiterMax;
export const REDIS_OPT_LIMITER_DURATION = development ? redisConfig.development.limiterDuration : redisConfig.production.limiterDuration;
