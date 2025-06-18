import { Chat } from "@whiskeysockets/baileys";
import BaileysChats from "../../models/BaileysChats";
import Long from "long";

export const CreateOrUpdateBaileysChatService = async (
  whatsappId: number,
  chat: Partial<Chat>
): Promise<BaileysChats> => {
  const { id, unreadCount } = chat;
  const conversationTimestamp: number =
    chat.conversationTimestamp instanceof Long
      ? chat.conversationTimestamp.toNumber()
      : chat.conversationTimestamp;
  const baileysChat = await BaileysChats.findOne({
    where: {
      whatsappId,
      jid: id
    }
  });

  if (baileysChat) {
    const baileysChats = await baileysChat.update({
      conversationTimestamp,
      unreadCount: unreadCount ? baileysChat.unreadCount + unreadCount : 0
    });

    return baileysChats;
  }
  // timestamp now

  const timestamp = new Date().getTime();

  // convert timestamp to number
  const conversationTimestampNumber = Number(timestamp);

  const baileysChats = await BaileysChats.create({
    whatsappId: whatsappId.toString(),
    jid: id,
    conversationTimestamp: conversationTimestamp || conversationTimestampNumber,
    unreadCount: unreadCount || 1
  });

  return baileysChats;
};
