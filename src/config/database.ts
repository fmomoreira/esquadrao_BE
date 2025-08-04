// Variável que controla o ambiente de desenvolvimento
const development = false;



// Configurações para ambiente de desenvolvimento

const devConfig = {
  define: {
    charset: "utf8mb4",
    collate: "utf8mb4_bin"
  },
  dialect: "postgres",
  timezone: "-03:00",
  host: "localhost",
  port: 5432,
  database: "zaplg",
  username: "postgres",
  //password: "senha_segura",
  password: "Tech@Esquadrao2025**@",
  logging: console.log,
  pool: {
    max: 150,
    min: 0,
    idle: 3000
  },
  retry:{
    max: 3
  }
};

// Configurações para ambiente de produção (as atuais)
const prodConfig = {
  define: {
    charset: "utf8mb4",
    collate: "utf8mb4_bin"
  },
  dialect: "postgres",
  timezone: "-03:00",
  host: "localhost",
  port: 5432,
  database: "eupromovo",
  username: "postgre",
  password: "EuPromovoTech2025@@BD",
  logging: process.env.DB_DEBUG === "true",
  pool: {
    max: 150,
    min: 0,
    idle: 3000
  },
  retry:{
    max: 3
  }
};

// Exporta as configurações com base no ambiente usando operador ternário
module.exports = development ? devConfig : prodConfig;

