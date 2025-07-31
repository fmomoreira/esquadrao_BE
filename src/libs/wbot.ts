import * as Sentry from "@sentry/node";
import makeWASocket, {
  WASocket,
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  isJidBroadcast,
  CacheStore,
  WAMessageStatus
} from "@whiskeysockets/baileys";
import makeWALegacySocket from "@whiskeysockets/baileys";
import P from "pino";

import Whatsapp from "../models/Whatsapp";
import CampaignShipping from "../models/CampaignShipping";
import { logger } from "../utils/logger";
import MAIN_LOGGER from "@whiskeysockets/baileys/lib/Utils/logger";
import authState from "../helpers/authState";
import { Boom } from "@hapi/boom";
import AppError from "../errors/AppError";
import { getIO } from "./socket";
import { Store } from "./store";
import { StartWhatsAppSession } from "../services/WbotServices/StartWhatsAppSession";
import DeleteBaileysService from "../services/BaileysServices/DeleteBaileysService";
import NodeCache from "node-cache";

const loggerBaileys = MAIN_LOGGER.child({});
loggerBaileys.level = "error";

type Session = WASocket & {
  id?: number;
  store?: Store;
};

const sessions: Session[] = [];

const retriesQrCodeMap = new Map<number, number>();

export const getWbot = (whatsappId: number): Session => {
  const sessionIndex = sessions.findIndex(s => s.id === whatsappId);

  if (sessionIndex === -1) {
    throw new AppError("ERR_WAPP_NOT_INITIALIZED");
  }
  return sessions[sessionIndex];
};

export const removeWbot = async (
  whatsappId: number,
  isLogout = true
): Promise<void> => {
  try {
    const sessionIndex = sessions.findIndex(s => s.id === whatsappId);
    if (sessionIndex !== -1) {
      if (isLogout) {
        sessions[sessionIndex].logout();
        sessions[sessionIndex].ws.close();
      }

      sessions.splice(sessionIndex, 1);
    }
  } catch (err) {
    logger.error(err);
  }
};

export const initWASocket = async (whatsapp: Whatsapp): Promise<Session> => {
  return new Promise(async (resolve, reject) => {
    try {
      (async () => {
        const io = getIO();

        const whatsappUpdate = await Whatsapp.findOne({
          where: { id: whatsapp.id }
        });

        if (!whatsappUpdate) return;

        const { id, name, provider } = whatsappUpdate;

        const { version, isLatest } = await fetchLatestBaileysVersion();
        const isLegacy = provider === "stable" ? true : false;

        logger.info(`using WA v${version.join(".")}, isLatest: ${isLatest}`);
        logger.info(`isLegacy: ${isLegacy}`);
        logger.info(`Starting session ${name}`);
        let retriesQrCode = 0;

        let wsocket: Session = null;
        // Criar um armazenamento básico para substituir makeInMemoryStore
        const store = {
          messages: {
            all: () => [],
            upsert: () => {},
            get: () => ({}),
            toJSON: () => ({}),
            update: () => {}
          },
          chats: {
            all: () => [],
            upsert: () => {},
            get: () => ({}),
            toJSON: () => ({}),
            update: () => {}
          },
          contacts: {
            all: () => [],
            upsert: () => {},
            get: () => ({}),
            toJSON: () => ({}),
            update: () => {}
          },
          // Implementação básica do store para compatibilidade
          loadMessages: async () => [],
          loadMessage: async () => null,
          writeToFile: () => {},
          readFromFile: () => {},
          bind: (sock: any) => {},
          logger: loggerBaileys
        };

        const MAX_MESSAGES = 100; // Ajuste conforme necessário



        const { state, saveState } = await authState(whatsapp);

        const msgRetryCounterCache = new NodeCache();
        const userDevicesCache: CacheStore = new NodeCache();

        wsocket = makeWASocket({
          logger: loggerBaileys,
          printQRInTerminal: false,
          browser: Browsers.appropriate("Desktop"),
          auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, logger)
          },
          version,
          //defaultQueryTimeoutMs: 60000,
          //retryRequestDelayMs: 250,
          keepAliveIntervalMs: 1000 * 60 * 5,
          msgRetryCounterCache,
          shouldIgnoreJid: jid => isJidBroadcast(jid)
        });

        // wsocket = makeWASocket({
        //   version,
        //   logger: loggerBaileys,
        //   printQRInTerminal: false,
        //   auth: state as AuthenticationState,
        //   generateHighQualityLinkPreview: false,
        //   shouldIgnoreJid: jid => isJidBroadcast(jid),
        //   browser: ["Chat", "Chrome", "10.15.7"],
        //   patchMessageBeforeSending: (message) => {
        //     const requiresPatch = !!(
        //       message.buttonsMessage ||
        //       // || message.templateMessage
        //       message.listMessage
        //     );
        //     if (requiresPatch) {
        //       message = {
        //         viewOnceMessage: {
        //           message: {
        //             messageContextInfo: {
        //               deviceListMetadataVersion: 2,
        //               deviceListMetadata: {},
        //             },
        //             ...message,
        //           },
        //         },
        //       };
        //     }

        //     return message;
        //   },
        // })

        wsocket.ev.on(
          "connection.update",
          async ({ connection, lastDisconnect, qr }) => {
            logger.info(
              `Socket  ${name} Connection Update ${connection || ""} ${
                lastDisconnect || ""
              }`
            );

            if (connection === "close") {
              if ((lastDisconnect?.error as Boom)?.output?.statusCode === 403) {
                await whatsapp.update({ status: "PENDING", session: "" });
                await DeleteBaileysService(whatsapp.id);
                io.to(`company-${whatsapp.companyId}-mainchannel`).emit(
                  `company-${whatsapp.companyId}-whatsappSession`,
                  {
                    action: "update",
                    session: whatsapp
                  }
                );
                removeWbot(id, false);
              }
              if (
                (lastDisconnect?.error as Boom)?.output?.statusCode !==
                DisconnectReason.loggedOut
              ) {
                removeWbot(id, false);
                setTimeout(
                  () => StartWhatsAppSession(whatsapp, whatsapp.companyId),
                  2000
                );
              } else {
                await whatsapp.update({ status: "PENDING", session: "" });
                await DeleteBaileysService(whatsapp.id);
                io.to(`company-${whatsapp.companyId}-mainchannel`).emit(
                  `company-${whatsapp.companyId}-whatsappSession`,
                  {
                    action: "update",
                    session: whatsapp
                  }
                );
                removeWbot(id, false);
                setTimeout(
                  () => StartWhatsAppSession(whatsapp, whatsapp.companyId),
                  2000
                );
              }
            }

            if (connection === "open") {
              await whatsapp.update({
                status: "CONNECTED",
                qrcode: "",
                retries: 0
              });

              io.to(`company-${whatsapp.companyId}-mainchannel`).emit(
                `company-${whatsapp.companyId}-whatsappSession`,
                {
                  action: "update",
                  session: whatsapp
                }
              );

              const sessionIndex = sessions.findIndex(
                s => s.id === whatsapp.id
              );
              if (sessionIndex === -1) {
                wsocket.id = whatsapp.id;
                sessions.push(wsocket);
              }

              resolve(wsocket);
            }

            if (qr !== undefined) {
              if (retriesQrCodeMap.get(id) && retriesQrCodeMap.get(id) >= 3) {
                await whatsappUpdate.update({
                  status: "DISCONNECTED",
                  qrcode: ""
                });
                await DeleteBaileysService(whatsappUpdate.id);
                io.to(`company-${whatsapp.companyId}-mainchannel`).emit(
                  "whatsappSession",
                  {
                    action: "update",
                    session: whatsappUpdate
                  }
                );
                wsocket.ev.removeAllListeners("connection.update");
                wsocket.ws.close();
                wsocket = null;
                retriesQrCodeMap.delete(id);
              } else {
                logger.info(`Session QRCode Generate ${name}`);
                retriesQrCodeMap.set(id, (retriesQrCode += 1));

                await whatsapp.update({
                  qrcode: qr,
                  status: "qrcode",
                  retries: 0
                });
                const sessionIndex = sessions.findIndex(
                  s => s.id === whatsapp.id
                );

                if (sessionIndex === -1) {
                  wsocket.id = whatsapp.id;
                  sessions.push(wsocket);
                }

                io.to(`company-${whatsapp.companyId}-mainchannel`).emit(
                  `company-${whatsapp.companyId}-whatsappSession`,
                  {
                    action: "update",
                    session: whatsapp
                  }
                );
              }
            }
          }
        );
        wsocket.ev.on("creds.update", saveState);

        wsocket.ev.on("messages.upsert", async ({ messages, type }) => {
          logger.debug(`[wbot] messages.upsert event received. Type: ${type}`); // Log de evento
          if (type === "append") {
            for (const message of messages) {
              logger.debug(`[wbot] Processing message. ID: ${message.key.id}, Status: ${message.status}, FromMe: ${message.key.fromMe}`); // Log de mensagem
              if (message.key.fromMe) {
                const messageId = message.key.id;
                let isDeliveredSuccessfully = null;

                if (message.status === WAMessageStatus.DELIVERY_ACK || message.status === WAMessageStatus.READ) {
                  isDeliveredSuccessfully = true;
                } else if (String(message.status) === "SERVER_ERROR" || String(message.status) === "REVOKED_BY_ME" || String(message.status) === "REVOKED_BY_SERVER") {
                  isDeliveredSuccessfully = false;
                }

                if (isDeliveredSuccessfully !== null) {
                  logger.debug(`[wbot] Status determined for messageId ${messageId}: ${isDeliveredSuccessfully}. Attempting to find CampaignShipping.`); // Log de status determinado
                  try {
                    const campaignShipping = await CampaignShipping.findOne({
                      where: { messageId: messageId }
                    });

                    if (campaignShipping) {
                      logger.debug(`[wbot] CampaignShipping found for messageId ${messageId}. Current isDeliveredSuccessfully: ${campaignShipping.isDeliveredSuccessfully}`); // Log de CampaignShipping encontrado
                      if (campaignShipping.isDeliveredSuccessfully === null) {
                        await campaignShipping.update({ isDeliveredSuccessfully: isDeliveredSuccessfully });
                        logger.info(`[wbot] Updated CampaignShipping for messageId ${messageId} to isDeliveredSuccessfully: ${isDeliveredSuccessfully}`);
                      } else {
                        logger.debug(`[wbot] CampaignShipping for messageId ${messageId} already has a status (${campaignShipping.isDeliveredSuccessfully}). Skipping update.`); // Log de status já definido
                      }
                    } else {
                      logger.debug(`[wbot] CampaignShipping not found for messageId: ${messageId}`); // Log de CampaignShipping não encontrado
                    }
                  } catch (error) {
                    Sentry.captureException(error);
                    logger.error(`[wbot] Error updating CampaignShipping status for messageId ${messageId}: ${error.message}`);
                  }
                } else {
                  logger.debug(`[wbot] No relevant status for messageId ${messageId}. isDeliveredSuccessfully remains null.`); // Log de status não relevante
                }
              }
            }
          }

          store.chats.all().forEach(chat => {
            const chatMessages = store.messages[chat.id];
            if (chatMessages && chatMessages.array.length > MAX_MESSAGES) {
                chatMessages.array.splice(0, chatMessages.array.length - MAX_MESSAGES);
            }
        });
      });

        store.bind(wsocket.ev);
      })();
    } catch (error) {
      Sentry.captureException(error);
      console.log("Error wbot POSSIVEL PROBLEMA COM VERSÃO DO BAILEYS",error);
      reject(error);
    }
  });
};
