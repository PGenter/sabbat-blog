import { defineConfig } from 'vite'
import { resolve } from 'path'
import fs from 'fs'

export default defineConfig(({ command }) => ({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        map: resolve(__dirname, 'map.html'),
        resetpassword: resolve(__dirname, 'reset-password.html'),
        requestreset: resolve(__dirname, 'reset-request.html'),
      },
    },
  },

  ...(command === 'serve'
    ? {
        server: {
          port: 5173,
          open: false,
          host: true,
          https: {
            key: fs.readFileSync('./cert/localhost-key.pem'),
            cert: fs.readFileSync('./cert/localhost.pem'),
          },
        },
      }
    : {}),
}))