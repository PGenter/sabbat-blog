import { defineConfig } from 'vite'
import fs from 'fs'

export default defineConfig(({ command }) => {
  if (command === 'serve') {
    return {
      server: {
        port: 5173,
        open: false,
        host: true,
        ...(fs.existsSync('./cert/localhost-key.pem') &&
        fs.existsSync('./cert/localhost.pem')
          ? {
              https: {
                key: fs.readFileSync('./cert/localhost-key.pem'),
                cert: fs.readFileSync('./cert/localhost.pem'),
              },
            }
          : {}),
      },
    }
  }

  return {}
})