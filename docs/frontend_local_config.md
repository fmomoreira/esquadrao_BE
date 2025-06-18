# Configuração para Conexão de Frontend Local com o Backend

Este documento fornece instruções para configurar e conectar um projeto frontend local com o backend Esquadrão.

## Configuração do Backend

O backend está configurado para aceitar requisições de frontend local. O servidor backend está configurado para rodar em:

- **URL**: http://localhost:8080
- **Porta**: 8080 (definida no arquivo .env)

## Configuração de CORS

O backend já está configurado com CORS para permitir conexões de origens específicas. A configuração atual aceita:

```javascript
// De app.ts
app.use(cors({
  origin: ['https://esquadrao.eupromovo.com.br', 'http://esquadrao.eupromovo.com.br', 'http://localhost:3000'],
  methods: 'GET,POST,PUT,DELETE,OPTIONS',
  allowedHeaders: '*',
  credentials: true
}));
```

Isso significa que seu frontend local deve estar rodando na porta 3000 para ser aceito pelo CORS do backend.

## Configuração do Frontend

Para configurar seu projeto frontend para se comunicar com o backend local:

### 1. Configuração da URL Base da API

Crie um arquivo `.env` ou `.env.local` no diretório raiz do seu projeto frontend com:

```
REACT_APP_BACKEND_URL=http://localhost:8080
```

Ou para projetos Next.js:

```
NEXT_PUBLIC_BACKEND_URL=http://localhost:8080
```

### 2. Exemplo de Configuração do Axios

```javascript
// api.js ou api.ts
import axios from 'axios';

const api = axios.create({
  baseURL: process.env.REACT_APP_BACKEND_URL || 'http://localhost:8080',
  withCredentials: true, // Importante para autenticação com cookies
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  }
});

// Interceptador para adicionar token de autenticação (se necessário)
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
```

## Autenticação

O sistema usa autenticação baseada em JWT. Para autenticar um usuário:

1. Faça uma requisição POST para `/auth/login` com username e password
2. Armazene o token JWT retornado
3. Inclua o token JWT no header `Authorization: Bearer {token}` para todas as requisições subsequentes

## Endpoints Principais da API

| Método | URL | Descrição |
|--------|-----|-----------|
| POST | `/auth/login` | Autenticação de usuário |
| GET | `/whatsapp` | Listar conexões de WhatsApp |
| POST | `/contact` | Criar novo contato |
| GET | `/contact` | Listar contatos |
| GET | `/message` | Listar mensagens |
| POST | `/message` | Enviar mensagem |
| GET | `/campaign` | Listar campanhas |
| POST | `/campaign` | Criar nova campanha |

Para detalhes completos da API, consulte a documentação do projeto.

## Solucionando Problemas Comuns

### CORS

Se encontrar erros de CORS, verifique:
- Se o frontend está rodando na porta 3000
- Se a URL completa está na lista de origens permitidas no backend
- Se as credenciais estão sendo enviadas corretamente

### Autenticação

Se encontrar problemas de autenticação:
- Verifique se o token JWT está sendo enviado corretamente
- Verifique se o token não expirou
- Tente fazer logout e login novamente

## Exemplo de Login

```javascript
import api from './api';

async function login(username, password) {
  try {
    const response = await api.post('/auth/login', { username, password });
    localStorage.setItem('token', response.data.token);
    return response.data;
  } catch (error) {
    console.error('Erro de login:', error);
    throw error;
  }
}
```

## Desenvolvimento com WebSockets

O backend também suporta comunicação via WebSocket para mensagens em tempo real. Para conectar:

```javascript
import io from 'socket.io-client';

const socket = io(process.env.REACT_APP_BACKEND_URL, {
  withCredentials: true,
  extraHeaders: {
    Authorization: `Bearer ${localStorage.getItem('token')}`
  }
});

socket.on('connect', () => {
  console.log('Conectado ao WebSocket');
});

socket.on('appMessage', (data) => {
  console.log('Nova mensagem recebida:', data);
});

// Desconectar quando não for mais necessário
function disconnect() {
  socket.disconnect();
}
```

## Recomendações Adicionais

- Utilize um gerenciador de estado como Redux ou Context API para gerenciar o estado global da aplicação
- Implemente um mecanismo de refresh token para manter os usuários logados
- Considere usar uma biblioteca como React Query para gerenciamento de cache e estado do servidor
