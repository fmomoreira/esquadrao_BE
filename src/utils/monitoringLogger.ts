import winston from "winston";
import path from "path";

const logDir = process.cwd();

const monitoringLogger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss.SSS" }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      return `${timestamp} [${level.toUpperCase()}]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''}`;
    })
  ),
  transports: [
    new winston.transports.File({
      filename: path.join(logDir, "logMonitoring.txt"),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  ]
});

export { monitoringLogger };
