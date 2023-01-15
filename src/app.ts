import Koa from 'koa';
import bodyParser from 'koa-bodyparser';
import cors from '@koa/cors';
import helmet from 'koa-helmet';
import json from 'koa-json';
import logger from 'koa-logger';
import 'reflect-metadata';
import router from './server.js';

import {setupCaches} from './controllers/tile.controller.js'

const app = new Koa();
const port = process.env.PORT || 3000;

app.use(helmet());
app.use(cors());
app.use(json());
app.use(logger());
app.use(bodyParser());

app.use(router.routes()).use(router.allowedMethods());

app.listen(port, async () => {
  console.log("Initialising caches...");
  await setupCaches();

  console.log(`🚀 App listening on the port ${port}`);
});
