/**
 * Copyright IBM Corp. 2024
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use strict';

import path from 'path';
import autoprefixer from 'autoprefixer';
import cssnano from 'cssnano';
import { fileURLToPath } from 'url';
import postcss from 'postcss';
import alias from '@rollup/plugin-alias';
import { rollup } from 'rollup';
import nodeResolve from '@rollup/plugin-node-resolve';
import { babel } from '@rollup/plugin-babel';
import commonjs from '@rollup/plugin-commonjs';
import minifyHTML from 'rollup-plugin-minify-html-literals';
import summary from 'rollup-plugin-summary';
import typescript from '@rollup/plugin-typescript';
import esbuild from 'rollup-plugin-esbuild'
import {resourceJSPaths} from '../tools/babel-plugin-resource-js-paths.js';
import litSCSS from '../tools/rollup-plugin-lit-scss.js';
import { globby } from 'globby';
import carbonIcons from '../tools/rollup-plugin-icons.js';
import json from '@rollup/plugin-json';

import * as packageJson from '../package.json' assert { type: "json" };

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function build() {
  const inputs = await globby([ 'src/**/*.ts', '!src/**/*.stories.ts', '!src/**/*.d.ts']);

  const entryPoint = {
    filepath: inputs,
    rootDir: 'src',
    outputDirectory: path.resolve(__dirname, '..'),
  };

  //grab all the icon files from @carbon/icons as input
  const iconInputs = await globby(['node_modules/@carbon/icons/lib/**/*.js', '!**/index.js']);

  const iconsEntrypoint = {
    outputDirectory: path.resolve(__dirname, '..'),
  };

  const formats = [
    {
      type: 'esm',
      directory: 'es',
    },
    {
      type: 'commonjs',
      directory: 'lib',
    },
  ];

  for (const format of formats) {
    const outputDirectory = path.join(
      entryPoint.outputDirectory,
      format.directory
    );

    const cwcInputConfig = getRollupConfig(
      inputs,
      entryPoint.rootDir,
      outputDirectory
    );
    const cwcBundle = await rollup(cwcInputConfig);

    await cwcBundle.write({
      dir: outputDirectory,
      format: format.type,
      preserveModules: true,
      preserveModulesRoot: 'src',
      banner,
      exports: 'named',
      sourcemap: true
    });

    const iconsInputConfig = getIconRollupConfig(
      iconInputs
    );

    const iconsBundle = await rollup(iconsInputConfig);

    const iconsOutputDir = path.join(
      iconsEntrypoint.outputDirectory,
      format.directory, 'icons'
    );

    // Build @carbon/icons
    for (const format of formats) {
      await iconsBundle.write({
        dir: iconsOutputDir,
        format: format.type,
        preserveModules: true,
        banner,
        exports: 'named',
      });
    }
  }
}

const banner = `/**
 * Copyright IBM Corp. 2024
 *
 * This source code is licensed under the Apache-2.0 license found in the
 * LICENSE file in the root directory of this source tree.
 */
`;

function getRollupConfig(input, rootDir, outDir) {
  return {
    input,
    // Mark dependencies listed in `package.json` as external so that they are
    // not included in the output bundle.
    external: [
      ...Object.keys(packageJson.default.dependencies),
      ...Object.keys(packageJson.default.devDependencies),
    ].map((name) => {
      // Transform the name of each dependency into a regex so that imports from
      // nested paths are correctly marked as external.
      //
      // Example:
      // import 'module-name';
      // import 'module-name/path/to/nested/module';
      return new RegExp(`^${name}(/.*)?`);
    }),
    plugins: [
      json(),
      alias({
        entries: [{ find: /^(.*)\.scss\?lit$/, replacement: '$1.scss' }],
      }),
      nodeResolve({
        browser: true,
        mainFields: ['jsnext', 'module', 'main'],
        extensions: ['.js', '.ts'],
      }),
      commonjs({
        include: [/node_modules/],
      }),
      // babel({
      //   babelrc: false,
      //   exclude: ['node_modules/**'],
      //   plugins: [
      //     ['@babel/plugin-transform-runtime', { useESModules: true, version: '7.8.0' }],
      //     resourceJSPaths
      //   ],
      //   babelHelpers: 'runtime',
      //   extensions: ['.ts', '.tsx', '.js', '.jsx'],
      // }),
      litSCSS({
        includePaths: [
          path.resolve(__dirname, '../node_modules')
        ],
        async preprocessor(contents, id) {
          return (await postcss([autoprefixer(), cssnano()]).process(contents, { from: id }))
            .css;
        },
      }),
      typescript({
        noEmitOnError: true,
        compilerOptions: {
          rootDir,
          outDir,
        },
        exclude: ['tests','.storybook', '*.stories.ts'],
      }),
    ],
  };
}

function getIconRollupConfig(input) {
  return {
    input,
     // Mark dependencies listed in `package.json` as external so that they are
    // not included in the output bundle.
    external: [
      ...Object.keys(packageJson.default.dependencies),
      ...Object.keys(packageJson.default.devDependencies),
    ].map((name) => {
      // Transform the name of each dependency into a regex so that imports from
      // nested paths are correctly marked as external.
      //
      // Example:
      // import 'module-name';
      // import 'module-name/path/to/nested/module';
      return new RegExp(`^${name}(/.*)?`);
    }),
    plugins: [
      carbonIcons()
    ]
  }
}


build().catch((error) => {
  console.log(error);
  process.exit(1);
});
