import { AiService } from './ai.service';
import { CreateOrgDto } from '../dto/create-org.dto';
export declare class CoreController {
    private readonly aiService;
    constructor(aiService: AiService);
    generate(body: CreateOrgDto): Promise<any>;
}
