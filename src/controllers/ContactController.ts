import * as Yup from "yup";
import { Request, Response } from "express";
import { getIO } from "../libs/socket";

import ListContactsService from "../services/ContactServices/ListContactsService";
import CreateContactService from "../services/ContactServices/CreateContactService";
import ShowContactService from "../services/ContactServices/ShowContactService";
import UpdateContactService from "../services/ContactServices/UpdateContactService";
import DeleteContactService from "../services/ContactServices/DeleteContactService";
import GetContactService from "../services/ContactServices/GetContactService";

import CheckContactNumber from "../services/WbotServices/CheckNumber";
import CheckIsValidContact from "../services/WbotServices/CheckIsValidContact";
import GetProfilePicUrl from "../services/WbotServices/GetProfilePicUrl";
import AppError from "../errors/AppError";
import SimpleListService, {
  SearchContactParams
} from "../services/ContactServices/SimpleListService";
import ContactCustomField from "../models/ContactCustomField";
import {head} from "lodash";
import {ImportContacts} from "../services/ContactServices/ImportContacts";

type IndexQuery = {
  searchParam: string;
  pageNumber: string;
};

type IndexGetContactQuery = {
  name: string;
  number: string;
};

interface ExtraInfo extends ContactCustomField {
  name: string;
  value: string;
}
interface ContactData {
  name: string;
  number: string;
  email?: string;
  extraInfo?: ExtraInfo[];
  cpf_cnpj?: string;
  endereco?: string;
  cep?: string;
  bairro?: string;
  cidade?: string;
}

export const index = async (req: Request, res: Response): Promise<Response> => {
  const { searchParam, pageNumber } = req.query as IndexQuery;
  const { companyId } = req.user;

  const { contacts, count, hasMore } = await ListContactsService({
    searchParam,
    pageNumber,
    companyId
  });

  return res.json({ contacts, count, hasMore });
};

export const getContact = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { name, number } = req.body as IndexGetContactQuery;
  const { companyId } = req.user;

  const contact = await GetContactService({
    name,
    number,
    companyId
  });

  return res.status(200).json(contact);
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const newContact: ContactData = req.body;
  newContact.number = newContact.number.replace("-", "").replace(" ", "");

  const schema = Yup.object().shape({
    name: Yup.string().required(),
    number: Yup.string()
      .required()
      .matches(/^\d+$/, "Invalid number format. Only numbers is allowed.")
  });

  try {
    await schema.validate(newContact);
  } catch (err: any) {
    throw new AppError(err.message);
  }

  await CheckIsValidContact(newContact.number, companyId);
  const validNumber = await CheckContactNumber(newContact.number, companyId);
  const number = validNumber.jid.replace(/\D/g, "");
  newContact.number = number;

  /**
   * Código desabilitado por demora no retorno
   */
  // const profilePicUrl = await GetProfilePicUrl(validNumber.jid, companyId);

  const contact = await CreateContactService({
    ...newContact,
    // profilePicUrl,
    companyId
  });

  const io = getIO();
  io.to(`company-${companyId}-mainchannel`).emit(`company-${companyId}-contact`, {
    action: "create",
    contact
  });

  return res.status(200).json(contact);
};

export const show = async (req: Request, res: Response): Promise<Response> => {
  const { contactId } = req.params;
  const { companyId } = req.user;

  const contact = await ShowContactService(contactId, companyId);

  return res.status(200).json(contact);
};

export const update = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const contactData: ContactData = req.body;
  const { companyId } = req.user;

  const schema = Yup.object().shape({
    name: Yup.string(),
    number: Yup.string().matches(
      /^\d+$/,
      "Invalid number format. Only numbers is allowed."
    )
  });

  try {
    await schema.validate(contactData);
  } catch (err: any) {
    throw new AppError(err.message);
  }

  await CheckIsValidContact(contactData.number, companyId);
  const validNumber = await CheckContactNumber(contactData.number, companyId);
  const number = validNumber.jid.replace(/\D/g, "");
  contactData.number = number;

  const { contactId } = req.params;

  const contact = await UpdateContactService({
    contactData,
    contactId,
    companyId
  });

  const io = getIO();
  io.to(`company-${companyId}-mainchannel`).emit(`company-${companyId}-contact`, {
    action: "update",
    contact
  });

  return res.status(200).json(contact);
};

export const remove = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { contactId } = req.params;
  const { companyId } = req.user;

  await ShowContactService(contactId, companyId);

  await DeleteContactService(contactId);

  const io = getIO();
  io.to(`company-${companyId}-mainchannel`).emit(`company-${companyId}-contact`, {
    action: "delete",
    contactId
  });

  return res.status(200).json({ message: "Contact deleted" });
};

export const list = async (req: Request, res: Response): Promise<Response> => {
  const { name } = req.query as unknown as SearchContactParams;
  const { companyId } = req.user;

  const contacts = await SimpleListService({ name, companyId });

  return res.json(contacts);
};

export const upload = async (req: Request, res: Response) => {
  const files = req.files as Express.Multer.File[];
  const file: Express.Multer.File = head(files) as Express.Multer.File;
  const { companyId } = req.user;

  const response = await ImportContacts(companyId, file);

  const io = getIO();

  io.to(`company-${companyId}-mainchannel`).emit(`company-${companyId}-contact`, {
    action: "create",
    records: response
  });

  return res.status(200).json(response);
};

export const getContactVcard = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { name, number } = req.query as IndexGetContactQuery;
  const { companyId } = req.user;

  let vNumber = number;
  const numberDDI = vNumber.toString().substr(0, 2);
  const numberDDD = vNumber.toString().substr(2, 2);
  const numberUser = vNumber.toString().substr(-8, 8);

  if (numberDDD <= '30' && numberDDI === '55') {
    console.log("menor 30")
    vNumber = `${numberDDI + numberDDD + 9 + numberUser}@s.whatsapp.net`;
  } else if (numberDDD > '30' && numberDDI === '55') {
    console.log("maior 30")
    vNumber = `${numberDDI + numberDDD + numberUser}@s.whatsapp.net`;
  } else {
    vNumber = `${number}@s.whatsapp.net`;
  }

  console.log(vNumber);

  const contact = await GetContactService({
    name,
    number,
    companyId
  });

  return res.status(200).json(contact);
};
