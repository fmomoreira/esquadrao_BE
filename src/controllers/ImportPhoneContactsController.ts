import { Request, Response } from "express";
import ImportContactsService from "../services/WbotServices/ImportContactsService";
import * as Sentry from "@sentry/node";
import { logger } from "../utils/logger";

export const store = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;

  try {
    await ImportContactsService(companyId);
    return res.status(200).json({ 
      success: true,
      message: "Contatos importados com sucesso"
    });
  } catch (error) {
    Sentry.captureException(error);
    logger.error(`Error importing contacts: ${error}`);
    
    // Determina o código de status HTTP apropriado com base no tipo de erro
    let statusCode = 500;
    
    // Erros relacionados à conexão do WhatsApp são 400 (Bad Request)
    if (error.message.includes("WhatsApp não está conectado") || 
        error.message.includes("Dados do WhatsApp não encontrados")) {
      statusCode = 400;
    }
    
    // Erros relacionados a permissões ou dados inválidos são 422 (Unprocessable Entity)
    if (error.message.includes("permissão") || 
        error.message.includes("vazia ou inválida")) {
      statusCode = 422;
    }
    
    // Retorna uma resposta de erro detalhada para o frontend
    return res.status(statusCode).json({
      success: false,
      error: true,
      message: "Falha ao importar contatos",
      details: error.message || "Erro desconhecido",
      errorCode: statusCode
    });
  }
};
