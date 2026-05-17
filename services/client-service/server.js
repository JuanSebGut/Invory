const { createApp } = require('./app');

const app = createApp();
const PORT = Number(process.env.PORT || 3009);

app.listen(PORT, () => {
  console.log(`Client Service escuchando en puerto ${PORT}`);
});
