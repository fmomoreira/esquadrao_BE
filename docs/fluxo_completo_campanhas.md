# Documentação do Fluxo de Disparo de Campanhas

## Visão Geral

O sistema de disparo de campanhas do Esquadrao_BE é uma solução robusta para automatizar o envio de mensagens WhatsApp para múltiplos contatos. Este documento detalha o fluxo completo de processamento de campanhas, desde sua criação até o envio efetivo das mensagens.

## Fluxo Completo

O processo de disparo de campanhas segue um fluxo estruturado de cinco etapas principais:

1. **Criação da campanha**: Uma campanha é criada com uma lista de contatos e mensagem personalizada
2. **Verificação**: O sistema verifica e processa a campanha (função `handleVerifyCampaigns`)
3. **Processamento**: Prepara a campanha para envio (função `handleProcessCampaign`)
4. **Preparação de contatos**: Organiza os contatos para envio (função `handlePrepareContact`)
5. **Disparo de mensagens**: Envia as mensagens para cada contato (função `handleDispatchCampaign`)

```
Criação → Verificação → Processamento → Preparação de Contatos → Disparo
```

## Detalhamento das Etapas

### 1. Criação da Campanha

Nesta etapa inicial, o usuário cria uma campanha com os seguintes componentes principais:
- Nome e objetivo da campanha
- Lista de contatos destinatários
- Conteúdo das mensagens (até 5 mensagens diferentes podem ser configuradas)
- Mensagens de confirmação (opcional, até 5 opções)
- Mídia anexada (opcional)
- Data e hora de agendamento

A campanha é salva no banco de dados com o status "PROGRAMADA" e aguarda processamento.

### 2. Verificação (handleVerifyCampaigns)

Esta função atua como um serviço de verificação periódica que:

- Consulta o banco de dados em busca de campanhas agendadas para a próxima hora
- Para cada campanha encontrada, calcula o tempo de atraso até o horário programado
- Adiciona a campanha à fila de processamento (`ProcessCampaign`) com o atraso apropriado

**Código-chave**:
```javascript
campaignQueue.add(
  "ProcessCampaign",
  {
    id: campaign.id,
    delay
  },
  {
    removeOnComplete: true
  }
);
```

### 3. Processamento (handleProcessCampaign)

Esta função é responsável por preparar a campanha para envio, realizando as seguintes operações:

- Carrega os detalhes da campanha e da lista de contatos
- Obtém as configurações da empresa para intervalos de envio
- Para cada contato na lista, calcula um atraso específico para evitar bloqueio por spam
- Adiciona cada contato à fila de preparação (`PrepareContact`)
- Atualiza o status da campanha para "EM_ANDAMENTO"

As configurações determinam:
- `messageInterval`: Intervalo básico entre mensagens (em segundos)
- `longerIntervalAfter`: Após quantas mensagens deve-se usar um intervalo maior
- `greaterInterval`: Intervalo maior a ser usado (em segundos)

**Código-chave**:
```javascript
for (let i = 0; i < contactData.length; i++) {
  baseDelay = addSeconds(
    baseDelay,
    i > longerIntervalAfter ? greaterInterval : messageInterval
  );

  const { contactId, campaignId, variables } = contactData[i];
  const delay = calculateDelay(
    i,
    baseDelay,
    longerIntervalAfter,
    greaterInterval,
    messageInterval
  );
  
  const queuePromise = campaignQueue.add(
    "PrepareContact",
    { contactId, campaignId, variables, delay },
    { removeOnComplete: true }
  );
  queuePromises.push(queuePromise);
}
```

### 4. Preparação de Contatos (handlePrepareContact)

Esta função processa cada contato individualmente, preparando a mensagem específica:

- Carrega os dados do contato e da campanha
- Seleciona uma das mensagens disponíveis para envio (rotaciona entre as mensagens configuradas)
- Processa a mensagem com variáveis personalizadas (como {nome}, {email}, etc.)
- Cria ou atualiza um registro de envio (`CampaignShipping`)
- Adiciona o registro à fila de disparo (`DispatchCampaign`)
- Verifica se a campanha foi finalizada

O sistema pode usar até 5 mensagens diferentes configuradas e rotaciona entre elas automaticamente para evitar repetição excessiva.

**Código-chave**:
```javascript
const message = getProcessedMessage(
  messages[radomIndex],
  variables,
  contact
);
campaignShipping.message = `\u200c ${message}`;

// Se a campanha tiver confirmação habilitada
if (campaign.confirmation) {
  const confirmationMessages = getCampaignValidConfirmationMessages(campaign);
  if (confirmationMessages.length) {
    const radomIndex = randomValue(0, confirmationMessages.length);
    const message = getProcessedMessage(
      confirmationMessages[radomIndex],
      variables,
      contact
    );
    campaignShipping.confirmationMessage = `\u200c ${message}`;
  }
}
```

### 5. Disparo de Mensagens (handleDispatchCampaign)

Esta função é responsável pelo envio efetivo da mensagem:

- Carrega o registro de envio e os detalhes da campanha
- Obtém a instância ativa do WhatsApp para envio (via `GetWhatsappWbot`)
- Formata o número do destinatário (formato WhatsApp)
- Prepara o corpo da mensagem (texto ou mídia)
- Envia a mensagem usando a API do WhatsApp
- Atualiza o status de envio no banco de dados
- Notifica o frontend sobre o progresso via Socket.IO
- Verifica se a campanha foi finalizada

Se a campanha incluir mídia (imagens, vídeos ou documentos), o sistema a envia junto com a mensagem. O sistema também suporta enviar múltiplos arquivos de uma lista de arquivos.

**Código-chave**:
```javascript
// Para envio de mídia
if (campaign.mediaPath) {
  const publicFolder = path.resolve(__dirname, "..", "public");
  const filePath = path.join(publicFolder, campaign.mediaPath);

  const options = await getMessageOptions(
    campaign.mediaName,
    filePath,
    body
  );
  if (Object.keys(options).length) {
    await wbot.sendMessage(chatId, { ...options });
  }
} else {
  // Para envio de texto
  if (campaign.confirmation && campaignShipping.confirmation === null) {
    await wbot.sendMessage(chatId, {
      text: body
    });
    await campaignShipping.update({ confirmationRequestedAt: moment() });
  } else {
    await wbot.sendMessage(chatId, {
      text: body
    });
  }
}
```

## Sistema de Filas e Escalabilidade

O fluxo de disparo utiliza o sistema de filas Bull para garantir a escalabilidade e a confiabilidade:

- **Fila `campaignQueue`**: Gerencia todas as etapas do processo
- **Processamento assíncrono**: Permite o envio de milhares de mensagens sem comprometer o desempenho
- **Intervalos inteligentes**: Evita bloqueios por detecção de spam pelo WhatsApp
- **Tratamento de erros**: Captura e registra exceções usando Sentry

## Personalização de Mensagens

O sistema permite a personalização de mensagens com variáveis como:
- Nome do contato
- Email
- Outras variáveis customizadas

Exemplo:
```
Olá {nome}, temos uma oferta especial para você!
```

## Confirmação de Mensagens

O sistema suporta um fluxo de confirmação, onde após o envio da mensagem principal, o sistema pode enviar uma mensagem de confirmação caso o usuário responda.

## Monitoramento e Notificações

O sistema utiliza Socket.IO para notificar o frontend em tempo real sobre o progresso das campanhas, permitindo o acompanhamento em tempo real pelo usuário.

```javascript
const io = getIO();
io.to(`company-${campaign.companyId}-mainchannel`).emit(
  `company-${campaign.companyId}-campaign`,
  {
    action: "update",
    record: campaign
  }
);
```

## Considerações Técnicas

- **Controle de Concorrência**: A função `handleDispatchCampaign` é configurada com concorrência limitada (1) para evitar bloqueios
- **Marcadores Unicode**: As mensagens incluem um caractere unicode invisível (`\u200c`) para evitar detecção como spam
- **Tratamento de Mídia**: O sistema suporta o envio de vários tipos de mídia (imagens, vídeos, documentos)
- **Timeout e Retry**: Em caso de falhas, o sistema possui mecanismos de timeout e retry automáticos

---

Esta documentação apresenta uma visão abrangente do fluxo de disparo de campanhas do Esquadrao_BE, descrevendo cada etapa do processo, seus componentes e interações.
