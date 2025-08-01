import pino from "pino";
import path from "path";

const logDir = process.cwd();

// Configura o pino para ter múltiplos destinos (transportes).
// Isso resolve o erro de compilação com a biblioteca Baileys e atende ao requisito de salvar logs em arquivo.
const logger = pino({
  // Define o nível de log mais baixo para garantir que tudo seja capturado.
  // O nível de cada transporte (console, arquivo) será definido individualmente.
  level: "trace", // O nível mais baixo do Pino é "trace", não "silly".
  transport: {
    targets: [
      {
        // Configuração para o console (saída padrão)
        target: 'pino-pretty', // Usa o pino-pretty para uma visualização amigável
        level: 'info', // Mostra apenas logs de nível 'info' e superiores no console
        options: {
          colorize: true,
          levelFirst: true,
          translateTime: "SYS:yyyy-mm-dd HH:MM:ss.l",
          ignore: 'pid,hostname' // Ignora campos desnecessários no console
        }
      },
      {
        // Configuração para o arquivo de log
        target: 'pino/file',
        level: 'trace', // Grava todos os níveis de log no arquivo, incluindo 'trace' do Baileys
        options: { 
          destination: path.join(logDir, "logSistema.txt"),
          mkdir: true // Cria o diretório se ele não existir
        }
      }
    ]
  }
});

export { logger };