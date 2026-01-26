import {
    Body,
    Controller,
    Get,
    Param,
    Patch,
    Post,
    UseGuards,
    UsePipes,
    ValidationPipe,
} from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { AdminGuard } from '../auth/guard/admin.guard';
import { CreateSourceDto } from './dto/create-source.dto';
import { CreateLevelDto } from './dto/create-level.dto';
import { UpdateLevelDto } from './dto/update-level.dto';
import { UpdateLevelsBulkDto } from './dto/update-levels-bulk.dto';

@UsePipes(
    new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true, // convierte "123" → 123 según DTOs
    }),
)
@Controller('inventory')
export class InventoryController {
    constructor(private service: InventoryService) { }

    /* ========= ENDPOINTS PÚBLICOS ========= */
    // Estos endpoints deben ser públicos para consultar stock

    @Get('sources')
    listSources() {
        return this.service.listSources();
    }

    @Get('levels/by-variant/:variantId')
    listLevels(@Param('variantId') v: string) {
        return this.service.listLevelsByVariant(v);
    }

    @Get('variant/:variantId')
    getByVariant(@Param('variantId') v: string) {
        return this.service.getByVariant(v);
    }

    /* ========= ENDPOINTS ADMIN ========= */
    // Estos endpoints requieren autenticación y permisos de admin

    @UseGuards(JwtAuthGuard, AdminGuard)
    @Post('sources')
    createSource(@Body() dto: CreateSourceDto) {
        return this.service.createSource(dto);
    }

    @UseGuards(JwtAuthGuard, AdminGuard)
    @Post('levels')
    createLevel(@Body() dto: CreateLevelDto) {
        return this.service.createLevel(dto);
    }

    @UseGuards(JwtAuthGuard, AdminGuard)
    @Patch('levels/:variantId/:sourceId')
    updateLevel(
        @Param('variantId') v: string,
        @Param('sourceId') s: string,
        @Body() dto: UpdateLevelDto,
    ) {
        return this.service.updateLevel(v, s, dto);
    }

    @UseGuards(JwtAuthGuard, AdminGuard)
    @Post('reserve/:variantId/:sourceId/:qty')
    reserve(
        @Param('variantId') v: string,
        @Param('sourceId') s: string,
        @Param('qty') q: string,
    ) {
        return this.service.reserve(v, s, parseInt(q, 10));
    }

    @UseGuards(JwtAuthGuard, AdminGuard)
    @Post('release/:variantId/:sourceId/:qty')
    release(
        @Param('variantId') v: string,
        @Param('sourceId') s: string,
        @Param('qty') q: string,
    ) {
        return this.service.release(v, s, parseInt(q, 10));
    }

    @UseGuards(JwtAuthGuard, AdminGuard)
    @Post('consume/:variantId/:sourceId/:qty')
    consume(
        @Param('variantId') v: string,
        @Param('sourceId') s: string,
        @Param('qty') q: string,
    ) {
        return this.service.consume(v, s, parseInt(q, 10));
    }

    @UseGuards(JwtAuthGuard, AdminGuard)
    @Patch('levels/bulk')
    updateLevelsBulk(@Body() dto: UpdateLevelsBulkDto) {
        return this.service.updateLevels(dto.variantId, dto.updates);
    }
}