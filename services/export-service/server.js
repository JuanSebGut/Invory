'use strict';

const { createApp } = require('./src/app');

const port = Number(process.env.PORT || 3007);
const app = createApp();

app.listen(port, () => {
  console.log(`Export service listening on port ${port}`);
});
