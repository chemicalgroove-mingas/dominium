require('dotenv').config();

const { criarApp } = require('./src/app');

const app = criarApp();
const PORT = process.env.PORT || 5001;

app.listen(PORT, () => {
  console.log(`DOMINIUM backend rodando em http://localhost:${PORT}`);
});
