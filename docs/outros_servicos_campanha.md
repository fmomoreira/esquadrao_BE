# Recursos Adicionais do Sistema de Campanhas

## Visão Geral

Além do fluxo principal de agendamento e disparo de campanhas, o Esquadrao_BE implementa diversos recursos adicionais que ampliam as funcionalidades e a flexibilidade do sistema. Este documento explora componentes e serviços importantes que complementam o sistema de campanhas.

## Suporte a Mensagens com Mídia

O sistema oferece suporte completo para o envio de diferentes tipos de mídia em campanhas, permitindo uma comunicação mais rica e engajadora.

### Tipos de Mídia Suportados

1. **Imagens**
   - Formatos comuns como JPG, PNG, GIF
   - Envio com legendas personalizadas

2. **Vídeos**
   - Suporte a formatos como MP4
   - Possibilidade de incluir legendas

3. **Áudio**
   - Mensagens de voz (PTT)
   - Arquivos de áudio (MP3, OGG)
   - Conversão automática para formatos compatíveis com WhatsApp

4. **Documentos**
   - PDF, DOC, XLS e outros formatos
   - Preservação do nome original do arquivo

### Processamento de Mídia

O sistema utiliza FFmpeg para o processamento de áudio, garantindo compatibilidade com o WhatsApp:

```typescript
const processAudio = async (audio: string): Promise<string> => {
  const outputAudio = `${publicFolder}/${new Date().getTime()}.mp3`;
  return new Promise((resolve, reject) => {
    exec(
      `${ffmpegPath.path} -i ${audio} -vn -ab 128k -ar 44100 -f ipod ${outputAudio} -y`,
      (error, _stdout, _stderr) => {
        if (error) reject(error);
        fs.unlinkSync(audio);
        resolve(outputAudio);
      }
    );
  });
};
```

O serviço `getMessageOptions` detecta automaticamente o tipo de mídia e prepara as opções corretas para envio:

```typescript
export const getMessageOptions = async (
  fileName: string,
  pathMedia: string,
  body?: string
): Promise<any> => {
  const mimeType = mime.lookup(pathMedia);
  const typeMessage = mimeType.split("/")[0];
  
  // Prepara opções específicas com base no tipo de mídia
  if (typeMessage === "video") {
    options = {
      video: fs.readFileSync(pathMedia),
      caption: body ? body : '',
      fileName: fileName
    };
  } 
  // ... outras opções para diferentes tipos de mídia
};
```

## Sistema de Mensagens de Confirmação

O Esquadrao_BE implementa um sistema de campanhas bidirecionais através do recurso de mensagens de confirmação.

### Funcionamento

1. **Configuração**
   - A campanha é configurada com a opção `confirmation` habilitada
   - Até cinco mensagens diferentes de confirmação podem ser cadastradas
   - O sistema escolhe aleatoriamente entre as mensagens configuradas

2. **Fluxo de Envio com Confirmação**
   ```typescript
   if (campaign.confirmation && campaignShipping.confirmation === null) {
     // Envia mensagem de confirmação em vez da mensagem principal
     body = campaignShipping.confirmationMessage;
     await wbot.sendMessage(chatId, {
       text: body
     });
     await campaignShipping.update({ confirmationRequestedAt: moment() });
   }
   ```

3. **Rastreamento de Respostas**
   - O sistema registra quando uma mensagem de confirmação foi enviada
   - As respostas são capturadas e processadas pelo listener de mensagens
   - Permite automações baseadas na resposta do cliente

### Casos de Uso

- **Confirmação de Presença**: Envio de convites com pedido de confirmação
- **Pesquisas Simples**: Coleta de feedback rápido de clientes
- **Opt-in/Opt-out**: Confirmação de interesse em continuar recebendo mensagens

## Suporte a Listas de Arquivos

O sistema permite anexar múltiplos arquivos a uma campanha através do recurso de listas de arquivos.

```typescript
if (!isNil(campaign.fileListId)) {
  try {
    const publicFolder = path.resolve(__dirname, "..", "public");
    const files = await ShowFileService(
      campaign.fileListId,
      campaign.companyId
    );
    const folder = path.resolve(publicFolder, "fileList", String(files.id));
    for (const [index, file] of files.options.entries()) {
      const options = await getMessageOptions(
        file.path,
        path.resolve(folder, file.path),
        file.name
      );
      await wbot.sendMessage(chatId, { ...options });
    }
  } catch (error) {
    logger.info(error);
  }
}
```

Este recurso é útil para:
- Catálogos de produtos
- Materiais de treinamento
- Documentação multipartes

## Personalização Avançada de Mensagens

O sistema oferece recursos robustos para personalização de mensagens.

### Variáveis Dinâmicas

- **Variáveis Básicas**: Nome, email, número do contato
- **Variáveis Customizadas**: Definidas nas configurações da empresa

```typescript
function getProcessedMessage(msg: string, variables: any[], contact: any) {
  let finalMessage = msg;

  if (finalMessage.includes("{nome}")) {
    finalMessage = finalMessage.replace(/{nome}/g, contact.name);
  }

  // Outras substituições de variáveis
  // ...

  return finalMessage;
}
```

### Rotação de Mensagens

Para evitar detecção como spam, o sistema implementa rotação entre múltiplas versões da mensagem:

```typescript
const messages = getCampaignValidMessages(campaign);
if (messages.length) {
  const radomIndex = ultima_msg;
  ultima_msg++;
  if (ultima_msg >= messages.length) {
    ultima_msg = 0;
  }
  const message = getProcessedMessage(
    messages[radomIndex],
    variables,
    contact
  );
}
```

Isto permite:
- Maior variação nas mensagens enviadas
- Redução do risco de bloqueio
- Testes A/B de diferentes versões de mensagens

## Verificação de Finalização de Campanhas

O sistema verifica automaticamente se uma campanha foi concluída após cada operação de envio:

```typescript
async function verifyAndFinalizeCampaign(campaign) {
  const { contacts } = campaign.contactList;
  const count = campaign.shipping.length;
  
  if (count >= contacts.length) {
    await campaign.update({ status: "FINALIZADA", completedAt: moment() });
  }
}
```

Este mecanismo:
- Atualiza o status da campanha para "FINALIZADA"
- Registra o horário de conclusão
- Notifica o frontend sobre a conclusão

## Proteções e Limites do Sistema

O sistema implementa diversas proteções para garantir a segurança e evitar abusos:

### Validação de Números WhatsApp

```typescript
// Filtra apenas contatos com WhatsApp válido
{
  model: ContactListItem,
  as: "contacts",
  attributes: ["id", "name", "number", "email", "isWhatsappValid"],
  where: { isWhatsappValid: true }
}
```

### Limitadores de Taxa

- Configurações por empresa para intervalos entre mensagens
- Aumento progressivo do intervalo após um número configurado de mensagens

### Caractere Unicode Invisível

Para reduzir a detecção de mensagens automatizadas, o sistema adiciona um caractere Unicode invisível a cada mensagem:

```typescript
campaignShipping.message = `\u200c ${message}`;
```

### Verificação de Status da Conexão

Antes do envio, o sistema verifica se a conexão com o WhatsApp está ativa:

```typescript
if (!wbot) {
  logger.error(
    `campaignQueue -> DispatchCampaign -> error: wbot not found`
  );
  return;
}
```

## Integração com Sistema de Tickets

O Esquadrao_BE integra o sistema de campanhas com o sistema de tickets de atendimento, permitindo:

1. **Continuidade de Conversas**: Respostas a campanhas podem gerar tickets para atendimento
2. **Histórico Unificado**: O histórico de campanhas enviadas fica disponível no contexto do atendimento
3. **Acompanhamento de Interações**: Todas as interações com o contato são registradas

Esta integração possibilita um atendimento mais contextualizado e eficiente após o disparo de campanhas.

## Considerações Técnicas Adicionais

### Concorrência e Escalonamento

- O envio de campanhas é limitado a uma mensagem por vez para evitar bloqueios
- A arquitetura permite distribuir o processamento entre múltiplas instâncias
- O uso de Redis como backend para filas garante persistência e resiliência

### Monitoramento e Logs

- Eventos importantes são registrados no Sentry para rastreamento de erros
- Logs detalhados auxiliam na identificação e resolução de problemas

```typescript
logger.info(
  `Disparo de campanha solicitado: Campanha=${campaignId};Registro=${campaignShippingId}`
);
```

### Timeout e Retry

O sistema implementa mecanismos de timeout e retry para garantir a entrega das mensagens mesmo em condições adversas:

- Tentativas automáticas em caso de falhas temporárias
- Registro detalhado de erros para análise posterior

---

Estes recursos adicionais tornam o sistema de campanhas do Esquadrao_BE uma solução completa e robusta para automação de marketing via WhatsApp, oferecendo flexibilidade, personalização e confiabilidade para as empresas usuárias da plataforma.
