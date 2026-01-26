// backend/src/account/account.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AccountService {
    constructor(private prisma: PrismaService) { }

    async getDashboard(userId: string) {
        const [lastOrder, ticketsCount, totalOrders, totalSpent] = await Promise.all([
            this.prisma.order.findFirst({
                where: { userId },
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true,
                    number: true,
                    status: true,
                    total_clp: true,
                    createdAt: true,
                },
            }),
            this.prisma.raffleTicket.count({
                where: { userId, status: 'paid' },
            }),
            this.prisma.order.count({
                where: { userId, status: 'paid' },
            }),
            this.prisma.order.aggregate({
                where: { userId, status: 'paid' },
                _sum: { total_clp: true },
            }),
        ]);

        return {
            last_order: lastOrder,
            tickets_count: ticketsCount,
            total_orders: totalOrders,
            total_spent: totalSpent._sum.total_clp || 0,
        };
    }
}