import { Module } from '@nestjs/common';
import { CoreController } from './core.controller';
import { LlmProxyController } from './llm.proxy';
import { AiService } from './ai.service';

@Module({
  controllers: [CoreController, LlmProxyController],
  providers: [AiService],
  exports: [AiService],
})
export class CoreModule {}
