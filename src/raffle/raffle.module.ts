import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { RaffleService } from './raffle.service';
import { RaffleController } from './raffle.controller';
import { PrismaService } from '../prisma/prisma.service';

@Module({
    imports: [ScheduleModule.forRoot()],
    controllers: [RaffleController],
    providers: [RaffleService, PrismaService],
    exports: [RaffleService],
})
export class RaffleModule { }
