import {
    Controller,
    Post,
    Get,
    Param,
    UseGuards,
    Body,
    ValidationPipe,
    UsePipes,
    Query,
    Delete,
    UploadedFile,
    UseInterceptors,
    BadRequestException,
    Patch,
} from '@nestjs/common';
import { RaffleService } from './raffle.service';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { AdminGuard } from '../auth/guard/admin.guard';
import { GetUser } from '../auth/decorator/get-user.decorator';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as path from 'path';
import { CreateTierDto } from './dto/create-tier.dto';
import { UpdateTierDto } from './dto/update-tier.dto';
import { CreateRaffleDto } from './dto/create-raffle.dto';
import { UpdateRaffleDto } from './dto/update-raffle.dto';

const uploadsRoot = path.join(process.cwd(), 'uploads', 'raffles');
const RAFFLE_IMG_MAX_MB = 6;

const raffleStorage = diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsRoot),
    filename: (_req, file, cb) => {
        const id = Date.now().toString(36);
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `raffle-${id}${ext}`);
    },
});
function raffleImageFilter(_req: any, file: Express.Multer.File, cb: any) {
    const ok = /image\/(png|jpe?g|webp)/i.test(file.mimetype);
    if (!ok) return cb(new Error('Tipo de archivo no permitido'), false);
    cb(null, true);
}

@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
@Controller('raffles')
export class RaffleController {
    constructor(private readonly raffleService: RaffleService) { }

    /* ========= MÉTODOS PÚBLICOS ========= */

    @Get()
    async listRaffles(
        @Query('includeImages') includeImages?: string,
        @Query('includeTiers') includeTiers?: string,
        @Query('status') status?: 'active' | 'scheduled' | 'finished',
    ) {
        const withImages = includeImages === 'true';
        const withTiers = includeTiers === 'true';
        return this.raffleService.listRaffles(withImages, withTiers, status);
    }

    @Get('featured')
    async getFeatured() {
        return this.raffleService.getFeatured();
    }

    // ⚠️ IMPORTANTE: getUserTickets DEBE ir antes de :id para evitar conflictos de ruta
    @UseGuards(JwtAuthGuard)
    @Get('user/tickets')
    async getUserTickets(@GetUser() user: any) {
        return this.raffleService.getUserTickets(user.id);
    }

    @Get(':id')
    async getRaffle(@Param('id') id: string) {
        return this.raffleService.getRaffle(id);
    }

    /* ========= MÉTODOS DE USUARIO AUTENTICADO ========= */
    // ❌ Eliminados endpoints de Reserva y Confirmación manual.
    // Ahora todo sucede a través del módulo de Pagos.

    /* ========= MÉTODOS ADMIN ========= */

    @UseGuards(JwtAuthGuard, AdminGuard)
    @Post()
    async createRaffle(@Body() dto: CreateRaffleDto) {
        return this.raffleService.createRaffle(dto);
    }

    @UseGuards(JwtAuthGuard, AdminGuard)
    @Patch(':id')
    async updateRaffle(@Param('id') id: string, @Body() dto: UpdateRaffleDto) {
        return this.raffleService.updateRaffle(id, dto);
    }

    @UseGuards(JwtAuthGuard, AdminGuard)
    @Delete(':id')
    async deleteRaffle(@Param('id') id: string) {
        return this.raffleService.deleteRaffle(id);
    }

    /* ========= ADMIN: Imágenes ========= */

    @UseGuards(JwtAuthGuard, AdminGuard)
    @Post(':id/images')
    @UseInterceptors(
        FileInterceptor('file', {
            storage: raffleStorage,
            fileFilter: raffleImageFilter,
            limits: { fileSize: RAFFLE_IMG_MAX_MB * 1024 * 1024 },
        }),
    )
    async uploadImage(@Param('id') raffleId: string, @UploadedFile() file: Express.Multer.File) {
        if (!file) throw new BadRequestException('Archivo no recibido');
        const publicUrl = `/uploads/raffles/${file.filename}`;
        return this.raffleService.addImage(raffleId, publicUrl);
    }

    @UseGuards(JwtAuthGuard, AdminGuard)
    @Post(':id/images/presign')
    async presignImageUpload(
        @Param('id') raffleId: string,
        @Body() body: { filename?: string; contentType?: string },
    ) {
        const filename = body?.filename || 'image';
        const contentType = body?.contentType || 'image/jpeg';
        return this.raffleService.createRaffleImagePresign(raffleId, filename, contentType);
    }

    @UseGuards(JwtAuthGuard, AdminGuard)
    @Post(':id/images/s3')
    async addImageFromS3(
        @Param('id') raffleId: string,
        @Body() body: { s3_key: string },
    ) {
        const keyOrUrl = body?.s3_key;
        if (!keyOrUrl) throw new BadRequestException('s3_key es requerido');
        return this.raffleService.addImageFromS3(raffleId, keyOrUrl);
    }

    @UseGuards(JwtAuthGuard, AdminGuard)
    @Patch(':id/images/:imageId/primary')
    async setPrimary(@Param('id') raffleId: string, @Param('imageId') imageId: string) {
        return this.raffleService.setPrimaryImage(raffleId, imageId);
    }

    @UseGuards(JwtAuthGuard, AdminGuard)
    @Delete(':id/images/:imageId')
    async deleteImage(@Param('id') raffleId: string, @Param('imageId') imageId: string) {
        return this.raffleService.deleteImage(raffleId, imageId);
    }

    /* ========= ADMIN: TIERS ========= */

    @UseGuards(JwtAuthGuard, AdminGuard)
    @Get(':id/tiers')
    async listTiers(@Param('id') raffleId: string) {
        return this.raffleService.listTiers(raffleId);
    }

    @UseGuards(JwtAuthGuard, AdminGuard)
    @Post(':id/tiers')
    async createTier(@Param('id') raffleId: string, @Body() dto: CreateTierDto) {
        return this.raffleService.createTier(raffleId, dto);
    }

    @UseGuards(JwtAuthGuard, AdminGuard)
    @Patch(':id/tiers/:tierId')
    async updateTier(
        @Param('id') raffleId: string,
        @Param('tierId') tierId: string,
        @Body() dto: UpdateTierDto,
    ) {
        return this.raffleService.updateTier(raffleId, tierId, dto);
    }

    @UseGuards(JwtAuthGuard, AdminGuard)
    @Delete(':id/tiers/:tierId')
    async deleteTier(@Param('id') raffleId: string, @Param('tierId') tierId: string) {
        return this.raffleService.deleteTier(raffleId, tierId);
    }

    /* ========= ADMIN: Tickets ========= */

    @UseGuards(JwtAuthGuard, AdminGuard)
    @Get(':id/tickets')
    async getTickets(
        @Param('id') raffleId: string,
        @Query('page') page?: number,
        @Query('limit') limit?: number,
        @Query('search') search?: string,
    ) {
        // Si limit no viene, usa 50 por defecto.
        // El frontend enviará limit=-1 para descargar todo.
        return this.raffleService.listTickets(raffleId, Number(page) || 1, Number(limit) || 50, search);
    }
}