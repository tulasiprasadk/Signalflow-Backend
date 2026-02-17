"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
const common_1 = require("@nestjs/common");
const express = require("express");
const path_1 = require("path");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    app.use(express.json({ limit: '15mb' }));
    app.use(express.urlencoded({ extended: true, limit: '15mb' }));
    app.use('/uploads', express.static((0, path_1.join)(process.cwd(), 'uploads')));
    app.enableCors({
        origin: 'http://localhost:9000',
        credentials: true,
    });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
    }));
    const port = parseInt(process.env.PORT || '9001', 10);
    await app.listen(port);
    console.log(`🚀 Backend running on http://localhost:${port}`);
}
bootstrap();
//# sourceMappingURL=main.js.map