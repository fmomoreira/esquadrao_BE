# Priorização de Processos no Sistema de Campanhas

## Visão Geral

O Esquadrao_BE implementa um sofisticado sistema de priorização para gerenciar operações paralelas relacionadas a campanhas. Este documento explica como o sistema gerencia a sincronização de contatos, o agendamento de campanhas e o disparo de mensagens, detalhando as prioridades e o fluxo de processamento simultâneo.

## Arquitetura de Processamento Paralelo

O sistema utiliza filas baseadas em Redis (via biblioteca Bull) para permitir o processamento paralelo de diferentes operações, garantindo eficiência e escalabilidade.

### Processos Principais

O sistema gerencia simultaneamente os seguintes processos:

1. **Sincronização de Contatos**: Importação e validação de contatos do WhatsApp
2. **Verificação de Campanhas Agendadas**: Monitoramento periódico de campanhas programadas
3. **Processamento de Campanhas**: Preparação de campanhas para envio
4. **Disparo de Mensagens**: Envio efetivo das mensagens via API do WhatsApp

## Modelo de Execução Paralela

Ao contrário de sistemas sequenciais que precisam finalizar uma tarefa antes de iniciar outra, o Esquadrao_BE implementa um modelo de execução paralela com controles específicos de concorrência:

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Sincronização  │     │   Verificação   │     │  Processamento  │
│   de Contatos   │     │  de Campanhas   │     │  de Campanhas   │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Sistema de Filas Redis                      │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                                 │
                                 ▼
                       ┌───────────────────┐
                       │      Disparo      │
                       │   de Mensagens    │
                       │ (Concorrência: 1) │
                       └───────────────────┘
```

## Priorização de Operações

O sistema estabelece as seguintes prioridades entre as operações:

### 1. Verificação Periódica de Campanhas Agendadas

```typescript
campaignQueue.add(
  "VerifyCampaigns",
  {},
  {
    repeat: { cron: "*/20 * * * * *", key: "verify-campaing" },
    removeOnComplete: true
  }
);
```

- Executa a cada 20 segundos
- Verifica campanhas programadas para a próxima hora
- Operação de baixo impacto que não interfere em outros processos

### 2. Sincronização de Contatos

- Processo contínuo que ocorre quando:
  - Uma nova conexão WhatsApp é estabelecida
  - Novos contatos são adicionados ao WhatsApp do cliente
- Executa em paralelo com outras operações
- Dados são armazenados no banco para uso futuro em campanhas

### 3. Processamento de Campanhas

```typescript
campaignQueue.process("ProcessCampaign", handleProcessCampaign);
```

- Ativado quando uma campanha atinge seu horário programado
- Calcula atrasos para evitar bloqueio por spam
- Alimenta a fila de preparação de contatos

### 4. Preparação de Contatos

```typescript
campaignQueue.process("PrepareContact", handlePrepareContact);
```

- Personaliza mensagens para cada contato
- Cria registros de envio no banco de dados
- Adiciona à fila de disparo com timing calculado

### 5. Disparo de Mensagens (Prioridade Máxima)

```typescript
campaignQueue.process("DispatchCampaign", 1, handleDispatchCampaign);
```

- **Concorrência limitada a 1** para evitar bloqueios do WhatsApp
- Representa o "gargalo controlado" do sistema
- Esta limitação garante que, independentemente de quantas campanhas estejam sendo processadas em paralelo, apenas uma mensagem será enviada de cada vez

## Gerenciamento de Concorrência

O sistema implementa controles específicos de concorrência para garantir operação otimizada:

1. **Limitação no Ponto Crítico**:
   - O envio de mensagens é limitado a 1 concorrência
   - Este é o único ponto do sistema com limite explícito de concorrência

2. **Paralelismo nos Estágios Anteriores**:
   - Verificação, processamento e preparação ocorrem em paralelo
   - Permitem escalonamento horizontal quando necessário

3. **Controle Temporal**:
   - Intervalos calculados entre mensagens (20 segundos padrão)
   - Intervalos maiores após determinado número de mensagens (60 segundos)

## Funcionamento em Cenários Práticos

### Cenário 1: Criação de Nova Campanha Durante Execução de Outra

Quando uma nova campanha é criada enquanto outra está em execução:

1. A sincronização de contatos da nova campanha ocorre em paralelo
2. A campanha em execução continua seu processamento normalmente
3. O sistema de filas garante que apenas uma mensagem seja enviada por vez
4. A prioridade é determinada pelo momento de entrada na fila de disparo

### Cenário 2: Múltiplas Campanhas Atingindo Horário de Envio Simultaneamente

Quando duas ou mais campanhas atingem seu horário de envio ao mesmo tempo:

1. Todas são processadas em paralelo nos estágios iniciais
2. Cada contato recebe seu timestamp calculado de envio
3. A fila de disparo processa as mensagens em ordem cronológica
4. A concorrência limitada (1) garante envio ordenado no estágio final

## Benefícios do Modelo de Priorização

Este modelo de execução traz vários benefícios:

1. **Eficiência**: Permite utilização máxima dos recursos do sistema
2. **Responsividade**: Novas campanhas podem ser criadas a qualquer momento
3. **Proteção**: Evita bloqueios do WhatsApp por envio excessivo
4. **Escalabilidade**: Permite distribuição de carga entre múltiplas instâncias

## Configurações Relevantes

O comportamento do sistema pode ser ajustado através de configurações por empresa:

| Configuração | Descrição | Valor Padrão |
|--------------|-----------|--------------|
| `messageInterval` | Intervalo entre mensagens (segundos) | 20 |
| `longerIntervalAfter` | Após quantas mensagens usar intervalo maior | 20 |
| `greaterInterval` | Intervalo maior (segundos) | 60 |

## Considerações Técnicas

- **Redis como Backend**: Garante persistência e distribuição das filas
- **Tratamento de Falhas**: Captura de exceções com Sentry
- **Monitoramento**: Logs detalhados para diagnóstico

---

Em resumo, o sistema de priorização do Esquadrao_BE permite operações paralelas com controle específico no ponto crítico (envio de mensagens), garantindo que múltiplos processos possam ocorrer simultaneamente sem comprometer a estabilidade da conexão com o WhatsApp ou gerar bloqueios por uso indevido.
