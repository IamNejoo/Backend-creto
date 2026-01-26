// backend/src/product/product.controller.ts
import {
    Controller,
    Get,
    Post,
    Body,
    Patch,
    Param,
    Delete,
    UseGuards,
    Query,
    HttpCode,
    HttpStatus,
    UsePipes,
    ValidationPipe,
} from '@nestjs/common';
import { ProductService } from './product.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { AdminGuard } from '../auth/guard/admin.guard';

@UsePipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
}))
@Controller('products')
export class ProductController {
    constructor(private readonly productService: ProductService) { }

    @UseGuards(JwtAuthGuard, AdminGuard)
    @Post()
    @HttpCode(HttpStatus.CREATED)
    async create(@Body() dto: CreateProductDto) {
        return this.productService.create(dto);
    }

    @Get()
    @HttpCode(HttpStatus.OK)
    async findAll(@Query('includeInactive') includeInactive?: string) {
        const shouldIncludeInactive = includeInactive === 'true';
        return this.productService.findAll(shouldIncludeInactive);
    }

    @Get(':id')
    @HttpCode(HttpStatus.OK)
    async findOne(@Param('id') id: string) {
        return this.productService.findOne(id);
    }

    @Get('slug/:slug')
    @HttpCode(HttpStatus.OK)
    async findBySlug(@Param('slug') slug: string) {
        return this.productService.findBySlug(slug);
    }

    @UseGuards(JwtAuthGuard, AdminGuard)
    @Patch(':id')
    @HttpCode(HttpStatus.OK)
    async update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
        return this.productService.update(id, dto);
    }

    @UseGuards(JwtAuthGuard, AdminGuard)
    @Delete(':id')
    @HttpCode(HttpStatus.OK)
    async remove(@Param('id') id: string) {
        return this.productService.remove(id);
    }

    @UseGuards(JwtAuthGuard, AdminGuard)
    @Delete(':id/hard')
    @HttpCode(HttpStatus.OK)
    async hardDelete(@Param('id') id: string) {
        return this.productService.hardDelete(id);
    }

    // ✅ NUEVO: Generar presigned POST para imagen de producto
    @UseGuards(JwtAuthGuard, AdminGuard)
    @Post(':id/images/presign')
    @HttpCode(HttpStatus.OK)
    async presignImageUpload(
        @Param('id') productId: string,
        @Body() body: { filename?: string; contentType?: string },
    ) {
        const filename = body?.filename || 'product';
        const contentType = body?.contentType || 'image/jpeg';
        return this.productService.createProductImagePresign(productId, filename, contentType);
    }

    // ✅ NUEVO: Registrar imagen subida a S3
    @UseGuards(JwtAuthGuard, AdminGuard)
    @Post(':id/images/s3')
    @HttpCode(HttpStatus.OK)
    async addImageFromS3(
        @Param('id') productId: string,
        @Body() body: { s3_key: string },
    ) {
        const keyOrUrl = body?.s3_key;
        if (!keyOrUrl) throw new Error('s3_key es requerido');
        return this.productService.addImageFromS3(productId, keyOrUrl);
    }
}   