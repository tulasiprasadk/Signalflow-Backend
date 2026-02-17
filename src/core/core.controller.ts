import { Controller, Post, Body } from '@nestjs/common';
import { AiService } from './ai.service';
import { CreateOrgDto } from '../dto/create-org.dto';

@Controller('core')
export class CoreController {
  constructor(private readonly aiService: AiService) {}

  @Post('generate-insights')
  async generate(@Body() body: CreateOrgDto) {
    const { name, description, category } = body;
    return this.aiService.generateInsights({
      name,
      description,
      category,
    });
  }
}
