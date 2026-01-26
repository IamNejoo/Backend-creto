import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
    private readonly logger = new Logger(DashboardService.name);

    constructor(private prisma: PrismaService) { }

    async getStats() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // CONFIGURACIÓN: 35 DÍAS ATRÁS
        // Esto cubre el mes actual completo y un poco del anterior.
        const daysAgo35 = new Date();
        daysAgo35.setDate(daysAgo35.getDate() - 35);
        daysAgo35.setHours(0, 0, 0, 0);

        // --- INICIO EJECUCIÓN SECUENCIAL (Uno por uno para cuidar la RAM) ---

        // 1. Ventas Hoy
        let salesToday = 0;
        try {
            const res = await this.prisma.order.aggregate({
                where: { status: 'paid', createdAt: { gte: today } },
                _sum: { total_clp: true },
            });
            salesToday = Number(res._sum.total_clp || 0);
        } catch (e) {
            this.logger.error('Fallo SalesToday', e);
        }

        // 2. Ventas "Totales" (Últimos 35 Días)
        let salesTotal = 0;
        try {
            const res = await this.prisma.order.aggregate({
                where: {
                    status: 'paid',
                    createdAt: { gte: daysAgo35 } // Filtro de 35 días
                },
                _sum: { total_clp: true },
            });
            salesTotal = Number(res._sum.total_clp || 0);
        } catch (e) {
            this.logger.error('Fallo SalesTotal', e);
        }

        // 3. Órdenes Nuevas (Pendientes en los últimos 35 días)
        let ordersNew = 0;
        try {
            ordersNew = await this.prisma.order.count({
                where: {
                    status: { in: ['pending', 'draft'] },
                    createdAt: { gte: daysAgo35 } // Filtro de 35 días
                },
            });
        } catch (e) {
            this.logger.error('Fallo OrdersNew', e);
        }

        // 4. Usuarios Total
        let usersTotal = 0;
        try {
            usersTotal = await this.prisma.user.count();
        } catch (e) {
            this.logger.error('Fallo UsersTotal', e);
        }

        // 5. Órdenes Recientes
        let recentOrders: any[] = [];
        try {
            recentOrders = await this.prisma.order.findMany({
                take: 5,
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true, number: true, status: true, total_clp: true, createdAt: true,
                },
            });
        } catch (e) {
            this.logger.error('Fallo RecentOrders', e);
        }

        // 6. Raffle
        let raffle: any = null;
        try {
            raffle = await this.getRaffleStatus();
        } catch (e) {
            this.logger.error('Fallo Raffle', e);
        }

        return {
            stats: {
                sales_today: salesToday,
                // En el frontend dirá "Ventas Totales", pero mostrará el flujo de los últimos 35 días
                sales_total: salesTotal,
                orders_new: ordersNew,
                users_total: usersTotal,
            },
            recent_orders: recentOrders,
            // Mantenemos Top Products apagado por ahora para garantizar estabilidad
            top_products: [],
            raffle,
        };
    }

    private async getRaffleStatus() {
        const now = new Date();
        return this.prisma.raffle.findFirst({
            where: { starts_at: { lte: now }, ends_at: { gte: now } },
            orderBy: { ends_at: 'asc' },
        });
    }
}