import gracefulShutdown from "http-graceful-shutdown";
import app from "./app";
import { initIO } from "./libs/socket";
import { logger } from "./utils/logger";
import { StartAllWhatsAppsSessions } from "./services/WbotServices/StartAllWhatsAppsSessions";
import Company from "./models/Company";
import { startQueueProcess } from "./queues";
import { TransferTicketQueue } from "./wbotTransferTicketQueue";
import cron from "node-cron";
import shelljs from 'shelljs';
import fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { pool } from "./database/dbloja";
import sqlite3 from "sqlite3";
import CreateCompanyService from "./services/CompanyService/CreateCompanyService";
import CreateContactService from "./services/ContactServices/CreateContactService";
import Contact from "./models/Contact";
const { Op } = require('sequelize');
import * as v8 from "v8";

const server = app.listen(process.env.PORT, async () => {
  const companies = await Company.findAll();
  const allPromises: any[] = [];
  companies.map(async c => {
    logger.info("MAP DO COMPANIES");
    const promise = StartAllWhatsAppsSessions(c.id);
    allPromises.push(promise);
  });

  Promise.all(allPromises).then(() => {
    logger.info("PROMISSES RESOLVIDAS")
    startQueueProcess();
  });
  logger.info(`Server iniciado na porta: ${process.env.PORT}`);
  logger.info(`Frontend na .env: ${process.env.FRONTEND_URL}`);
});

let lastMemoryUsed = 0;
let lastHeapUsed = 0;

setInterval(() => {
    const memory = process.memoryUsage();
    const heapStats = v8.getHeapStatistics();
    
    const currentMemoryUsed = memory.heapUsed / 1024 / 1024; // MB
    const currentHeapUsed = heapStats.used_heap_size / 1024 / 1024; // MB

    const memoryDiff = currentMemoryUsed - lastMemoryUsed;
    const heapDiff = currentHeapUsed - lastHeapUsed;

    console.log(`
    ?? **Monitoramento Completo do Servidor** (atualizado a cada 5s)
    
    ??? **Uso de Mem�ria**
    ?? Mem�ria Total Usada: ${(memory.rss / 1024 / 1024).toFixed(2)} MB
    ?? Mem�ria Sendo Usada pelo C�digo: ${(memory.heapUsed / 1024 / 1024).toFixed(2)} MB
    ?? Mem�ria Usada por Buffers/Arquivos: ${(memory.external / 1024 / 1024).toFixed(2)} MB

    ?? **Detalhes do Heap (Mem�ria Interna do Node.js)**
    ?? Heap Alocado no Momento: ${(heapStats.total_heap_size / 1024 / 1024).toFixed(2)} MB
    ?? Heap Realmente Usado: ${(heapStats.used_heap_size / 1024 / 1024).toFixed(2)} MB

    ?? **Crescimento de Mem�ria (�ltimo ciclo)**:
    ?? Mem�ria Usada pelo C�digo: ${memoryDiff.toFixed(2)} MB (Crescimento)
    ?? Heap Usado: ${heapDiff.toFixed(2)} MB (Crescimento)
    
    `);

    // Atualizando o valor de mem�ria usado para o pr�ximo ciclo
    lastMemoryUsed = currentMemoryUsed;
    lastHeapUsed = currentHeapUsed;

}, 5000);



export const fetchAll = async (db, sql) => {
  return new Promise((resolve, reject) => {
    db.all(sql, (err, rows) => {
      if (err) reject(err);
      resolve(rows);
    });
  });
};

cron.schedule("* * * * *", async () => {

  try {
    // console.log("Running a job at 01:00 at America/Sao_Paulo timezone")
    logger.info(`Serviço de transferencia de tickets iniciado`);

    await TransferTicketQueue();
  }
  catch (error) {
    logger.error(error);
  }

});


/*cron.schedule("0 0 0 * * *", async () => {

  try {
    // console.log("Running a job at 01:00 at America/Sao_Paulo timezone")
    logger.info(`Serviço de compactação da public iniciado`);

    var zippath = path.join(__dirname, 'utils', 'zippublic.sh')

    exec(`bash ${zippath}`, (error, stdout, stderr) => {
      if (error) {
        logger.error(`Erro ao executar o script: ${error.message}`);
        return;
      }
      if (stderr) {
        logger.error(`Erro no script: ${stderr}`);
        return;
      }
      console.log(`Saída do script: ${stdout}`);
    });
  }
  catch (error) {
    logger.error(error);
  }

}); */

/*

cron.schedule("0 0 0 * * *", async () => {
  let dblite;
  let ultimoIdLoja = 0;
  let ultimoIdCliente = 0;

  interface LogImport {
    ultimo_id_cli: number;
    ultimo_id_loja: number;
    datahora: string;
  }

  const executeQuery = (db: sqlite3.Database, query: string, params: any[] = []): Promise<LogImport[]> =>
    new Promise((resolve, reject) => {
      db.all(query, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          // Aqui usamos "as LogImport[]" para garantir que o TypeScript trate "rows" como um array de "LogImport"
          resolve(rows as LogImport[]);
        }
      });
    });


  const runQuery = (db, query, params = []) =>
    new Promise((resolve, reject) => {
      db.run(query, params, function (err) {
        if (err) reject(err);
        else resolve(this.lastID);
      });
    });

  const createLog = async (dblite: sqlite3.Database, ultimo_id_cli: number, ultimo_id_loja: number) => {
    const insertQuery = `INSERT INTO logimport(ultimo_id_cli, ultimo_id_loja) VALUES(?, ?)`;

    return new Promise<void>((resolve, reject) => {
      dblite.run(insertQuery, [ultimo_id_cli, ultimo_id_loja], function (err) {
        if (err) reject(err);
        resolve();
      });
    });
  };


  try {
    logger.info(`Serviço de busca de dados iniciado.`);
    dblite = new sqlite3.Database("integra.db");

    const db = await pool.connect();
    await db.query("BEGIN");

    await runQuery(
      dblite,
      `
      CREATE TABLE IF NOT EXISTS logimport (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ultimo_id_cli INTEGER NOT NULL,
        ultimo_id_loja INTEGER NOT NULL,
        datahora TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `
    );
    logger.info("Tabela 'logimport' verificada ou criada com sucesso.");

    const logs = await executeQuery(dblite, "SELECT * FROM logimport ORDER BY datahora DESC LIMIT 1");

    if (logs.length === 0) {
      logger.info("Nenhum log encontrado.");
    } else {
      logger.info(`Log encontrado: ${JSON.stringify(logs[0])}`);
    }


    const ultimoLog = logs[0] || { ultimo_id_cli: 0, ultimo_id_loja: 0 };

    // Exibir último log antes de buscar dados
    logger.info(
      `Últimos IDs registrados - Loja: ${ultimoLog.ultimo_id_loja}, Cliente: ${ultimoLog.ultimo_id_cli}`
    );

    // Buscar lojas
    const lojas = await db.query(
      "SELECT * FROM public.cf_loja WHERE id_loja > $1 ORDER BY id_loja",
      [ultimoLog.ultimo_id_loja]
    );
    logger.info(`Lojas encontradas: ${lojas.rows.length}`);

    // Buscar clientes
    const clientes = await db.query(
      "SELECT * FROM public.cd_cliente WHERE id_cli > $1 ORDER BY id_cli LIMIT 50",
      [ultimoLog.ultimo_id_cli]
    );
    logger.info(`Clientes encontrados: ${clientes.rows.length}`);

    // Função para processar lojas
    const processLojas = async (lojas) => {
      for (const [index, loja] of lojas.entries()) {
        if (index === lojas.length - 1) ultimoIdLoja = loja.id_loja;

        logger.info(`Processando loja ID: ${loja.id_loja}`);

        // Verificar se já existe uma empresa com o mesmo nome ou e-mail
        const empresaExistente = await Company.findOne({
          where: {
            [Op.or]: [{ email: loja.email_loja }, { name: loja.nome_loja }],
          },
        });

        if (empresaExistente) {
          logger.info(
            `Empresa já existente. Nome: ${loja.nome_loja}, E-mail: ${loja.email_loja}`
          );
          continue;
        }

        const empresaPorCnpj = await Company.findOne({
          attributes: { include: ["id"] },
          where: { cpf_cnpj: loja.cnpj_loja },
        });

        if (!empresaPorCnpj) {
          const companyData = {
            name: loja.nome_loja,
            phone: loja.fone_loja,
            email: loja.email_loja,
            status: true,
            campaignsEnabled: true,
            cpf_cnpj: loja.cnpj_loja,
            endereco: loja.endereco_loja,
            cep: loja.cep_loja,
            bairro: loja.bairro_loja,
            cidade: loja.cidade_loja,
          };
          try {
            const empresaCriada = await CreateCompanyService(companyData);
            logger.info("Empresa criada com sucesso:", empresaCriada);
          } catch (e) {
            logger.error("Erro ao criar empresa:", e);
          }
        }
      }
    };

    // Função para processar clientes
    const processClientes = async (clientes) => {
      for (const [index, cliente] of clientes.entries()) {
        if (index === clientes.length - 1) ultimoIdCliente = cliente.id_cli;

        logger.info(`Processando cliente ID: ${cliente.id_cli}`);

        const empresaAssociada = await Company.findOne({
          attributes: { include: ["id"] },
          where: { cpf_cnpj: cliente.cnpj_loja },
        });

        if (empresaAssociada) {
          logger.info(
            `Empresa associada encontrada para cliente ID: ${cliente.id_cli}. Empresa ID: ${empresaAssociada.id}`
          );

          let contatoExistente;

          try {
            contatoExistente = await Contact.findOne({
              where: {
                number: cliente.fone_cli,
                companyId: empresaAssociada.id,
              },
            });
          } catch (e) {
            const errorMessage =`Erro ao buscar contato: ${e.message || e}. Stack: ${e.stack || 'N/A'}. Tipo do erro: ${typeof e}. Fone: ${cliente.fone_cli}, Company ID: ${empresaAssociada.id}`;
            logger.error(errorMessage);
            ultimoIdCliente = 0;
            continue;
          }

          // Verificar se já existe um contato com o mesmo número e empresa




          if (contatoExistente) {
            logger.info(
              `Contato já existente. Número: ${cliente.fone_cli}, Empresa ID: ${empresaAssociada.id}, id do contato: ${contatoExistente.id}`
            );
            continue;
          }

          const clientData = {
            name: cliente.nome_cli,
            number: cliente.fone_cli,
            email: cliente.email_cli,
            companyId: empresaAssociada.id,
            cpfCnpj: cliente.cpfcnpj_cli,
            endereco: cliente.endereco_cli,
            cep: cliente.cep_cli,
            bairro: cliente.bairro_cli,
            cidade: cliente.bairro_cli
          };
          try {
            const contatoCriado = await CreateContactService(clientData);
            logger.info("Contato criado com sucesso:", contatoCriado);
          } catch (e) {
            logger.error("Erro ao criar contato:", e.message);
          }
        } else {
          logger.warn(
            `Nenhuma empresa associada encontrada para cliente ID: ${cliente.id_cli}`
          );
        }
      }
    };

    // Processar lojas e clientes
    await processLojas(lojas.rows);
    await processClientes(clientes.rows);

    // Atualizar log
    if (
      ultimoIdCliente !== 0 || ultimoIdLoja !== 0
    ) {
      await runQuery(
        dblite,
        "INSERT INTO logimport (ultimo_id_cli, ultimo_id_loja) VALUES (?, ?)",
        [ultimoIdCliente, ultimoIdLoja]
      );
      logger.info(
        `Log atualizado. Última loja: ${ultimoIdLoja}, Último cliente: ${ultimoIdCliente}`
      );
    } else {
      logger.info("Nenhum cliente ou loja nova")
    }

    await db.query("COMMIT");
    logger.info("Transação concluída com sucesso.");
  } catch (error) {
    logger.error("Erro durante a execução do serviço:", error);
    await pool.query("ROLLBACK");
  } finally {
    if (dblite) dblite.close();
    logger.info("Conexão SQLite encerrada.");
  }
});
*/



initIO(server);
gracefulShutdown(server);
