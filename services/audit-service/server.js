const { createApp } = require('./src/app');

async function start() {
  const app = createApp();
  await app.ready;

  const port = Number(process.env.PORT || 3006);
  app.listen(port, () => {
    console.log(`Audit Service escuchando en puerto ${port}`);
  });
}

start().catch((error) => {
  console.error('No fue posible iniciar Audit Service', error);
  process.exit(1);
});
