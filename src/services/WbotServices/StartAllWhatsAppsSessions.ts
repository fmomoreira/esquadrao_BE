import ListWhatsAppsService from "../WhatsappService/ListWhatsAppsService";
import { StartWhatsAppSession } from "./StartWhatsAppSession";
import * as Sentry from "@sentry/node";
import { logger } from "../../utils/logger";

export const StartAllWhatsAppsSessions = async (
  companyId: number
): Promise<void> => {
  // Verifica se a inicialização do WhatsApp está desativada via variável de ambiente
  if (process.env.DISABLE_WBOT === "true") {
    logger.info("Inicialização do WhatsApp desativada via variável de ambiente DISABLE_WBOT");
    return;
  }

  try {
    const whatsapps = await ListWhatsAppsService({ companyId });
    if (whatsapps.length > 0) {
      whatsapps.forEach(whatsapp => {
        StartWhatsAppSession(whatsapp, companyId);
      });
    }
  } catch (e) {
    Sentry.captureException(e);
    logger.error(`Erro ao iniciar sessões do WhatsApp: ${e.message}`);
  }
};
