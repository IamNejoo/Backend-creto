// backend/src/account/account.controller.ts
import { Controller, Get, UseGuards } from '@nestjs/common';
import { AccountService } from './account.service';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { GetUser } from '../auth/decorator/get-user.decorator';

@Controller('account')
@UseGuards(JwtAuthGuard)
export class AccountController {
    constructor(private readonly accountService: AccountService) { }

    @Get('dashboard')
    async getDashboard(@GetUser('id') userId: string) {
        return this.accountService.getDashboard(userId);
    }
}