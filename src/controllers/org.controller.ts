import { Controller, Post, Body } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrgDto } from '../dto/create-org.dto';

@Controller('org')
export class OrgController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  async createOrg(@Body() body: CreateOrgDto) {
    const org = await this.prisma.organization.create({
      data: {
        name: body.name,
        description: body.description,
        category: body.category,
        location: body.location,
        website: body.website,
      },
    });

    return {
      id: org.id,
      message: 'Organization onboarded successfully',
    };
  }
}
