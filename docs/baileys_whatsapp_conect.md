# Integração com WhatsApp usando Baileys

## Visão Geral

O Esquadrao_BE utiliza a biblioteca `@whiskeysockets/baileys` para estabelecer conexão com o WhatsApp dos clientes. Este documento explica como o sistema realiza a autenticação, mantém sessões ativas e acessa os contatos do WhatsApp para uso em campanhas de marketing.

## Processo de Autenticação

A autenticação com o WhatsApp ocorre através de um fluxo baseado em QR code, permitindo que o sistema obtenha permissão para enviar mensagens em nome do cliente.

### Fluxo de Autenticação

1. **Iniciação da Sessão**
   - O cliente solicita a conexão de um novo dispositivo WhatsApp
   - O sistema cria um registro no banco de dados com status "PENDING"
   - A função `initWASocket` é chamada para iniciar a conexão

2. **Geração do QR Code**
   - O Baileys gera um QR code único para autenticação
   - O QR code é armazenado no banco de dados e enviado para o frontend via Socket.IO:
   ```typescript
   wsocket.ev.on(
     "connection.update",
     async ({ connection, lastDisconnect, qr }) => {
       if (qr !== undefined) {
         await whatsapp.update({ qrcode: qr, status: "qrcode", retries: 0 });
         io.to(`company-${whatsapp.companyId}-mainchannel`).emit(
           `company-${whatsapp.companyId}-whatsappSession`,
           {
             action: "update",
             session: whatsapp
           }
         );
       }
   ```

3. **Escaneamento pelo Cliente**
   - O cliente visualiza o QR code na interface web
   - Ao escanear com o aplicativo WhatsApp do smartphone, a autenticação é concluída
   - O sistema detecta a conclusão da autenticação e atualiza o status para "CONNECTED"

4. **Confirmação de Conexão**
   - Quando a conexão é estabelecida com sucesso, o sistema atualiza o status:
   ```typescript
   if (connection === "open") {
     await whatsapp.update({
       status: "CONNECTED",
       qrcode: "",
       retries: 0
     });
   }
   ```

## Persistência de Sessão

O sistema mantém a sessão do WhatsApp ativa para evitar a necessidade de reautenticação frequente.

### Gerenciamento de Estado

1. **Armazenamento de Credenciais**
   - As credenciais de autenticação são gerenciadas pelo helper `authState`
   - Os dados são salvos no banco de dados associados ao registro do WhatsApp

2. **Reconexão Automática**
   - Em caso de desconexão, o sistema tenta reconectar automaticamente
   - Se a sessão for invalidada, um novo QR code é gerado para reautenticação

3. **Tratamento de Desconexões**
   - O sistema monitora o estado da conexão e trata diferentes cenários:
   ```typescript
   if (connection === "close") {
     if ((lastDisconnect?.error as Boom)?.output?.statusCode === 403) {
       // Sessão inválida, precisando de reautenticação
       await whatsapp.update({ status: "PENDING", session: "" });
     }
     // Tentativa de reconexão
     setTimeout(
       () => StartWhatsAppSession(whatsapp, whatsapp.companyId),
       2000
     );
   }
   ```

## Acesso e Sincronização de Contatos

Após a autenticação, o sistema pode acessar e sincronizar os contatos do WhatsApp do cliente.

### Processo de Sincronização

1. **Obtenção de Contatos**
   - Os contatos são obtidos através dos eventos de sincronização do Baileys
   - A biblioteca fornece os dados de contatos no formato padrão do WhatsApp

2. **Armazenamento no Banco de Dados**
   - Os contatos são processados e armazenados usando o serviço `CreateOrUpdateBaileysService`:
   ```typescript
   // Obtém contatos existentes ou cria array vazio
   const getContacts = baileysExists.contacts
     ? JSON.parse(JSON.stringify(baileysExists.contacts))
     : [];
   
   // Adiciona novos contatos
   if (contacts && isArray(getContacts)) {
     getContacts.push(...contacts);
     getContacts.sort();
     getContacts.filter((v, i, a) => a.indexOf(v) === i);
   }
   
   // Atualiza no banco de dados
   await baileysExists.update({
     contacts: JSON.stringify(getContacts)
   });
   ```

3. **Disponibilização para Campanhas**
   - Os contatos sincronizados ficam disponíveis para seleção em campanhas
   - O sistema permite criar listas de contatos para campanhas específicas

## Arquitetura da Integração

A integração com o WhatsApp é estruturada de forma modular e resiliente:

### Componentes Principais

1. **Gerenciador de Sessões (wbot.ts)**
   - Mantém registro de todas as sessões ativas
   - Gerencia conexões, desconexões e reconexões

2. **Persistência de Estado (authState.ts)**
   - Responsável pelo armazenamento e recuperação de credenciais
   - Permite manter sessões entre reinicializações do servidor

3. **Sincronizador de Contatos (CreateOrUpdateBaileysService)**
   - Sincroniza e mantém a lista de contatos atualizada
   - Elimina duplicações e organiza os dados

4. **Notificação via Socket.IO**
   - Mantém o frontend informado sobre o status da conexão
   - Transmite o QR code para autenticação

## Gerenciamento de Múltiplas Conexões

O sistema suporta múltiplas conexões de WhatsApp simultâneas para diferentes empresas:

1. **Isolamento de Sessões**
   - Cada conexão é isolada e gerenciada independentemente
   - Empresas diferentes podem usar números diferentes simultaneamente

2. **Recuperação de Sessão**
   - Em caso de reinicialização do servidor, as sessões são recuperadas automaticamente
   - Minimiza a necessidade de reautenticação por parte dos clientes

## Uso dos Contatos em Campanhas

Uma vez sincronizados, os contatos do WhatsApp podem ser utilizados em campanhas:

1. **Seleção de Contatos**
   - O cliente pode selecionar contatos para inclusão em listas de distribuição
   - É possível filtrar contatos por diversos critérios

2. **Validação de Números**
   - O sistema valida se os números possuem WhatsApp ativo
   - Isso melhora a eficiência das campanhas, evitando tentativas de envio para números inválidos

3. **Personalização de Mensagens**
   - As mensagens podem ser personalizadas com dados dos contatos
   - Suporta uso de variáveis como {nome}, {email}, etc.

## Considerações de Segurança e Limitações

1. **Uso Não-Oficial**
   - A integração usa uma API não oficial do WhatsApp
   - Há risco de limitações ou bloqueio por parte do WhatsApp

2. **Prevenção de Banimento**
   - O sistema implementa intervalos entre mensagens
   - Controla a taxa de envio para evitar detecção como spam

3. **Políticas do WhatsApp**
   - Os usuários devem estar cientes das políticas do WhatsApp sobre automação
   - Recomenda-se uso para comunicação legítima e não para spam

## Conclusão

A integração com o WhatsApp através do Baileys permite que o Esquadrao_BE ofereça uma solução completa para automação de marketing via WhatsApp. A implementação é robusta, com foco na persistência das sessões e na sincronização eficiente de contatos, proporcionando uma experiência fluida tanto para os administradores das campanhas quanto para os destinatários das mensagens.
