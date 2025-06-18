# Sistema de Filas no Esquadrao_BE

## Visão Geral

O Esquadrao_BE implementa um sistema robusto de filas usando a biblioteca Bull, baseada em Redis, para gerenciar operações assíncronas e garantir escalabilidade. Este documento explica como as diferentes filas funcionam, suas prioridades de execução e como o sistema gerencia o processamento de tarefas.

## Estrutura das Filas

O sistema utiliza múltiplas filas para separar diferentes tipos de operações, cada uma com seu próprio propósito e configurações:

### 1. Filas Principais

```typescript
// Monitoramento de usuários
export const userMonitor = new BullQueue("UserMonitor", connection);

// Monitoramento de filas de atendimento
export const queueMonitor = new BullQueue("QueueMonitor", connection);

// Fila de mensagens
export const messageQueue = new BullQueue("MessageQueue", connection, {
  limiter: {
    max: limiterMax as number,
    duration: limiterDuration as number
  }
});

// Monitoramento de agendamentos
export const scheduleMonitor = new BullQueue("ScheduleMonitor", connection);

// Envio de mensagens agendadas
export const sendScheduledMessages = new BullQueue(
  "SendSacheduledMessages",
  connection
);

// Fila de campanhas
export const campaignQueue = new BullQueue("CampaignQueue", connection);
```

## Prioridade de Execução

As filas no Esquadrao_BE seguem uma hierarquia de prioridades baseada na natureza das tarefas:

### Prioridade Alta (Processamento Imediato)

1. **messageQueue (Mensagens Diretas)**
   - Processamento de mensagens individuais enviadas diretamente
   - Configurada com limitador para evitar bloqueio do WhatsApp:
   ```typescript
   limiter: {
     max: limiterMax, // Geralmente 1
     duration: limiterDuration // Geralmente 3000ms
   }
   ```

2. **sendScheduledMessages (Mensagens Agendadas Imediatas)**
   - Envia mensagens agendadas que já atingiram seu horário programado
   - Executada imediatamente quando disparada por scheduleMonitor

### Prioridade Média (Processamento Cíclico)

3. **campaignQueue (Processamento de Campanhas)**
   - Processa etapas de campanhas de marketing
   - Subdividida em diferentes processadores:
     - `VerifyCampaigns`: Verifica a cada 20 segundos por novas campanhas
     - `ProcessCampaign`: Processa campanhas prontas para envio
     - `PrepareContact`: Prepara contatos para receber mensagens
     - `DispatchCampaign`: Realiza o envio efetivo (limitado a 1 concorrência)

4. **scheduleMonitor (Verificação de Agendamentos)**
   - Verifica a cada 5 segundos por mensagens agendadas
   - Alimenta a fila sendScheduledMessages quando encontra mensagens prontas

### Prioridade Baixa (Monitoramento e Manutenção)

5. **userMonitor (Status de Usuários)**
   - Verifica status de login de usuários a cada minuto
   - Atualiza status para offline após 5 minutos de inatividade

6. **queueMonitor (Monitoramento de Atendimentos)**
   - Verifica a cada 20 segundos por atendimentos perdidos
   - Redistribui tickets se necessário

## Configurações de Execução Periódica

As filas de monitoramento são configuradas para execução periódica usando expressões cron:

```typescript
// Verificação de agendamentos a cada 5 segundos
scheduleMonitor.add(
  "Verify",
  {},
  {
    repeat: { cron: "*/5 * * * * *", key: "verify" },
    removeOnComplete: true
  }
);

// Verificação de campanhas a cada 20 segundos
campaignQueue.add(
  "VerifyCampaigns",
  {},
  {
    repeat: { cron: "*/20 * * * * *", key: "verify-campaing" },
    removeOnComplete: true
  }
);

// Verificação de status de login a cada minuto
userMonitor.add(
  "VerifyLoginStatus",
  {},
  {
    repeat: { cron: "* * * * *", key: "verify-login" },
    removeOnComplete: true
  }
);

// Verificação de status de filas a cada 20 segundos
queueMonitor.add(
  "VerifyQueueStatus",
  {},
  {
    repeat: { cron: "*/20 * * * * *" },
    removeOnComplete: true
  }
);
```

## Controle de Concorrência

O sistema implementa controle de concorrência em filas críticas para evitar sobrecarga:

1. **Disparo de Campanhas**
   ```typescript
   // Limita a 1 envio simultâneo para evitar bloqueios
   campaignQueue.process("DispatchCampaign", 1, handleDispatchCampaign);
   ```

2. **Mensagens Diretas**
   ```typescript
   // Limita a quantidade de mensagens por intervalo de tempo
   limiter: {
     max: limiterMax, // Número máximo de jobs
     duration: limiterDuration // Intervalo em ms
   }
   ```

## Fluxo de Processamento de Filas

### Fila de Campanhas

A fila de campanhas segue um fluxo específico de processamento:

1. **Verificação (`VerifyCampaigns`)**
   - Busca campanhas programadas para a próxima hora
   - Adiciona à fila de processamento com delay apropriado

2. **Processamento (`ProcessCampaign`)**
   - Carrega detalhes da campanha e contatos
   - Calcula intervalos entre mensagens
   - Adiciona cada contato à fila de preparação

3. **Preparação (`PrepareContact`)**
   - Personaliza mensagens para cada contato
   - Cria registros de envio no banco de dados
   - Adiciona à fila de disparo com timing calculado

4. **Disparo (`DispatchCampaign`)**
   - Realiza o envio efetivo das mensagens
   - Atualiza status de envio
   - Notifica frontend sobre progresso

### Fila de Mensagens Agendadas

1. **Verificação (`scheduleMonitor`)**
   - Busca agendamentos que atingiram o horário programado
   - Adiciona à fila de envio de mensagens agendadas

2. **Envio (`sendScheduledMessages`)**
   - Processa mensagens agendadas
   - Realiza o envio efetivo

## Mecanismos de Resiliência

O sistema implementa várias estratégias para garantir a resiliência das filas:

1. **Persistência em Redis**
   - Os jobs são persistidos em Redis, sobrevivendo a reinicializações do servidor

2. **Remoção Automática**
   - Jobs completados são removidos automaticamente (`removeOnComplete: true`)

3. **Tratamento de Erros**
   - Exceções são capturadas e registradas usando Sentry
   ```typescript
   try {
     // processamento do job
   } catch (err: any) {
     Sentry.captureException(err);
     logger.error(`campaignQueue -> PrepareContact -> error: ${err.message}`);
   }
   ```

## Monitoramento e Depuração

O sistema oferece ferramentas para monitoramento das filas:

1. **Logging**
   - Eventos importantes são registrados usando o logger do sistema
   - Erros são registrados tanto localmente quanto no Sentry

2. **Notificações em Tempo Real**
   - O progresso das filas é comunicado ao frontend via Socket.IO
   - Permite visualização em tempo real do status de campanhas

## Considerações sobre Escalabilidade

O sistema foi projetado para escalar horizontalmente:

1. **Separação de Filas**
   - Diferentes tipos de tarefas em filas separadas
   - Permite escalar cada componente independentemente

2. **Controle de Taxa**
   - Limitadores configuram quantas operações podem ocorrer simultaneamente
   - Ajustável através de variáveis de ambiente:
   ```
   REDIS_OPT_LIMITER_MAX=1
   REDIS_OPT_LIMITER_DURATION=3000
   ```

3. **Redis como Backend**
   - Permite distribuir o processamento entre múltiplas instâncias
   - Configurável através da variável `REDIS_URI`

## Interação com Frontend

A comunicação entre as filas e o frontend é realizada via Socket.IO:

```typescript
const io = getIO();
io.to(`company-${campaign.companyId}-mainchannel`).emit(
  `company-${campaign.companyId}-campaign`,
  {
    action: "update",
    record: campaign
  }
);
```

Isto permite que a interface do usuário seja atualizada em tempo real com o progresso das campanhas e outras operações assíncronas.

---

Este sistema de filas proporciona escalabilidade, confiabilidade e processamento eficiente das operações assíncronas no Esquadrao_BE, especialmente para o envio de mensagens e gerenciamento de campanhas de marketing via WhatsApp.
