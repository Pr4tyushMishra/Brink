const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/boards/ba861486-267f-4a94-8d02-4ea009630bad', // using user's board
  method: 'GET',
  headers: {
    // We need a valid token to fetch boards usually, let's bypass by doing a raw DB query instead to see exactly what API returns? Or I can just check the DB one more time to see if any `props` are strings. 
  }
};
