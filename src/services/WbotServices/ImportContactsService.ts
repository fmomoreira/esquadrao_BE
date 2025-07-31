import * as Sentry from "@sentry/node";
import GetDefaultWhatsApp from "../../helpers/GetDefaultWhatsApp";
import { getWbot } from "../../libs/wbot";
import Contact from "../../models/Contact";
import { logger } from "../../utils/logger";
import ShowBaileysService from "../BaileysServices/ShowBaileysService";
import CreateContactService from "../ContactServices/CreateContactService";
import { isString, isArray } from "lodash";
import path from "path";
import fs from 'fs';

const ImportContactsService = async (companyId: number): Promise<void> => {
  console.log(`[ImportContactsService] Iniciando importação de contatos para companyId: ${companyId}`);
  try {
    const defaultWhatsapp = await GetDefaultWhatsApp(companyId);
    console.log(`[ImportContactsService] WhatsApp padrão encontrado: ID ${defaultWhatsapp.id}`);
    const wbot = getWbot(defaultWhatsapp.id);
    console.log(`[ImportContactsService] Conexão wbot obtida`);
  } catch (error) {
    console.error(`[ImportContactsService] Erro ao obter WhatsApp padrão ou conexão wbot: ${error.message}`);
    throw error;
  }

  const defaultWhatsapp = await GetDefaultWhatsApp(companyId);
  const wbot = getWbot(defaultWhatsapp.id);
  
  let phoneContacts;

  try {
    console.log(`[ImportContactsService] Verificando conexão do WhatsApp...`);
    // Verifica se o WhatsApp está conectado
    if (!wbot) {
      console.error(`[ImportContactsService] WhatsApp não está conectado!`);
      throw new Error("WhatsApp não está conectado. Por favor, verifique a conexão do WhatsApp.");
    }
    console.log(`[ImportContactsService] WhatsApp está conectado.`);
    
    // Busca os dados do Baileys
    console.log(`[ImportContactsService] Buscando dados do Baileys para wbot.id: ${wbot.id}`);
    const contactsString = await ShowBaileysService(wbot.id);
    console.log(`[ImportContactsService] Dados do Baileys obtidos. Tipo de contactsString:`, typeof contactsString);
    
    // Verifica se os contatos existem
    if (!contactsString.contacts) {
      console.error(`[ImportContactsService] Nenhum contato encontrado no objeto contactsString`);
      throw new Error("Nenhum contato encontrado no WhatsApp. Verifique se o WhatsApp tem permissão para acessar contatos.");
    }
    console.log(`[ImportContactsService] Contatos encontrados em contactsString. Tipo de contacts:`, typeof contactsString.contacts);
    
    // Tenta processar os contatos com tratamento para diferentes formatos
    try {
      console.log(`[ImportContactsService] Iniciando processamento dos contatos...`);
      // Verifica o tipo de dados antes de processar
      if (typeof contactsString.contacts === 'string') {
        console.log(`[ImportContactsService] Contatos estão em formato string. Tamanho:`, contactsString.contacts.length);
        // Se for uma string, tenta fazer o parse
        try {
          console.log(`[ImportContactsService] Tentando fazer parse da string...`);
          phoneContacts = JSON.parse(contactsString.contacts);
          console.log(`[ImportContactsService] Parse realizado com sucesso.`);
        } catch (stringParseError) {
          // Se falhar por ser muito grande, tenta processar em partes ou usa como está
          console.error(`[ImportContactsService] Erro ao fazer parse da string: ${stringParseError.message}`);
          logger.warn(`Erro ao fazer parse da string de contatos: ${stringParseError.message}`);
          phoneContacts = contactsString.contacts; // Usa a string como está
          console.log(`[ImportContactsService] Usando a string como está.`);
        }
      } else if (typeof contactsString.contacts === 'object') {
        console.log(`[ImportContactsService] Contatos já estão em formato objeto.`);
        // Se já for um objeto, usa diretamente
        phoneContacts = contactsString.contacts;
      } else {
        console.error(`[ImportContactsService] Formato de contatos inesperado: ${typeof contactsString.contacts}`);
        throw new Error(`Formato de contatos inesperado: ${typeof contactsString.contacts}`);
      }
      
      // Adiciona log para debug
      logger.info(`Tipo de phoneContacts após processamento: ${typeof phoneContacts}`);
      logger.info(`É um array? ${Array.isArray(phoneContacts)}`);
      if (Array.isArray(phoneContacts)) {
        logger.info(`Número de contatos: ${phoneContacts.length}`);
      }
    } catch (parseError) {
      throw new Error(`Erro ao processar dados de contatos: ${parseError.message}`);
    }
    
    // Verifica se phoneContacts é um objeto válido
    if (!phoneContacts || (Array.isArray(phoneContacts) && phoneContacts.length === 0)) {
      throw new Error("Lista de contatos vazia ou inválida.");
    }

    // Escreve os arquivos de log apenas se tudo estiver ok
    const publicFolder = path.resolve(__dirname, "..", "..", "..", "public");
    
    // Cria a pasta public se não existir
    if (!fs.existsSync(publicFolder)) {
      fs.mkdirSync(publicFolder, { recursive: true });
    }
    
    const beforeFilePath = path.join(publicFolder, 'contatos_antes.txt');
    fs.writeFileSync(beforeFilePath, JSON.stringify(phoneContacts, null, 2));
    console.log('O arquivo contatos_antes.txt foi criado!');
    
    const afterFilePath = path.join(publicFolder, 'contatos_depois.txt');
    fs.writeFileSync(afterFilePath, JSON.stringify(phoneContacts, null, 2));
    
  } catch (err) {
    console.error(`[ImportContactsService] ERRO CRÍTICO: ${err.message}`);
    console.error(`[ImportContactsService] Stack trace:`, err.stack);
    Sentry.captureException(err);
    logger.error(`Could not get whatsapp contacts from phone. Err: ${err}`);
    
    // Lança um erro com mensagem mais amigável para o usuário
    if (err.message.includes("ERR_NO_BAILEYS_DATA_FOUND")) {
      console.error(`[ImportContactsService] Dados do Baileys não encontrados para este WhatsApp.`);
      throw new Error("Dados do WhatsApp não encontrados. Verifique se o WhatsApp está conectado.");
    } else {
      console.error(`[ImportContactsService] Erro ao importar contatos: ${err.message}`);
      throw new Error(`Falha ao importar contatos: ${err.message}`);
    }
  }

  // Se não conseguiu obter contatos, encerra a função
  if (!phoneContacts) {
    logger.warn("No contacts were retrieved from WhatsApp");
    return;
  }

  const phoneContactsList = isString(phoneContacts)
    ? JSON.parse(phoneContacts)
    : phoneContacts;

  if (isArray(phoneContactsList)) {
    phoneContactsList.forEach(async ({ id, name, notify }) => {
      if (id === "status@broadcast" || id.includes("g.us")) return;
      const number = id.replace(/\D/g, "");

      const existingContact = await Contact.findOne({
        where: { number, companyId }
      });

      if (existingContact) {
        // Atualiza o nome do contato existente
        existingContact.name = name || notify;
        await existingContact.save();
      } else {
        // Criar um novo contato
        try {
          await CreateContactService({
            number,
            name: name || notify,
            companyId
          });
        } catch (error) {
          Sentry.captureException(error);
          logger.warn(
            `Could not get whatsapp contacts from phone. Err: ${error}`
          );
        }
      }
    });
  }
};

export default ImportContactsService;
