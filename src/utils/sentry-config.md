
Adicione o SDK do nó Sentry como uma dependência:
npm install @sentry/node --save

Configurar o SDK
Inicialize o Sentry o mais cedo possível no ciclo de vida do seu aplicativo.
Para inicializar o SDK antes de tudo, crie um arquivo externo chamado .instrument.js/mjs

// Import with `import * as Sentry from "@sentry/node"` if you are using ESM
const Sentry = require("@sentry/node");

Sentry.init({
  dsn: "https://4d82e4a727ebc57890df1e3c4936ed75@o4509407630327808.ingest.us.sentry.io/4509407639633920",

  // Setting this option to true will send default PII data to Sentry.
  // For example, automatic IP address collection on events
  sendDefaultPii: true,
});



Certifique-se de importar na parte superior do seu arquivo. Configure o manipulador de erros depois de todos os controladores e antes de qualquer outro middleware de erro. Essa configuração geralmente é feita no arquivo de ponto de entrada do aplicativo, que geralmente é . Se você estiver executando seu aplicativo no modo ESM ou procurando maneiras alternativas de configurar o Sentry, leia sobre os métodos de instalação em nossos documentos.instrument.js/mjsindex.(js|ts)

// IMPORTANT: Make sure to import `instrument.js` at the top of your file.
// If you're using ECMAScript Modules (ESM) syntax, use `import "./instrument.js";`
require("./instrument.js");

// All other imports below
// Import with `import * as Sentry from "@sentry/node"` if you are using ESM
const Sentry = require("@sentry/node");
const express = require("express");

const app = express();

// All your controllers should live here

app.get("/", function rootHandler(req, res) {
  res.end("Hello world!");
});

// The error handler must be registered before any other error middleware and after all controllers
Sentry.setupExpressErrorHandler(app);

// Optional fallthrough error handler
app.use(function onError(err, req, res, next) {
  // The error id is attached to `res.sentry` to be returned
  // and optionally displayed to the user for support.
  res.statusCode = 500;
  res.end(res.sentry + "\n");
});

app.listen(3000);



Carregar mapas de origem
Carregue automaticamente seus mapas de origem para habilitar rastreamentos de pilha legíveis para erros. Se você preferir configurar manualmente os mapas de origem, siga este guia.

npx @sentry/wizard@latest -i sourcemaps --saas


Verificar
Este snippet contém um erro intencional e pode ser usado como um teste para garantir que tudo esteja funcionando conforme o esperado.

app.get("/debug-sentry", function mainHandler(req, res) {
  throw new Error("My first Sentry error!");
});