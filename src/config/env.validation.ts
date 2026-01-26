// src/config/env.validation.ts
import { IsString, IsInt, Min, Max, IsUrl, validateSync } from 'class-validator';
import { plainToClass, Transform } from 'class-transformer';

export class EnvironmentVariables {
    @IsString()
    DATABASE_URL: string;

    @IsString()
    JWT_SECRET: string;

    @Transform(({ value }) => parseInt(value))
    @IsInt()
    @Min(1000)
    @Max(65535)
    PORT: number = 3000;

    @IsUrl({ require_tld: false })
    FRONTEND_URL: string = 'http://localhost:3000';
}

export function validate(config: Record<string, unknown>) {
    const validatedConfig = plainToClass(EnvironmentVariables, config, {
        enableImplicitConversion: true,
    });

    const errors = validateSync(validatedConfig, {
        skipMissingProperties: false,
    });

    if (errors.length > 0) {
        throw new Error(`Environment validation error: ${errors.toString()}`);
    }

    return validatedConfig;
}