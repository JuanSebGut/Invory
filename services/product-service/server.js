const { createApp } = require('./src/app');

const app = createApp();
const PORT = Number(process.env.PORT || 3001);

app.listen(PORT, () => {
  console.log(`Product Service escuchando en puerto ${PORT}`);
});
