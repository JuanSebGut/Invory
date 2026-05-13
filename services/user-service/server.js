const { createApp } = require('./src/app');

const app = createApp();
const PORT = Number(process.env.PORT || 3004);

app.listen(PORT, () => {
  console.log(`User Service escuchando en puerto ${PORT}`);
});
