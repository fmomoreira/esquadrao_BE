import { Op } from "sequelize";
import TicketTraking from "./models/TicketTraking";
import { format } from "date-fns";
import moment from "moment";
import Ticket from "./models/Ticket";
import Whatsapp from "./models/Whatsapp";
import { getIO } from "./libs/socket";
import { logger } from "./utils/logger";
import ShowTicketService from "./services/TicketServices/ShowTicketService";


export const TransferTicketQueue = async (): Promise<void> => {
  const io = getIO();
  const batchSize = 100; // Processa 100 tickets por vez
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const tickets = await Ticket.findAll({
      where: {
        status: "pending",
        queueId: {
          [Op.is]: null
        },
      },
      limit: batchSize,
      offset: offset,
      order: [["updatedAt", "ASC"]] // Processa os mais antigos primeiro
    });

    if (tickets.length === 0) {
      hasMore = false;
      continue;
    }

    // Usar for...of para processar sequencialmente
    for (const ticket of tickets) {
      const wpp = await Whatsapp.findOne({
        where: {
          id: ticket.whatsappId
        }
      });

      if (!wpp || !wpp.timeToTransfer || !wpp.transferQueueId || wpp.timeToTransfer == 0) {
        continue; // Pula para o próximo ticket
      }

      const dataLimite = new Date(ticket.updatedAt);
      dataLimite.setMinutes(dataLimite.getMinutes() + wpp.timeToTransfer);

      if (new Date() > dataLimite) {
        await ticket.update({
          queueId: wpp.transferQueueId,
        });

        const ticketTraking = await TicketTraking.findOne({
          where: {
            ticketId: ticket.id
          },
          order: [["createdAt", "DESC"]]
        });

        if (ticketTraking) {
          await ticketTraking.update({
            queuedAt: moment().toDate(),
          });
        }

        const currentTicket = await ShowTicketService(ticket.id, ticket.companyId);

        io.to(ticket.status)
          .to("notification")
          .to(ticket.id.toString())
          .emit(`company-${ticket.companyId}-ticket`, {
            action: "update",
            ticket: currentTicket,
            traking: "created ticket 33"
          });

        logger.info(`Transferencia de ticket automatica ticket id ${ticket.id} para a fila ${wpp.transferQueueId}`);
      }
    }

    offset += tickets.length;
  }
}
