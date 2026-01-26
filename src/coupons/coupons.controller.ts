import { Controller, Get, Post, Body, Param, Delete, UseGuards } from '@nestjs/common';
import { CouponsService } from './coupons.service';
import { CreateCouponDto, ValidateCouponDto } from './dto/create-coupon.dto';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { AdminGuard } from '../auth/guard/admin.guard';

@Controller('coupons')
export class CouponsController {
    constructor(private readonly couponsService: CouponsService) { }

    // Crear Cupón (Solo Admin)
    @UseGuards(JwtAuthGuard, AdminGuard)
    @Post()
    create(@Body() createCouponDto: CreateCouponDto) {
        return this.couponsService.create(createCouponDto);
    }

    // Listar Cupones (Solo Admin)
    @UseGuards(JwtAuthGuard, AdminGuard)
    @Get()
    findAll() {
        return this.couponsService.findAll();
    }

    // Eliminar Cupón (Solo Admin)
    @UseGuards(JwtAuthGuard, AdminGuard)
    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.couponsService.remove(id);
    }

    // Validar Cupón (Público - Se usa en el Checkout)
    @Post('validate')
    validate(@Body() dto: ValidateCouponDto) {
        return this.couponsService.validate(dto);
    }
}