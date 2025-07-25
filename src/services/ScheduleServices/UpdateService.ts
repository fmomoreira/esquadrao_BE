import * as Yup from "yup";

import AppError from "../../errors/AppError";
import Schedule from "../../models/Schedule";
import ShowService from "./ShowService";

interface ScheduleData {
  id?: number;
  body?: string;/* The code snippet `import
  DeleteService from
  "../services/ScheduleServices/DeleteService";`
  is importing the `DeleteService`
  function from the file located at
  `"../services/ScheduleServices/DeleteService"`.
  This function is likely used to
  handle the deletion of a schedule
  in the application. */

  sendAt?: Date;
  sentAt?: Date;
  contactId?: number;
  companyId?: number;
  ticketId?: number;
  userId?: number;
}

interface Request {
  scheduleData: ScheduleData;
  id: any;
  companyId: number;
}

const UpdateUserService = async ({
  scheduleData,
  id,
  companyId
}: Request): Promise<Schedule | undefined> => {
  const schedule = await ShowService(id, companyId);

  if (schedule?.companyId !== companyId) {
    throw new AppError("Não é possível alterar registros de outra empresa");
  }

  const schema = Yup.object().shape({
    body: Yup.string().min(5)
  });

  const {
    body,
    sendAt,
    sentAt,
    contactId,
    ticketId,
    userId,
  } = scheduleData;

  try {
    await schema.validate({ body });
  } catch (err: any) {
    throw new AppError(err.message);
  }

  await schedule.update({
    body,
    sendAt,
    sentAt,
    contactId,
    ticketId,
    userId,
  });

  await schedule.reload();
  return schedule;
};

export default UpdateUserService;
