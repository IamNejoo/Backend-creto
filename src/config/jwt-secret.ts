export function getJwtSecret(): string {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 32) {
        throw new Error(
            'JWT_SECRET ausente o débil (mínimo 32 caracteres). Genera uno: openssl rand -hex 32',
        );
    }
    return secret;
}
