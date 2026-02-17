"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var SchedulerController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SchedulerController = void 0;
const common_1 = require("@nestjs/common");
const scheduler_service_1 = require("../services/scheduler.service");
let SchedulerController = SchedulerController_1 = class SchedulerController {
    constructor(scheduler) {
        this.scheduler = scheduler;
        this.logger = new common_1.Logger(SchedulerController_1.name);
    }
    schedulePost(dto) {
        const scheduledTime = new Date(dto.scheduledTime);
        const post = this.scheduler.schedulePost(dto.message, dto.accounts, scheduledTime, dto.imageUrl);
        this.logger.log(`Scheduled post ${post.id} for ${scheduledTime}`);
        return post;
    }
    getPendingPosts() {
        return this.scheduler.getPendingPosts();
    }
    getAllScheduledPosts() {
        return this.scheduler.getScheduledPosts();
    }
    deleteScheduledPost(id) {
        const deleted = this.scheduler.deleteScheduledPost(id);
        return { success: deleted };
    }
};
exports.SchedulerController = SchedulerController;
__decorate([
    (0, common_1.Post)('schedule'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], SchedulerController.prototype, "schedulePost", null);
__decorate([
    (0, common_1.Get)('pending'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], SchedulerController.prototype, "getPendingPosts", null);
__decorate([
    (0, common_1.Get)('all'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], SchedulerController.prototype, "getAllScheduledPosts", null);
__decorate([
    (0, common_1.Delete)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], SchedulerController.prototype, "deleteScheduledPost", null);
exports.SchedulerController = SchedulerController = SchedulerController_1 = __decorate([
    (0, common_1.Controller)('scheduler'),
    __metadata("design:paramtypes", [scheduler_service_1.SchedulerService])
], SchedulerController);
//# sourceMappingURL=scheduler.controller.js.map