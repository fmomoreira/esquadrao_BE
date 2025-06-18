import { Request, Response, NextFunction } from 'express';

export const corsDebug = (req: Request, res: Response, next: NextFunction) => {
  console.log('=== CORS Debug ===');
  console.log('Método:', req.method);
  console.log('URL:', req.originalUrl);
  console.log('Headers recebidos:', req.headers);
  
  // Adiciona headers CORS para debug
  res.header('X-CORS-Debug', 'active');
  
  // Se for uma requisição OPTIONS, responde imediatamente
  if (req.method === 'OPTIONS') {
    console.log('Requisição OPTIONS detectada');
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH, HEAD');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-access-token, access-control-allow-origin');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.status(204).end();
    return;
  }
  
  next();
};
