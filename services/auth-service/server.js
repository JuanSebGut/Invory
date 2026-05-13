const { createApp } = require('./src/app');

const app = createApp();
const PORT = process.env.PORT || 3002;

app.listen(PORT, () => {
  console.log(`ðŸ” Auth Service ejecutÃ¡ndose en puerto ${PORT}`);
});
