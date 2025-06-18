# Documentação do Projeto Esquadrao_BE

## Visão Geral
O Esquadrao_BE é um sistema backend em Node.js que permite criar e gerenciar campanhas de mensagens para WhatsApp, utilizando a biblioteca `@whiskeysockets/baileys`. O sistema possibilita que empresas automatizem o envio de mensagens para múltiplos contatos através do WhatsApp, após autenticação via leitura de QR code.

## Principais Funcionalidades

### 1. Integração com WhatsApp
- Utiliza a biblioteca Baileys (`@whiskeysockets/baileys`) para acessar a API não oficial do WhatsApp
- Autenticação via leitura de QR code em aplicação web
- Acesso à lista de contatos do WhatsApp do usuário autenticado

### 2. Gestão de Campanhas
- Criação de campanhas de marketing com mensagens personalizadas
- Agendamento de envios
- Monitoramento em tempo real do status de entrega
- Disparo automatizado para listas de contatos

### 3. Sistema de Filas
- Utiliza o Bull (biblioteca de filas para Node.js)
- Gerencia o envio das mensagens de forma assíncrona e escalável
- Evita bloqueios do WhatsApp por envio em massa

### 4. Recursos de Mensagens
- Suporte para mensagens de confirmação nas campanhas
- Envio de mensagens com mídia (imagens, vídeos, documentos)
- Personalização de mensagens com dados do contato

### 5. Arquitetura Multi-empresa
- Sistema projetado para ser usado por várias empresas (multi-tenant)
- Controle de planos e faturamento
- Isolamento de dados entre empresas

### 6. Sistema de Tickets
- Gerenciamento de atendimentos via tickets
- Acompanhamento de interações com contatos
- Histórico de conversas

### 7. Segurança
- Implementa JWT para autenticação
- Gerenciamento de sessões de usuários
- Controle de permissões

## Fluxo de Disparo de Campanhas

O processo de disparo de campanhas segue este fluxo:

1. **Criação da campanha**: Uma campanha é criada com uma lista de contatos e mensagem personalizada
2. **Verificação**: O sistema verifica e processa a campanha (função `handleVerifyCampaigns`)
3. **Processamento**: Prepara a campanha para envio (função `handleProcessCampaign`)
4. **Preparação de contatos**: Organiza os contatos para envio (função `handlePrepareContact`)
5. **Disparo de mensagens**: Envia as mensagens para cada contato (função `handleDispatchCampaign`)

Na função `handleDispatchCampaign`, o sistema:
- Localiza os detalhes do envio da campanha
- Formata a mensagem (texto ou mídia)
- Envia para o número de WhatsApp do contato
- Atualiza o status de envio
- Notifica o frontend sobre o progresso via Socket.IO

## Tecnologias Utilizadas

### Backend
- **Node.js** com TypeScript
- **Express** para API REST
- **Sequelize** como ORM para banco de dados (suporta MySQL e SQLite)
- **Bull** para gerenciamento de filas
- **Socket.IO** para comunicação em tempo real

### Integração WhatsApp
- **WhiskeySocket/Baileys** para integração com WhatsApp

### Infraestrutura e Monitoramento
- **Sentry** para monitoramento de erros
- **Docker** para containerização
- **Nodemailer** para envio de e-mails

## Estrutura do Projeto

O projeto está organizado nas seguintes pastas principais:

- **src/**: Código-fonte principal
  - **controllers/**: Controladores da API
  - **models/**: Modelos de dados (Sequelize)
  - **services/**: Serviços de negócio
  - **routes/**: Rotas da API
  - **database/**: Configurações de banco de dados
  - **config/**: Arquivos de configuração
  - **queues.ts**: Gerenciamento de filas para campanhas

## Escalabilidade e Performance

O sistema utiliza filas para garantir a escalabilidade do envio de mensagens, evitando bloqueios por parte do WhatsApp. A arquitetura permite:

- Processamento assíncrono de campanhas
- Distribuição de carga
- Gestão de falhas com retentativas automáticas
- Monitoramento de performance

## Considerações de Uso

Este sistema é um backend completo para automação de marketing e comunicação via WhatsApp, permitindo às empresas:

- Gerenciar suas campanhas
- Acompanhar métricas de entrega
- Automatizar o envio de mensagens para listas de contatos
- Manter um relacionamento mais próximo com seus clientes através do WhatsApp
