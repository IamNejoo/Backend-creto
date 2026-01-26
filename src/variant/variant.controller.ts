import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
    UseGuards,
    UsePipes,
    ValidationPipe,
} from '@nestjs/common';
import { VariantService } from './variant.service';
import { CreateVariantDto } from './dto/create-variant.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { AdminGuard } from '../auth/guard/admin.guard';

@UsePipes(
    new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
    }),
)
@Controller('variants')
export class VariantController {
    constructor(private service: VariantService) { }

    /* ========= ENDPOINTS PÚBLICOS ========= */
    @Get('by-product/:productId')
    list(@Param('productId') productId: string) {
        return this.service.listByProduct(productId);
    }

    /* ========= ENDPOINTS ADMIN ========= */
    @UseGuards(JwtAuthGuard, AdminGuard)
    @Post()
    create(@Body() dto: CreateVariantDto) {
        return this.service.create(dto);
    }

    @UseGuards(JwtAuthGuard, AdminGuard)
    @Patch(':id')
    update(@Param('id') id: string, @Body() dto: UpdateVariantDto) {
        return this.service.update(id, dto);
    }

    @UseGuards(JwtAuthGuard, AdminGuard)
    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.service.remove(id);
    }
}