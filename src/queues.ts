import * as Sentry from "@sentry/node";
import BullQueue from "bull";
import { addSeconds, differenceInSeconds } from "date-fns";
import { isArray, isEmpty, isNil } from "lodash";
import moment from "moment";
import path from "path";
import { Op, QueryTypes } from "sequelize";
import sequelize from "./database";
import GetDefaultWhatsApp from "./helpers/GetDefaultWhatsApp";
import GetWhatsappWbot from "./helpers/GetWhatsappWbot";
import formatBody from "./helpers/Mustache";
import { MessageData, SendMessage } from "./helpers/SendMessage";
import { getIO } from "./libs/socket";
import Campaign from "./models/Campaign";
import CampaignSetting from "./models/CampaignSetting";
import CampaignShipping from "./models/CampaignShipping";
import Company from "./models/Company";
import Contact from "./models/Contact";
import ContactList from "./models/ContactList";
import ContactListItem from "./models/ContactListItem";
import Plan from "./models/Plan";
import Schedule from "./models/Schedule";
import User from "./models/User";
import Whatsapp from "./models/Whatsapp";
import ShowFileService from "./services/FileServices/ShowService";
import { getMessageOptions } from "./services/WbotServices/SendWhatsAppMedia";
import { ClosedAllOpenTickets } from "./services/WbotServices/wbotClosedTickets";
import { logger } from "./utils/logger";
import { monitoringLogger } from "./utils/monitoringLogger";
import { campaignShippingLogger } from "./utils/campaignShippingLogger";

const nodemailer = require("nodemailer");
const CronJob = require("cron").CronJob;

const connection = process.env.REDIS_URI || "";
const limiterMax = process.env.REDIS_OPT_LIMITER_MAX || 1;
const limiterDuration = process.env.REDIS_OPT_LIMITER_DURATION || 3000;

interface ProcessCampaignData {
  id: number;
  delay: number;
}

interface PrepareContactData {
  contactId: number;
  campaignId: number;
  delay: number;
  variables: any[];
  cpf_cnpj?: string;
  endereco?: string;
  cep?: string;
  bairro?: string;
  cidade?: string;
}

interface DispatchCampaignData {
  campaignId: number;
  campaignShippingId: number;
  contactId: number;
}

const defaultJobOptions = {
  removeOnComplete: true,
  removeOnFail: true,
  attempts: 3, // Tenta executar o job até 3 vezes em caso de erro
  backoff: { type: 'exponential', delay: 1000 } // Aumenta o tempo de espera entre as tentativas
};

export const userMonitor = new BullQueue("UserMonitor", connection, { defaultJobOptions });

export const queueMonitor = new BullQueue("QueueMonitor", connection, { defaultJobOptions });

export const messageQueue = new BullQueue("MessageQueue", connection, {
  limiter: {
    max: limiterMax as number,
    duration: limiterDuration as number
  },
  defaultJobOptions
});

export const scheduleMonitor = new BullQueue("ScheduleMonitor", connection, { defaultJobOptions });
export const sendScheduledMessages = new BullQueue(
  "SendSacheduledMessages",
  connection,
  { defaultJobOptions }
);

export const campaignQueue = new BullQueue("CampaignQueue", connection, { defaultJobOptions });

async function handleSendMessage(job) {
  try {
    const { data } = job;

    const whatsapp = await Whatsapp.findByPk(data.whatsappId);

    if (whatsapp == null) {
      throw Error("Whatsapp não identificado");
    }

    const messageData: MessageData = data.data;

    await SendMessage(whatsapp, messageData);
  } catch (e: any) {
    Sentry.captureException(e);
    logger.error("MessageQueue -> SendMessage: error", e.message);
    throw e;
  }
}

// Commented out handleVerifyQueue function - not currently used
/*
async function handleVerifyQueue(job) {
  logger.info("Buscando atendimentos perdidos nas filas");
  try {
    const companies = await Company.findAll({
      attributes: ['id', 'name'],
      where: {
        status: true,
        dueDate: {
          [Op.gt]: Sequelize.literal('CURRENT_DATE')
        }
      },
      include: [
        {
          model: Whatsapp, 
          attributes: ["id", "name", "status", "timeSendQueue", "sendIdQueue"], 
          where: {
            timeSendQueue: {
              [Op.gt]: 0
            }
          }
        },
      ]
    });

    companies.map(async c => {
      c.whatsapps.map(async w => {
        if (w.status === "CONNECTED") {
          var companyId = c.id;
          const moveQueue = w.timeSendQueue ? w.timeSendQueue : 0;
          const moveQueueId = w.sendIdQueue;
          const moveQueueTime = moveQueue;
          const idQueue = moveQueueId;
          const timeQueue = moveQueueTime;

          if (moveQueue > 0) {
            if (!isNaN(idQueue) && Number.isInteger(idQueue) && !isNaN(timeQueue) && Number.isInteger(timeQueue)) {
              const tempoPassado = moment().subtract(timeQueue, "minutes").utc().format();
              
              const { count, rows: tickets } = await Ticket.findAndCountAll({
                where: {
                  status: "pending",
                  queueId: null,
                  companyId: companyId,
                  whatsappId: w.id,
                  updatedAt: {
                    [Op.lt]: tempoPassado
                  }
                },
                include: [
                  {
                    model: Contact,
                    as: "contact",
                    attributes: ["id", "name", "number", "email", "profilePicUrl"],
                    include: ["extraInfo"]
                  }
                ]
              });

              if (count > 0) {
                tickets.map(async ticket => {
                  await ticket.update({
                    queueId: idQueue
                  });

                  await ticket.reload();

                  const io = getIO();
                  io.to(ticket.status)
                    .to("notification")
                    .to(ticket.id.toString())
                    .emit(`company-${companyId}-ticket`, {
                      action: "update",
                      ticket,
                      ticketId: ticket.id
                    });

                  logger.info(`Atendimento Perdido: ${ticket.id} - Empresa: ${companyId}`);
                });
              } else {
                logger.info(`Nenhum atendimento perdido encontrado - Empresa: ${companyId}`);
              }
            } else {
              logger.info(`Condição não respeitada - Empresa: ${companyId}`);
            }
          }
        }
      });
    });
  } catch (e: any) {
    Sentry.captureException(e);
    logger.error("SearchForQueue -> VerifyQueue: error", e.message);
    throw e;
  }
}
*/

async function handleCloseTicketsAutomatic() {
  const job = new CronJob("*/1 * * * *", async () => {
    const companies = await Company.findAll();
    companies.map(async c => {
      try {
        const companyId = c.id;
        await ClosedAllOpenTickets(companyId);
      } catch (e: any) {
        Sentry.captureException(e);
        logger.error("ClosedAllOpenTickets -> Verify: error", e.message);
        throw e;
      }
    });
  });
  job.start();
}

async function handleVerifySchedules(job) {
  try {
    const { count, rows: schedules } = await Schedule.findAndCountAll({
      where: {
        status: "PENDENTE",
        sentAt: null,
        sendAt: {
          [Op.gte]: moment().format("YYYY-MM-DD HH:mm:ss"),
          [Op.lte]: moment().add("30", "seconds").format("YYYY-MM-DD HH:mm:ss")
        }
      },
      include: [{ model: Contact, as: "contact" }]
    });
    if (count > 0) {
      schedules.map(async schedule => {
        await schedule.update({
          status: "AGENDADA"
        });
        sendScheduledMessages.add(
          "SendMessage",
          { schedule },
          { delay: 40000 }
        );
        logger.info(`Disparo agendado para: ${schedule.contact.name}`);
      });
    }
  } catch (e: any) {
    Sentry.captureException(e);
    logger.error("SendScheduledMessage -> Verify: error", e.message);
    throw e;
  }
}

async function handleSendScheduledMessage(job) {
  const {
    data: { schedule }
  } = job;
  let scheduleRecord: Schedule | null = null;

  try {
    scheduleRecord = await Schedule.findByPk(schedule.id);
  } catch (e) {
    Sentry.captureException(e);
    logger.info(`Erro ao tentar consultar agendamento: ${schedule.id}`);
  }

  try {
    const whatsapp = await GetDefaultWhatsApp(schedule.companyId);

    let filePath = null;
    if (schedule.mediaPath) {
      filePath = path.resolve("public", schedule.mediaPath);
    }

    await SendMessage(whatsapp, {
      number: schedule.contact.number,
      body: formatBody(schedule.body, schedule.contact),
      mediaPath: filePath
    });

    await scheduleRecord?.update({
      sentAt: moment().toDate(),
      status: "ENVIADA"
    });

    logger.info(`Mensagem agendada enviada para: ${schedule.contact.name}`);
    sendScheduledMessages.clean(15000, "completed");
  } catch (e: any) {
    Sentry.captureException(e);
    await scheduleRecord?.update({
      status: "ERRO"
    });
    logger.error("SendScheduledMessage -> SendMessage: error", e.message);
    throw e;
  }
}

async function handleVerifyCampaigns(job) {
  const sql = `
    UPDATE "Campaigns"
    SET status = 'AGENDADA'
    WHERE id IN (
      SELECT id FROM "Campaigns"
      WHERE status = 'PROGRAMADA'
      AND "scheduledAt" BETWEEN now() AND now() + '1 hour'::interval
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, EXTRACT(EPOCH FROM ("scheduledAt" - now())) * 1000 AS delay;
  `;

  try {
    const campaignsToSchedule: { id: number; delay: number }[] = await sequelize.query(sql, {
      type: QueryTypes.SELECT
    });

    if (campaignsToSchedule.length > 0) {
      logger.info(`Travando e agendando ${campaignsToSchedule.length} campanhas.`);
      for (const campaign of campaignsToSchedule) {
        const delay = Math.max(0, Math.floor(campaign.delay));
        logger.info(`Enfileirando campanha ${campaign.id} com delay de ${delay}ms.`);
        await campaignQueue.add(
          "ProcessCampaign",
          { id: campaign.id },
          { delay }
        );
      }
    }
  } catch (err: any) {
    Sentry.captureException(err);
    logger.error("Erro ao verificar e agendar campanhas:", err);
  }
}

async function getCampaign(id) {
  return await Campaign.findByPk(id, {
    include: [
      {
        model: ContactList,
        as: "contactList",
        attributes: ["id", "name"]
      },
      {
        model: Whatsapp,
        as: "whatsapp",
        attributes: ["id", "name"]
      },
      {
        model: CampaignShipping,
        as: "shipping",
        include: [{ model: ContactListItem, as: "contact" }]
      }
    ]
  });
}

async function getContact(id) {
  return await ContactListItem.findByPk(id, {
    attributes: ["id", "name", "number", "email"]
  });
}

async function getSettings(campaign) {
  const settings = await CampaignSetting.findAll({
    where: { companyId: campaign.companyId },
    attributes: ["key", "value"]
  });

  let messageInterval: number = 90;
  let longerIntervalAfter: number = 20;
  let greaterInterval: number = 180;
  let variables: any[] = [];

  settings.forEach(setting => {
    if (setting.key === "messageInterval") {
      messageInterval = JSON.parse(setting.value);
    }
    if (setting.key === "longerIntervalAfter") {
      longerIntervalAfter = JSON.parse(setting.value);
    }
    if (setting.key === "greaterInterval") {
      greaterInterval = JSON.parse(setting.value);
    }
    if (setting.key === "variables") {
      variables = JSON.parse(setting.value);
    }
  });

  return {
    messageInterval,
    longerIntervalAfter,
    greaterInterval,
    variables
  };
}

export function parseToMilliseconds(seconds) {
  return seconds * 1000;
}

async function sleep(seconds) {
  logger.info(
    `Sleep de ${seconds} segundos iniciado: ${moment().format("HH:mm:ss")}`
  );
  return new Promise(resolve => {
    setTimeout(() => {
      logger.info(
        `Sleep de ${seconds} segundos finalizado: ${moment().format(
          "HH:mm:ss"
        )}`
      );
      resolve(true);
    }, parseToMilliseconds(seconds));
  });
}

function getCampaignValidMessages(campaign) {
  const messages = [];

  if (!isEmpty(campaign.message1) && !isNil(campaign.message1)) {
    messages.push(campaign.message1);
  }

  if (!isEmpty(campaign.message2) && !isNil(campaign.message2)) {
    messages.push(campaign.message2);
  }

  if (!isEmpty(campaign.message3) && !isNil(campaign.message3)) {
    messages.push(campaign.message3);
  }

  if (!isEmpty(campaign.message4) && !isNil(campaign.message4)) {
    messages.push(campaign.message4);
  }

  if (!isEmpty(campaign.message5) && !isNil(campaign.message5)) {
    messages.push(campaign.message5);
  }

  return messages;
}

function getCampaignValidConfirmationMessages(campaign) {
  const messages = [];

  if (
    !isEmpty(campaign.confirmationMessage1) &&
    !isNil(campaign.confirmationMessage1)
  ) {
    messages.push(campaign.confirmationMessage1);
  }

  if (
    !isEmpty(campaign.confirmationMessage2) &&
    !isNil(campaign.confirmationMessage2)
  ) {
    messages.push(campaign.confirmationMessage2);
  }

  if (
    !isEmpty(campaign.confirmationMessage3) &&
    !isNil(campaign.confirmationMessage3)
  ) {
    messages.push(campaign.confirmationMessage3);
  }

  if (
    !isEmpty(campaign.confirmationMessage4) &&
    !isNil(campaign.confirmationMessage4)
  ) {
    messages.push(campaign.confirmationMessage4);
  }

  if (
    !isEmpty(campaign.confirmationMessage5) &&
    !isNil(campaign.confirmationMessage5)
  ) {
    messages.push(campaign.confirmationMessage5);
  }

  return messages;
}

function getProcessedMessage(msg: string, variables: any[], contact: any) {
  let finalMessage = msg;

  if (finalMessage.includes("{nome}")) {
    finalMessage = finalMessage.replace(/{nome}/g, contact.name);
  }

  if (finalMessage.includes("{email}")) {
    finalMessage = finalMessage.replace(/{email}/g, contact.email);
  }

  if (finalMessage.includes("{numero}")) {
    finalMessage = finalMessage.replace(/{numero}/g, contact.number);
  }

  variables.forEach(variable => {
    if (finalMessage.includes(`{${variable.key}}`)) {
      const regex = new RegExp(`{${variable.key}}`, "g");
      finalMessage = finalMessage.replace(regex, variable.value);
    }
  });

  return finalMessage;
}

export function randomValue(min, max) {
  return Math.floor(Math.random() * max) + min;
}

async function verifyAndFinalizeCampaign(campaign) {
  const count1 = await ContactListItem.count({
    where: {
      contactListId: campaign.contactList.id,
      isWhatsappValid: true
    }
  });
  const count2 = await CampaignShipping.count({
    where: {
      campaignId: campaign.id,
      isDeliveredSuccessfully: { [Op.not]: null }
    }
  });

  if (count1 === count2) {
    await campaign.update({ status: "FINALIZADA", completedAt: moment() });
  }

  const io = getIO();
  io.to(`company-${campaign.companyId}-mainchannel`).emit(
    `company-${campaign.companyId}-campaign`,
    {
      action: "update",
      record: campaign
    }
  );
}



async function handleProcessCampaign(job) {
  try {
    const { id }: ProcessCampaignData = job.data;
    monitoringLogger.info(`[DEBUG] Processando campanha: ${id}`);
    
    const campaign = await getCampaign(id);
    if (!campaign) {
      monitoringLogger.error(`[DEBUG] Campanha não encontrada: ${id}`);
      return;
    }
    
    monitoringLogger.info(`[DEBUG] Campanha encontrada: ${id}, status: ${campaign.status}`);
    
    const settings = await getSettings(campaign);
    if (campaign) {
      const contactListId = campaign.contactList.id;
      if (!contactListId) {
        monitoringLogger.error(`[DEBUG] ID da lista de contatos não encontrada para campanha: ${id}`);
        return;
      }
      
      const BATCH_SIZE = 100; // Define o tamanho do lote
      let offset = 0;
      let hasMoreContacts = true;

      while (hasMoreContacts) {
        const { count, rows: contacts } = await ContactListItem.findAndCountAll({
          where: { contactListId, isWhatsappValid: true },
          limit: BATCH_SIZE,
          offset: offset,
          order: [['id', 'ASC']]
        });

        if (contacts.length === 0) {
          hasMoreContacts = false;
          break;
        }

        monitoringLogger.info(`[DEBUG] Contatos encontrados no lote (offset: ${offset}): ${contacts.length} para campanha: ${id}`);
      
        const contactData = contacts.map(contact => ({
          contactId: contact.id,
          campaignId: campaign.id,
          variables: settings.variables
        }));

        const {
          messageInterval,
          longerIntervalAfter,
          greaterInterval,
          variables
        } = settings;

        let delay = 0;
        const queuePromises = [];
        for (let i = 0; i < contactData.length; i++) {
          const { contactId, campaignId } = contactData[i];

          if (i > 0) {
            if (longerIntervalAfter > 0 && i % longerIntervalAfter === 0) {
              delay += greaterInterval;
            } else {
              delay += messageInterval;
            }
          }

          monitoringLogger.info(`[handleProcessCampaign] Adicionando job 'PrepareContact' para o contato ${contactId} na fila.`);
          const queuePromise = campaignQueue.add(
            "PrepareContact",
            { contactId, campaignId, variables, delay: delay * 1000 }, // convertendo para milissegundos
          );
          monitoringLogger.info(`[handleProcessCampaign] Job 'PrepareContact' para o contato ${contactId} adicionado com sucesso.`);

          queuePromises.push(queuePromise);
          monitoringLogger.info(
            `Registro enviado pra fila de disparo: Campanha=${campaign.id};Contato=${contacts[i].name};delay=${delay}`
          );
        }
        await Promise.all(queuePromises);
        monitoringLogger.info(`[DEBUG] Todos os jobs PrepareContact do lote adicionados para campanha: ${campaign.id}`);
        campaignShippingLogger.info(`[Campanha: ${campaign.id}] Lote de ${contacts.length} contatos (offset: ${offset}) enviado para a fila de preparação.`);
        
        offset += BATCH_SIZE;
      }
      
      monitoringLogger.info(`[DEBUG] Todos os jobs PrepareContact adicionados para campanha: ${campaign.id}`);
      campaignShippingLogger.info(`[Campanha: ${campaign.id}] Todos os contatos da campanha foram enviados para a fila de preparação.`);

      await campaign.update({ status: "EM_ANDAMENTO" });
      monitoringLogger.info(`[DEBUG] Status da campanha atualizado para EM_ANDAMENTO: ${campaign.id}`);
    } else {
      monitoringLogger.error(`[DEBUG] Campanha inválida: ${id}`);
    }
  } catch (err: any) {
    Sentry.captureException(err);
    monitoringLogger.error(`[DEBUG] Erro ao processar campanha: ${err.message}`);
    console.log(err.stack);
  }
}

let ultima_msg = 0;
async function handlePrepareContact(job) {
  try {
    const { contactId, campaignId, delay, variables }: PrepareContactData =
      job.data;
    
    monitoringLogger.info(`[DEBUG] Preparando contato: contactId=${contactId}, campaignId=${campaignId}, delay=${delay}`);
    
    const campaign = await getCampaign(campaignId);
    if (!campaign) {
      monitoringLogger.error(`[DEBUG] Campanha não encontrada ao preparar contato: ${campaignId}`);
      return;
    }
    
    const contact = await getContact(contactId);
    if (!contact) {
      monitoringLogger.error(`[DEBUG] Contato não encontrado: ${contactId} para campanha: ${campaignId}`);
      return;
    }
    
    monitoringLogger.info(`[DEBUG] Contato encontrado: ${contact.name} (${contact.number}) para campanha: ${campaignId}`);

    const campaignShipping: any = {};
    campaignShipping.number = contact.number;
    campaignShipping.contactId = contactId;
    campaignShipping.campaignId = campaignId;
    campaignShipping.isDeliveredSuccessfully = null;

    const messages = getCampaignValidMessages(campaign);
    if (messages.length) {
      const radomIndex = ultima_msg;
      console.log("ultima_msg:", ultima_msg);
      ultima_msg++;
      if (ultima_msg >= messages.length) {
        ultima_msg = 0;
      }
      const message = getProcessedMessage(
        messages[radomIndex],
        variables,
        contact
      );
      campaignShipping.message = `\u200c ${message}`;
    }

    if (campaign.confirmation) {
      const confirmationMessages =
        getCampaignValidConfirmationMessages(campaign);
      if (confirmationMessages.length) {
        const radomIndex = randomValue(0, confirmationMessages.length);
        const message = getProcessedMessage(
          confirmationMessages[radomIndex],
          variables,
          contact
        );
        campaignShipping.confirmationMessage = `\u200c ${message}`;
      }
    }

    monitoringLogger.info(`[DEBUG] Tentando criar/encontrar registro em CampaignShipping: campaignId=${campaignShipping.campaignId}, contactId=${campaignShipping.contactId}`);
    
    const [record, created] = await CampaignShipping.findOrCreate({
      where: {
        campaignId: campaignShipping.campaignId,
        contactId: campaignShipping.contactId
      },
      defaults: campaignShipping
    });
    
    campaignShippingLogger.info(`[Campanha: ${campaignId} | Contato: ${contact.id}] Registro em CampaignShipping ${created ? 'CRIADO' : 'ENCONTRADO'}. ID: ${record.id}`);
    monitoringLogger.info(`[DEBUG] Registro em CampaignShipping ${created ? 'criado' : 'encontrado'}: id=${record.id}`);

    if (
      !created &&
      record.deliveredAt === null &&
      record.confirmationRequestedAt === null
    ) {
      record.set(campaignShipping);
      await record.save();
    }

    if (
      record.deliveredAt === null &&
      record.confirmationRequestedAt === null
    ) {
      monitoringLogger.info(`[DEBUG] Adicionando job DispatchCampaign para: campaignId=${campaign.id}, campaignShippingId=${record.id}, delay=${delay}`);
      const nextJob = await campaignQueue.add(
        "DispatchCampaign",
        {
          campaignId: campaign.id,
          campaignShippingId: record.id,
          contactId: contactId
        },
        {
          delay
        }
      );

      monitoringLogger.info(`[DEBUG] Job DispatchCampaign adicionado com sucesso: ${nextJob.id}`);
      await record.update({ jobId: nextJob.id.toString() });
      monitoringLogger.info(`[DEBUG] Registro CampaignShipping atualizado com jobId: ${nextJob.id}`);
    } else {
      monitoringLogger.info(`[DEBUG] Registro já processado, não adicionando job DispatchCampaign: campaignId=${campaign.id}, campaignShippingId=${record.id}`);
    }
  } catch (err: any) {
    Sentry.captureException(err);
    monitoringLogger.error(`campaignQueue -> PrepareContact -> error: ${err.message}`);
  }
}

async function handleDispatchCampaign(job) {
  const { data } = job;
  const { campaignShippingId, campaignId }: DispatchCampaignData = data;
  let campaignShipping: CampaignShipping | null = null;

  try {
    const campaign = await getCampaign(campaignId);
    const wbot = await GetWhatsappWbot(campaign.whatsapp);

    if (!wbot) {
      monitoringLogger.error(
        `campaignQueue -> DispatchCampaign -> error: wbot not found`
      );
      throw new Error("Wbot not found");
    }

    if (!campaign.whatsapp) {
      monitoringLogger.error(
        `campaignQueue -> DispatchCampaign -> error: whatsapp not found`
      );
      throw new Error("Whatsapp not found for campaign");
    }

    if (!wbot?.user?.id) {
      monitoringLogger.error(
        `campaignQueue -> DispatchCampaign -> error: wbot user not found`
      );
      throw new Error("Wbot user not found");
    }

    monitoringLogger.info(
      `Disparo de campanha solicitado: Campanha=${campaignId};Registro=${campaignShippingId}`
    );

    campaignShipping = await CampaignShipping.findByPk(
      campaignShippingId,
      {
        include: [{ model: ContactListItem, as: "contact" }]
      }
    );

    if (!campaignShipping) {
      monitoringLogger.error(`[DispatchCampaign] CampaignShipping not found for ID: ${campaignShippingId}`);
      return;
    }

    if (campaignShipping.deliveredAt) {
      monitoringLogger.info(`MONITORANTO: ===================Mensagem já enviada para================== ${campaignShippingId}`);
      return;
    }

    // Definir variáveis necessárias
    const chatId = `${campaignShipping.number}@c.us`;
    let body = campaignShipping.message || "";
    let sentMessageResult;

    if (!isNil(campaign.fileListId)) {
      try {
        const publicFolder = path.resolve(__dirname, "..", "public");
        const files = await ShowFileService(
          campaign.fileListId,
          campaign.companyId
        );
        const folder = path.resolve(publicFolder, "fileList", String(files.id));
        for (const [index, file] of files.options.entries()) {
          const options = await getMessageOptions(
            file.path,
            path.resolve(folder, file.path),
            file.name
          );
          sentMessageResult = await wbot.sendMessage(chatId, { ...options });
          monitoringLogger.debug(`[DispatchCampaign] Media message sent. Raw response: ${JSON.stringify(sentMessageResult)}`);
        }
      } catch (error) {
        monitoringLogger.info(error);
        throw error;
      }
    }

    if (campaign.mediaPath) {
      const publicFolder = path.resolve(__dirname, "..", "public");
      const filePath = path.join(publicFolder, campaign.mediaPath);

      const options = await getMessageOptions(
        campaign.mediaName,
        filePath,
        body
      );
      if (Object.keys(options).length) {
        sentMessageResult = await wbot.sendMessage(chatId, { ...options });
        monitoringLogger.debug(`[DispatchCampaign] Media message sent. Raw response: ${JSON.stringify(sentMessageResult)}`);
      }
    } else {
      if (campaign.confirmation && campaignShipping.confirmation === null) {
        sentMessageResult = await wbot.sendMessage(chatId, {
          text: body
        });
        monitoringLogger.debug(`[DispatchCampaign] Confirmation message sent. Raw response: ${JSON.stringify(sentMessageResult)}`);
        await campaignShipping.update({ confirmationRequestedAt: moment() });
      } else {
        sentMessageResult = await wbot.sendMessage(chatId, {
          text: body
        });
        monitoringLogger.debug(`[DispatchCampaign] Text message sent. Raw response: ${JSON.stringify(sentMessageResult)}`);
      }
    }

    const messageIdToStore = sentMessageResult?.key?.id || null;
    monitoringLogger.debug(`[DispatchCampaign] messageId to store: ${messageIdToStore}`);

    // Atualiza CampaignShipping com status de sucesso ou falha de envio
    await campaignShipping.update({
      deliveredAt: moment(),
      messageId: messageIdToStore,
      isDeliveredSuccessfully: messageIdToStore !== null ? 1 : 0
    });

    campaignShippingLogger.info(`[Campanha: ${campaignId} | Contato: ${campaignShipping.contact.id}] Mensagem enviada com sucesso. MessageId: ${messageIdToStore}`);

    await verifyAndFinalizeCampaign(campaign);

    const io = getIO();
    io.to(`company-${campaign.id}-mainchannel`).emit(
      `company-${campaign.id}-campaign`,
      {
        action: "update",
        record: campaign
      }
    );

    monitoringLogger.info(
      `Campanha enviada para: Campanha=${campaignId};Contato=${campaignShipping.contact.name}`
    );
  } catch (err: any) {
    Sentry.captureException(err);
    monitoringLogger.error(`[DispatchCampaign] Error sending message for CampaignShipping ${campaignShippingId}: ${err.message}`);
    console.log(err.stack);

    // Se ocorreu um erro, atualiza CampaignShipping para refletir a falha
    if (campaignShipping) {
      try {
        await campaignShipping.update({
          deliveredAt: moment(),
          isDeliveredSuccessfully: 0,
          messageId: null
        });
        monitoringLogger.info(`[DispatchCampaign] CampaignShipping ${campaignShipping.id} marked as failed due to error.`);
      } catch (updateErr: any) {
        Sentry.captureException(updateErr);
        monitoringLogger.error(`[DispatchCampaign] Error updating CampaignShipping to failed status for ID ${campaignShippingId}: ${updateErr.message}`);
      }
    }
  }
}

async function handleLoginStatus(job) {
  const users: { id: number }[] = await sequelize.query(
    `select id from "Users" where "updatedAt" < now() - '5 minutes'::interval and online = true`,
    { type: QueryTypes.SELECT }
  );
  for (let item of users) {
    try {
      const user = await User.findByPk(item.id);
      if (user) {
        await user.update({ online: false });
        logger.info(`Usuário passado para offline: ${item.id}`);
      }
    } catch (e: any) {
      Sentry.captureException(e);
    }
  }
}

async function handleInvoiceCreate() {
  logger.info("Iniciando geração de boletos");
  const job = new CronJob("*/5 * * * * *", async () => {
    const companies = await Company.findAll();
    companies.map(async c => {
      var dueDate = c.dueDate;
      const date = moment(dueDate).format();
      const timestamp = moment().format();
      const hoje = moment(moment()).format("DD/MM/yyyy");
      var vencimento = moment(dueDate).format("DD/MM/yyyy");

      var diff = moment(vencimento, "DD/MM/yyyy").diff(
        moment(hoje, "DD/MM/yyyy")
      );
      var dias = moment.duration(diff).asDays();

      if (dias < 20) {
        const plan = await Plan.findByPk(c.planId);

        const sql = `SELECT COUNT(*) mycount FROM "Invoices" WHERE "companyId" = ${
          c.id
        } AND "dueDate"::text LIKE '${moment(dueDate).format("yyyy-MM-DD")}%';`;
        const invoice = await sequelize.query(sql, { type: QueryTypes.SELECT });
        if (invoice[0]["mycount"] > 0) {
        } else {
          const sql = `INSERT INTO "Invoices" (detail, status, value, "updatedAt", "createdAt", "dueDate", "companyId")
            VALUES ('${plan.name}', 'open', '${plan.value}', '${timestamp}', '${timestamp}', '${date}', ${c.id});`;

          const invoiceInsert = await sequelize.query(sql, {
            type: QueryTypes.INSERT
          });

          /*           let transporter = nodemailer.createTransport({
                      service: 'gmail',
                      auth: {
                        user: 'email@gmail.com',
                        pass: 'senha'
                      }
                    });

                    const mailOptions = {
                      from: 'heenriquega@gmail.com', // sender address
                      to: `${c.email}`, // receiver (use array of string for a list)
                      subject: 'Fatura gerada - Sistema', // Subject line
                      html: `Olá ${c.name} esté é um email sobre sua fatura!<br>
          <br>
          Vencimento: ${vencimento}<br>
          Valor: ${plan.value}<br>
          Link: ${process.env.FRONTEND_URL}/financeiro<br>
          <br>
          Qualquer duvida estamos a disposição!
                      `// plain text body
                    };

                    transporter.sendMail(mailOptions, (err, info) => {
                      if (err)
                        console.log(err)
                      else
                        console.log(info);
                    }); */
        }
      }
    });
  });
  job.start();
}

handleCloseTicketsAutomatic();

handleInvoiceCreate();

async function handleVerifyAndFinalizeCampaigns(job) {
  monitoringLogger.info(`[DEBUG] Verificando campanhas para finalização...`);

  const campaigns = await Campaign.findAll({
    where: {
      status: "EM_ANDAMENTO"
    }
  });

  for (const campaign of campaigns) {
    try {
      await verifyAndFinalizeCampaign(campaign);
      monitoringLogger.info(`[DEBUG] Verificação de finalização para campanha ${campaign.id} concluída.`);
    } catch (err: any) {
      Sentry.captureException(err);
      monitoringLogger.error(`[DEBUG] Erro ao verificar e finalizar campanha ${campaign.id}: ${err.message}`);
    }
  }
}

export async function startQueueProcess() {
  logger.info("Iniciando processamento de filas");

  campaignQueue.on('error', (error) => {
    logger.error('A CampaignQueue error has occurred: ', error);
  });

  campaignQueue.on('failed', (job, err) => {
    logger.error(`Job ${job.id} in CampaignQueue failed with error: `, err);
  });

  campaignQueue.on('stalled', (job) => {
    logger.warn(`Job ${job.id} in CampaignQueue has stalled.`);
  });

  messageQueue.process("SendMessage", handleSendMessage);

  scheduleMonitor.process("Verify", handleVerifySchedules);

  sendScheduledMessages.process("SendMessage", handleSendScheduledMessage);

  campaignQueue.process("VerifyCampaigns", handleVerifyCampaigns);

  campaignQueue.process("ProcessCampaign", handleProcessCampaign);

  campaignQueue.process("PrepareContact", handlePrepareContact);

  campaignQueue.process("DispatchCampaign", 1, handleDispatchCampaign);

  campaignQueue.process("VerifyAndFinalizeCampaigns", handleVerifyAndFinalizeCampaigns);

  userMonitor.process("VerifyLoginStatus", handleLoginStatus);

  //queueMonitor.process("VerifyQueueStatus", handleVerifyQueue);

  scheduleMonitor.add(
    "Verify",
    {},
    {
      repeat: { cron: "*/5 * * * * *", key: "verify" }
    }
  );

  campaignQueue.add(
    "VerifyCampaigns",
    {},
    {
      repeat: { cron: "*/20 * * * * *", key: "verify-campaing" }
    }
  );

  campaignQueue.add(
    "VerifyAndFinalizeCampaigns",
    {},
    {
      repeat: { cron: "*/10 * * * *", key: "verify-and-finalize-campaigns" } // A cada 10 minutos
    }
  );

  userMonitor.add(
    "VerifyLoginStatus",
    {},
    {
      repeat: { cron: "* * * * *", key: "verify-login" }
    }
  );

  queueMonitor.add(
    "VerifyQueueStatus",
    {},
    {
      repeat: { cron: "*/20 * * * * *" }
    }
  );
}
