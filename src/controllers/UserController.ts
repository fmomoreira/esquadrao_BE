import { Request, Response } from "express";
import { getIO } from "../libs/socket";

import CheckSettingsHelper from "../helpers/CheckSettings";
import AppError from "../errors/AppError";

import CreateUserService from "../services/UserServices/CreateUserService";
import ListUsersService from "../services/UserServices/ListUsersService";
import UpdateUserService from "../services/UserServices/UpdateUserService";
import ShowUserService from "../services/UserServices/ShowUserService";
import DeleteUserService from "../services/UserServices/DeleteUserService";
import SimpleListService from "../services/UserServices/SimpleListService";
import User from "../models/User";

type IndexQuery = {
  searchParam: string;
  pageNumber: string;
  superUser: string;
};

type ListQueryParams = {
  companyId: string;
};

export const index = async (req: Request, res: Response): Promise<Response> => {
  const { searchParam, pageNumber, superUser } = req.query as unknown as IndexQuery;
  const { companyId, profile } = req.user;

  const { users, count, hasMore } = await ListUsersService({
    searchParam,
    pageNumber,
    companyId,
    profile,
    superUser
  });

  return res.json({ users, count, hasMore });
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const {
    email,
    password,
    name,
    profile,
    companyId: bodyCompanyId,
    queueIds,
    whatsappId,
	allTicket
  } = req.body;
  let userCompanyId: number | null = null;

  let requestUser: User = null;


  if(bodyCompanyId !== null){
    userCompanyId = bodyCompanyId;
  }else if (req.user !== undefined) {
    const { companyId: cId } = req.user;
    userCompanyId = cId;
    requestUser = await User.findByPk(req.user.id);
  }

  const newUserCompanyId = bodyCompanyId || userCompanyId;

  if (req.url === "/signup") {
    if (await CheckSettingsHelper("userCreation") === "disabled") {
      throw new AppError("ERR_USER_CREATION_DISABLED", 403);
    }
  } else if (req.user?.profile !== "admin") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }
  const user = await CreateUserService({
    email,
    password,
    name,
    profile,
    companyId: newUserCompanyId,
    queueIds,
    whatsappId,
	allTicket
  });

  const io = getIO();
  io.to(`company-${userCompanyId}-mainchannel`).emit(`company-${userCompanyId}-user`, {
    action: "create",
    user
  });

  return res.status(200).json(user);
};

export const show = async (req: Request, res: Response): Promise<Response> => {
  const { userId } = req.params;

  const user = await ShowUserService(userId);

  return res.status(200).json(user);
};

export const update = async (
  req: Request,
  res: Response
): Promise<Response> => {
  if (req.user.profile !== "admin") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  console.log("BATEu UPDATE")

  const { id: requestUserId} = req.user;
  const { userId  } = req.params;
  const userData = req.body;
  const companyIdParam = req.body.companyIdParam

  console.log('USER DATA: ' + userData)

  let companyId = parseInt(companyIdParam)

  const user = await UpdateUserService({
    userData,
    userId,
    companyId,
    requestUserId: +requestUserId
  });

  const io = getIO();
  io.to(`company-${companyId}-mainchannel`).emit(`company-${companyId}-user`, {
    action: "update",
    user
  });

  return res.status(200).json(user);
};

export const remove = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { userId } = req.params;
  const { companyId } = req.user;

  if (req.user.profile !== "admin") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  await DeleteUserService(userId, companyId);

  const io = getIO();
  io.to(`company-${companyId}-mainchannel`).emit(`company-${companyId}-user`, {
    action: "delete",
    userId
  });

  return res.status(200).json({ message: "User deleted" });
};

export const list = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.query;
  const { companyId: userCompanyId } = req.user;

  const users = await SimpleListService({
    companyId: companyId ? +companyId : userCompanyId
  });

  return res.status(200).json(users);
};
