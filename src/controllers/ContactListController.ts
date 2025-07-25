import * as Yup from "yup";
import { Request, Response } from "express";
import { getIO } from "../libs/socket";

import ListService from "../services/ContactListService/ListService";
import CreateService from "../services/ContactListService/CreateService";
import ShowService from "../services/ContactListService/ShowService";
import UpdateService from "../services/ContactListService/UpdateService";
import DeleteService from "../services/ContactListService/DeleteService";
import FindService from "../services/ContactListService/FindService";
import { head } from "lodash";

import ContactList from "../models/ContactList";

import AppError from "../errors/AppError";
import { ImportContacts } from "../services/ContactListService/ImportContacts";

type IndexQuery = {
  searchParam: string;
  pageNumber: string;
  companyId: string | number;
};

type StoreData = {
  name: string;
  companyId: string;
};

type FindParams = {
  companyId: string;
};

export const index = async (req: Request, res: Response): Promise<Response> => {
  const { searchParam, pageNumber } = req.query as IndexQuery;
  const { companyId } = req.user;

  const { records, totalCount, hasMore } = await ListService({
    searchParam,
    pageNumber,
    companyId
  });

  return res.json({ records, totalCount, hasMore });
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const data = req.body as StoreData;

  const schema = Yup.object().shape({
    name: Yup.string().required()
  });

  try {
    await schema.validate(data);
  } catch (err: any) {
    throw new AppError(err.message);
  }

  const record = await CreateService({
    ...data,
    companyId
  });

  const io = getIO();
  io.to(`company-${companyId}-mainchannel`).emit(`company-${companyId}-ContactList`, {
    action: "create",
    record
  });

  return res.status(200).json(record);
};

export const show = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params;

  const record = await ShowService(id);

  return res.status(200).json(record);
};

export const update = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const data = req.body as StoreData;
  const { companyId } = req.user;

  const schema = Yup.object().shape({
    name: Yup.string().required()
  });

  try {
    await schema.validate(data);
  } catch (err: any) {
    throw new AppError(err.message);
  }

  const { id } = req.params;

  const record = await UpdateService({
    ...data,
    id
  });

  const io = getIO();
  io.to(`company-${companyId}-mainchannel`).emit(`company-${companyId}-ContactList`, {
    action: "update",
    record
  });

  return res.status(200).json(record);
};

export const remove = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { id } = req.params;
  const { companyId } = req.user;

  await DeleteService(id);

  const io = getIO();
  io.to(`company-${companyId}-mainchannel`).emit(`company-${companyId}-ContactList`, {
    action: "delete",
    id
  });

  return res.status(200).json({ message: "Contact list deleted" });
};

export const findList = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const params = req.query as FindParams;
  const records: ContactList[] = await FindService(params);

  return res.status(200).json(records);
};

export const upload = async (req: Request, res: Response) => {
  try {
    // Verificar se arquivos foram enviados
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: "Nenhum arquivo foi enviado" 
      });
    }

    const file: Express.Multer.File = head(files) as Express.Multer.File;
    if (!file) {
      return res.status(400).json({ 
        success: false, 
        message: "Arquivo inválido" 
      });
    }

    const { id } = req.params;
    const { companyId } = req.user;

    const response = await ImportContacts(+id, companyId, file);

    const io = getIO();

    io.to(`company-${companyId}-mainchannel`).emit(`company-${companyId}-ContactListItem-${+id}`, {
      action: "reload",
      records: response
    });

    return res.status(200).json({
      success: true,
      message: "Arquivo processado com sucesso",
      data: response
    });
  } catch (error: any) {
    console.error("Erro ao processar upload:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Erro ao processar o arquivo",
      error: error.toString()
    });
  }
};
