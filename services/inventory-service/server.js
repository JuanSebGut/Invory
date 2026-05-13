const { createApp } = require('./src/app');

const app = createApp();
const PORT = Number(process.env.PORT || 3005);

app.listen(PORT, () => {
  console.log(`Inventory Service escuchando en puerto ${PORT}`);
});
