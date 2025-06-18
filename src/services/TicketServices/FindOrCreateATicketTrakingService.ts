import { Op } from "sequelize";
import TicketTraking from "../../models/TicketTraking";

interface Params {
  ticketId: number;
  companyId: number;
  whatsappId?: number;
  userId?: number;
}

const FindOrCreateATicketTrakingService = async ({
  ticketId,
  companyId,
  whatsappId,
  userId
}: Params): Promise<TicketTraking> => {
  const ticketTraking = await TicketTraking.findOne({
    where: {
      ticketId,
      finishedAt: {
        [Op.is]: null
      }
    }
  });

  if (ticketTraking) {
    return ticketTraking;
  }

  const newRecord = await TicketTraking.create({
    ticketId,
    companyId,
    whatsappId,
    userId
  });

  return newRecord;
};

export default FindOrCreateATicketTrakingService;
