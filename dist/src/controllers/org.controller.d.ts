import { PrismaService } from '../prisma/prisma.service';
import { CreateOrgDto } from '../dto/create-org.dto';
export declare class OrgController {
    private readonly prisma;
    constructor(prisma: PrismaService);
    createOrg(body: CreateOrgDto): Promise<{
        id: string;
        message: string;
    }>;
}
