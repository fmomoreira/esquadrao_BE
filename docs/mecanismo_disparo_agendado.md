# Documentação: Mecanismo de Disparo de Campanhas Agendadas

## Visão Geral

O Esquadrao_BE implementa um sistema robusto para o agendamento e disparo automático de campanhas de WhatsApp. Este documento detalha o processo que ocorre quando uma campanha atinge seu horário programado, explicando desde a verificação inicial até o envio das mensagens individuais.

## Fluxo de Disparo de Campanhas Agendadas

### 1. Verificação Periódica de Campanhas

O sistema executa verificações periódicas para identificar campanhas que atingiram seu horário programado:

```typescript
// Adicionado à fila para execução periódica
scheduleMonitor.add(
  "Verify",
  {},
  {
    repeat: { cron: "*/5 * * * * *", key: "verify" },
    removeOnComplete: true
  }
);
```

A função `handleVerifyCampaigns` é executada para verificar campanhas programadas:

```typescript
async function handleVerifyCampaigns(job) {
  // Busca campanhas programadas para a próxima hora
  const campaigns = await sequelize.query(
    `select id, "scheduledAt" from "Campaigns" c
    where "scheduledAt" between now() and now() + '1 hour'::interval and status = 'PROGRAMADA'`,
    { type: QueryTypes.SELECT }
  );

  // Processa cada campanha encontrada
  for (let campaign of campaigns) {
    const now = moment();
    const scheduledAt = moment(campaign.scheduledAt);
    const delay = scheduledAt.diff(now, "milliseconds");
    
    // Adiciona à fila de processamento com o delay calculado
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
  }
}
```

### 2. Cálculo do Tempo de Atraso (Delay)

Quando uma campanha atinge o horário de verificação:

1. O sistema calcula a diferença entre o momento atual e o horário programado
2. Esta diferença (em milissegundos) é usada como atraso para o processamento
3. A campanha é adicionada à fila com este atraso, garantindo execução no momento exato

### 3. Processamento da Campanha no Horário Programado

Quando o atraso calculado expira, a função `handleProcessCampaign` é executada:

```typescript
async function handleProcessCampaign(job) {
  const { id } = job.data;
  const campaign = await getCampaign(id);
  const settings = await getSettings(campaign);
  
  if (campaign) {
    const { contacts } = campaign.contactList;
    
    // Configurações de intervalos para evitar bloqueio
    const longerIntervalAfter = parseToMilliseconds(settings.longerIntervalAfter);
    const greaterInterval = parseToMilliseconds(settings.greaterInterval);
    const messageInterval = settings.messageInterval;
    
    let baseDelay = campaign.scheduledAt;
    
    // Adiciona cada contato à fila com intervalo calculado
    for (let i = 0; i < contactData.length; i++) {
      baseDelay = addSeconds(
        baseDelay,
        i > longerIntervalAfter ? greaterInterval : messageInterval
      );
      
      const delay = calculateDelay(
        i,
        baseDelay,
        longerIntervalAfter,
        greaterInterval,
        messageInterval
      );
      
      // Adiciona contato à fila de preparação
      campaignQueue.add(
        "PrepareContact",
        { contactId, campaignId, variables, delay },
        { removeOnComplete: true }
      );
    }
    
    // Atualiza status da campanha
    await campaign.update({ status: "EM_ANDAMENTO" });
  }
}
```

### 4. Distribuição Inteligente dos Envios

Para evitar bloqueios do WhatsApp por detecção de spam, o sistema implementa uma estratégia de distribuição temporal:

1. **Intervalos Básicos**: Configurável através da chave `messageInterval` (em segundos)
2. **Intervalos Maiores**: Após um número de mensagens definido em `longerIntervalAfter`
3. **Duração do Intervalo Maior**: Configurável através da chave `greaterInterval` (em segundos)

Isto cria um padrão de envio mais natural e reduz o risco de bloqueio:

```typescript
function calculateDelay(
  index,
  baseDelay,
  longerIntervalAfter,
  greaterInterval,
  messageInterval
) {
  const diffSeconds = differenceInSeconds(baseDelay, new Date());
  if (index > longerIntervalAfter) {
    return diffSeconds * 1000 + greaterInterval;
  } else {
    return diffSeconds * 1000 + messageInterval;
  }
}
```

### 5. Preparação dos Contatos

Quando chega o momento programado para cada contato, a função `handlePrepareContact` é executada:

```typescript
async function handlePrepareContact(job) {
  const { contactId, campaignId, delay, variables } = job.data;
  const campaign = await getCampaign(campaignId);
  const contact = await getContact(contactId);

  // Seleciona e personaliza a mensagem
  const messages = getCampaignValidMessages(campaign);
  if (messages.length) {
    // Rotação entre as mensagens disponíveis
    const message = getProcessedMessage(
      messages[radomIndex],
      variables,
      contact
    );
    campaignShipping.message = `\u200c ${message}`;
  }

  // Cria ou atualiza o registro de envio
  const [record, created] = await CampaignShipping.findOrCreate({
    where: {
      campaignId: campaignShipping.campaignId,
      contactId: campaignShipping.contactId
    },
    defaults: campaignShipping
  });

  // Agenda o disparo efetivo
  const nextJob = await campaignQueue.add(
    "DispatchCampaign",
    {
      campaignId: campaign.id,
      campaignShippingId: record.id,
      contactListItemId: contactId
    },
    {
      delay
    }
  );
}
```

### 6. Disparo Efetivo das Mensagens

Finalmente, quando chega o momento exato programado para cada mensagem individual, a função `handleDispatchCampaign` realiza o envio:

```typescript
async function handleDispatchCampaign(job) {
  const { campaignShippingId, campaignId } = job.data;
  const campaign = await getCampaign(campaignId);
  const wbot = await GetWhatsappWbot(campaign.whatsapp);

  // Obtém detalhes do envio
  const campaignShipping = await CampaignShipping.findByPk(
    campaignShippingId,
    {
      include: [{ model: ContactListItem, as: "contact" }]
    }
  );

  const chatId = `${campaignShipping.number}@s.whatsapp.net`;
  let body = campaignShipping.message;

  // Envio efetivo da mensagem
  if (campaign.mediaPath) {
    // Com mídia
    const options = await getMessageOptions(
      campaign.mediaName,
      filePath,
      body
    );
    await wbot.sendMessage(chatId, { ...options });
  } else {
    // Apenas texto
    await wbot.sendMessage(chatId, {
      text: body
    });
  }

  // Atualiza status de envio
  await campaignShipping.update({ deliveredAt: moment() });

  // Notifica frontend sobre progresso
  const io = getIO();
  io.to(`company-${campaign.companyId}-mainchannel`).emit(
    `company-${campaign.companyId}-campaign`,
    {
      action: "update",
      record: campaign
    }
  );
}
```

## Diagrama de Sequência do Processo

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ Verificação │     │Processamento│     │ Preparação  │     │   Disparo   │     │  WhatsApp   │
│  Periódica  │     │ de Campanha │     │ de Contatos │     │ de Mensagem │     │  do Cliente │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │                   │                   │
       │ Busca campanhas   │                   │                   │                   │
       │ programadas       │                   │                   │                   │
       │───────────────────┐                   │                   │                   │
       │                   │                   │                   │                   │
       │ Adiciona à fila   │                   │                   │                   │
       │ com delay         │                   │                   │                   │
       │───────────────────┼──────────────────>│                   │                   │
       │                   │                   │                   │                   │
       │                   │                   │ Personaliza msgs  │                   │
       │                   │                   │ para cada contato │                   │
       │                   │                   │───────────────────┐                   │
       │                   │                   │                   │                   │
       │                   │                   │ Agenda disparo    │                   │
       │                   │                   │ com timing exato  │                   │
       │                   │                   │───────────────────┼──────────────────>│
       │                   │                   │                   │                   │
       │                   │                   │                   │ Envia mensagem    │
       │                   │                   │                   │ via API Baileys   │
       │                   │                   │                   │───────────────────┼──>
       │                   │                   │                   │                   │
       │                   │                   │                   │ Atualiza status   │
       │                   │                   │                   │ e notifica UI     │
       │                   │                   │                   │───────────────────┐
┌──────┴──────┐     ┌──────┴──────┐     ┌──────┴──────┐     ┌──────┴──────┐     ┌──────┴──────┐
│ Verificação │     │Processamento│     │ Preparação  │     │   Disparo   │     │  WhatsApp   │
│  Periódica  │     │ de Campanha │     │ de Contatos │     │ de Mensagem │     │  do Cliente │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
```

## Variáveis de Configuração

O sistema utiliza diversas variáveis de configuração para controlar o comportamento do disparo:

| Variável | Descrição | Valor Padrão |
|----------|-----------|--------------|
| `messageInterval` | Intervalo básico entre mensagens (segundos) | 20 |
| `longerIntervalAfter` | Número de mensagens após o qual usar intervalo maior | 20 |
| `greaterInterval` | Duração do intervalo maior (segundos) | 60 |

Estas configurações são carregadas por empresa através da função `getSettings`:

```typescript
async function getSettings(campaign) {
  const settings = await CampaignSetting.findAll({
    where: { companyId: campaign.companyId },
    attributes: ["key", "value"]
  });

  // Valores padrão
  let messageInterval = 20;
  let longerIntervalAfter = 20;
  let greaterInterval = 60;
  let variables = [];

  // Carrega configurações personalizadas
  settings.forEach(setting => {
    if (setting.key === "messageInterval") {
      messageInterval = JSON.parse(setting.value);
    }
    // ... outras configurações
  });

  return {
    messageInterval,
    longerIntervalAfter,
    greaterInterval,
    variables
  };
}
```

## Monitoramento e Notificações em Tempo Real

Durante todo o processo de disparo agendado, o sistema mantém o frontend informado:

1. **Progresso da Campanha**: Atualizações sobre o status geral
2. **Contagem de Mensagens**: Número de mensagens enviadas/pendentes
3. **Notificações de Erros**: Alertas sobre falhas no processo

Isto é realizado através do Socket.IO, permitindo uma interface reativa que mostra o progresso em tempo real.

## Considerações Técnicas

1. **Resiliência**: O sistema usa filas com persistência, garantindo que mesmo em caso de falha do servidor, as campanhas agendadas serão retomadas corretamente
2. **Escalonamento**: A arquitetura permite escalonar horizontalmente, distribuindo a carga de processamento
3. **Intervalos Adaptativos**: Os intervalos entre mensagens podem ser ajustados por empresa, adaptando-se a diferentes volumes de envio

---

Esta documentação detalha o processo completo que ocorre quando uma campanha atinge seu horário programado, desde a detecção inicial até o envio efetivo das mensagens, demonstrando a robustez e flexibilidade do sistema de disparo de campanhas do Esquadrao_BE.
