import {
    Controller,
    Get,
    Patch,
    Post,
    Delete,
    Param,
    UseGuards,
    UsePipes,
    ValidationPipe,
    Body,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { AdminGuard } from '../auth/guard/admin.guard';
import { GetUser } from '../auth/decorator/get-user.decorator';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@UseGuards(JwtAuthGuard)
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
@Controller('users')
export class UsersController {
    constructor(private readonly users: UsersService) { }

    @Get('me')
    async me(@GetUser() user: any) {
        return this.users.getMe(user.id);
    }

    @Patch('me')
    async update(@GetUser() user: any, @Body() dto: UpdateProfileDto) {
        return this.users.updateMe(user.id, dto);
    }

    // ✅ NUEVO: Generar presigned POST para subir avatar a S3
    @Post('me/avatar/presign')
    async presignAvatarUpload(
        @GetUser() user: any,
        @Body() body: { filename?: string; contentType?: string },
    ) {
        const filename = body?.filename || 'avatar';
        const contentType = body?.contentType || 'image/jpeg';
        return this.users.createAvatarPresign(user.id, filename, contentType);
    }

    // ✅ NUEVO: Registrar URL de S3 en la DB después de subir
    @Patch('me/avatar')
    async updateAvatarFromS3(
        @GetUser() user: any,
        @Body() body: { s3_key: string },
    ) {
        const keyOrUrl = body?.s3_key;
        if (!keyOrUrl) {
            throw new Error('s3_key es requerido');
        }
        return this.users.updateAvatarFromS3(user.id, keyOrUrl);
    }

    @Get()
    @UseGuards(AdminGuard) // Importar: import { AdminGuard } from '../auth/guard/admin.guard';
    async getAll() {
        return this.users.getAll();
    }

    @Get(':id')
    @UseGuards(AdminGuard)
    async getById(@Param('id') id: string) { // Importar: import { Param } from '@nestjs/common';
        return this.users.getById(id);
    }

    @Patch(':id')
    @UseGuards(AdminGuard)
    async updateUser(@Param('id') id: string, @Body() data: any) {
        return this.users.update(id, data);
    }

    @Delete(':id')
    @UseGuards(AdminGuard) // Importar: import { Delete } from '@nestjs/common';
    async deleteUser(@Param('id') id: string) {
        return this.users.delete(id);
    }
}