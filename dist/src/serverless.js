"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
const platform_express_1 = require("@nestjs/platform-express");
const express = require("express");
const serverless_http_1 = require("serverless-http");
const common_1 = require("@nestjs/common");
const path_1 = require("path");
let cachedHandler = null;
async function createServer() {
    const expressApp = express();
    expressApp.use(express.json({ limit: '15mb' }));
    expressApp.use(express.urlencoded({ extended: true, limit: '15mb' }));
    expressApp.use('/uploads', express.static((0, path_1.join)(process.cwd(), 'uploads')));
    const app = await core_1.NestFactory.create(app_module_1.AppModule, new platform_express_1.ExpressAdapter(expressApp));
    const origin = process.env.CORS_ORIGIN || process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:9000';
    app.enableCors({ origin, credentials: true });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new common_1.ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    return expressApp;
}
const handler = async (req, res) => {
    if (!cachedHandler) {
        const app = await createServer();
        cachedHandler = (0, serverless_http_1.default)(app);
    }
    return cachedHandler(req, res);
};
exports.handler = handler;
//# sourceMappingURL=serverless.js.map