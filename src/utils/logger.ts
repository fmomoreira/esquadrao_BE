import pino from "pino";
import path from "path";

const logDir = process.cwd();

const logger = pino({
  level: "trace",
}, pino.destination(path.join(logDir, "logSistema.txt")));

export { logger };
