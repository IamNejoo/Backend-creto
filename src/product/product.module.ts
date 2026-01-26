// src/product/product.module.ts
import { Module } from '@nestjs/common';
import { ProductService } from './product.service';
import { ProductController } from './product.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
    imports: [PrismaModule],
    controllers: [ProductController],
    providers: [ProductService],
    exports: [ProductService], // Para usar en otros módulos
})
export class ProductModule { }