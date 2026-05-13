const { createApp } = require('./src/app');

const app = createApp();
const PORT = process.env.PORT || 3003;

app.listen(PORT, () => {
  console.log(`Category Service ejecutandose en puerto ${PORT}`);
});