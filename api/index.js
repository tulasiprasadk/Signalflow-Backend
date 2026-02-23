// Vercel serverless entry — requires the Nest app to be built into `dist/`
const { handler } = require('../dist/src/serverless');
module.exports = handler;
