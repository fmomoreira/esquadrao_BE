import dotenv from "dotenv";
import * as crypto from 'crypto';

// Configura o crypto globalmente para o Baileys de forma segura
if (!global.crypto) {
  (global as any).crypto = {
    getRandomValues: (arr: any) => {
      if (!(arr instanceof Uint8Array)) {
        throw new Error('Expected Uint8Array');
      }
      const bytes = crypto.randomBytes(arr.length);
      arr.set(bytes);
      return arr;
    },
    randomUUID: () => crypto.randomUUID()
  };
}

dotenv.config({
  path: process.env.NODE_ENV === "test" ? ".env.test" : ".env"
});
