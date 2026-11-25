// Local development entry point:  npm start  →  http://localhost:5000
const env = require('./config/env');
const app = require('./app');

app.listen(env.port, () => {
  console.log(`Bakery app running at http://localhost:${env.port}`);
});
