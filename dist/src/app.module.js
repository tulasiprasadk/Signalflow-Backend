"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const status_controller_1 = require("./status.controller");
const search_controller_1 = require("./search.controller");
const org_controller_1 = require("./controllers/org.controller");
const social_controller_1 = require("./controllers/social.controller");
const scheduler_controller_1 = require("./controllers/scheduler.controller");
const social_service_1 = require("./services/social.service");
const scheduler_service_1 = require("./services/scheduler.service");
const core_module_1 = require("./core/core.module");
const prisma_module_1 = require("./prisma/prisma.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({ isGlobal: true }),
            prisma_module_1.PrismaModule,
            core_module_1.CoreModule,
        ],
        controllers: [
            status_controller_1.StatusController,
            search_controller_1.SearchController,
            org_controller_1.OrgController,
            social_controller_1.SocialController,
            scheduler_controller_1.SchedulerController,
        ],
        providers: [social_service_1.SocialService, scheduler_service_1.SchedulerService],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map