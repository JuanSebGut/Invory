'use strict';

require('dotenv').config();

const { createApp } = require('./src/app');

const port = Number(process.env.PORT || 3000);

// Las URLs de servicios se leen de process.env dentro de createServicesConfig,
// asÃ­ que basta con instanciar la app sin argumentos para producciÃ³n.
const app = createApp();

app.listen(port, () => {
  console.log(`ðŸŒ API Gateway INVORY escuchando en el puerto ${port}`);
});
