import Router from 'koa-router';
import IndexController from './controllers/index.controller.js';
import TileController from './controllers/tile.controller.js';

const router = new Router();

router.get('/', IndexController.getIndex);

// https://api.mapbox.com/v4/{tileset_id}/{zoom}/{x}/{y}.{format}
router.get('/tile/:zoom/:x/:y', TileController.getUsers);

export default router;
