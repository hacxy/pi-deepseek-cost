import { defineConfig } from '@rspack/cli'
import ForkTsCheckerWebpackPlugin from 'fork-ts-checker-webpack-plugin'

export default defineConfig({
  experiments: {
    outputModule: true
  },
  plugins: [
    new ForkTsCheckerWebpackPlugin({
      typescript: {
        mode: 'write-dts'
      }
    })
  ],
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: [/node_modules/],
        loader: 'builtin:swc-loader',
        options: {
          jsc: {
            parser: {
              syntax: 'typescript',
            },
          },
        },
        type: 'javascript/auto',
      }
    ]
  },
  output: {
    clean: true,
    filename: 'index.js',
    library: {
      type: 'module'
    }
  },
  entry: {
    main: './src/index.ts'
  }
})
