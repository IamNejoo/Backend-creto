// backend/src/orders/orders.controller.ts
import {
    Controller,
    Get,
    Post,
    Body,
    Param,
    Query,
    Patch,
    UseGuards,
    HttpCode,
    HttpStatus,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { PaymentsService } from '../payments/payments.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { AdminGuard } from '../auth/guard/admin.guard';
import { GetUser } from '../auth/decorator/get-user.decorator';
import { OrderStatus } from '@prisma/client';

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
    constructor(
        private readonly ordersService: OrdersService,
        private readonly paymentsService: PaymentsService,
    ) { }

    @Post()
    @HttpCode(HttpStatus.CREATED)
    async create(@GetUser('id') userId: string, @Body() dto: CreateOrderDto) {
        return this.ordersService.create(userId, dto);
    }

    @Get()
    async findAll(
        @GetUser('id') userId: string,
        @Query('status') status?: OrderStatus,
        @Query('limit') limit?: string,
        @Query('offset') offset?: string,
    ) {
        return this.ordersService.findByUser(userId, {
            status,
            limit: limit ? parseInt(limit, 10) : undefined,
            offset: offset ? parseInt(offset, 10) : undefined,
        });
    }

    @Get(':id')
    async findOne(@GetUser('id') userId: string, @Param('id') orderId: string) {
        return this.ordersService.findById(orderId, userId);
    }

    @Post(':id/cancel')
    async cancel(@GetUser('id') userId: string, @Param('id') orderId: string) {
        return this.ordersService.cancel(orderId, userId);
    }

    @Get('admin/all')
    @UseGuards(AdminGuard)
    async getAllOrders(
        @Query('status') status?: string,
        @Query('limit') limit?: string,
        @Query('offset') offset?: string,
    ) {
        return this.ordersService.findAll({
            status: status as any,
            limit: limit ? parseInt(limit) : undefined,
            offset: offset ? parseInt(offset) : undefined,
        });
    }

    @Get('admin/:id')
    @UseGuards(AdminGuard)
    async getOrderById(@Param('id') id: string) {
        return this.ordersService.findByIdAdmin(id);
    }

    @Patch('admin/:id/status')
    @UseGuards(AdminGuard)
    async updateOrderStatus(
        @Param('id') id: string,
        @Body() body: { status: string },
    ) {
        return this.ordersService.updateStatus(id, body.status as any);
    }
}