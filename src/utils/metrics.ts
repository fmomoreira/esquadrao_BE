import { Request, Response } from "express";
import client from "prom-client";

// Cria um registro para coletar métricas
const register = new client.Registry();

// Coleta as métricas padrão do Node.js (uso de CPU, memória, etc.)
client.collectDefaultMetrics({ register });

// Expõe as métricas no endpoint /metrics
export const metrics = async (req: Request, res: Response): Promise<void> => {
  res.setHeader("Content-Type", register.contentType);
  res.end(await register.metrics());
};
