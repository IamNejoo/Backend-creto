
// load-test.js
import http from 'k6/http';
import { check, sleep, fail } from 'k6';
import { Trend } from 'k6/metrics';

// --- CONFIGURACIÓN DE LA PRUEBA ---
export const options = {
    // Simula 100 "Virtual Users" (VUs)
    vus: 50000,

    // Duración total de la prueba
    duration: '60s', // Corre por 1 minuto

    // Umbrales: si no se cumplen, la prueba falla
    thresholds: {
        'http_req_failed': ['rate<0.05'], // Menos del 5% de las peticiones pueden fallar
        'http_req_duration': ['p(95)<2000'], // El 95% debe responder en menos de 2000ms (2s)
    },
};

// --- DATOS NECESARIOS ---
// 1. Un token de autenticación (JWT) de un usuario de prueba
// Entra a tu app, inicia sesión y copia el token que te da el backend.
const AUTH_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjbWk0MGx4c2IwMDAwcG8zNHFxNDF6dnQxIiwiZW1haWwiOiJrZXZpbm0uYXJhdmVuYUBnbWFpbC5jb20iLCJpYXQiOjE3NjM0MzY1ODAsImV4cCI6MTc2NDA0MTM4MH0.pEN3S3vV1PKPqH8mtED3Z_eWWdPy8r0euIPY1dl3GXg';

// 2. El ID de un sorteo (Raffle) que exista
const RAFFLE_ID = 'cmi41gga90000ry34hc7d5bfm'; // Cambia esto por un ID real

// --- EL SCRIPT DE PRUEBA ---
// Esto es lo que cada uno de los 100 VUs hará, en un bucle:
export default function () {

    if (!AUTH_TOKEN || !RAFFLE_ID || AUTH_TOKEN === 'PEGAR_TU_JWT_DE_PRUEBA_AQUI' || RAFFLE_ID === 'PEGAR_TU_ID_DE_SORTEO_AQUI') {
        fail('Debes configurar AUTH_TOKEN y RAFFLE_ID en el script.');
    }

    // El "payload": cuántos tickets queremos reservar
    const payload = JSON.stringify({
        quantity: 1,
        raffleId: RAFFLE_ID, // <-- Añadir esto
    });

    const headers = {
        'Authorization': `Bearer ${AUTH_TOKEN}`,
        'Content-Type': 'application/json',
    };

    // 1. Llamar a la API
    // Asegúrate de que la URL sea correcta (tu endpoint de Nginx)
    const res = http.post(
        `http://localhost/api/v1/raffles/${RAFFLE_ID}/reserve-many`,
        payload,
        { headers }
    );

    // 2. Verificar el resultado
    // ¡ESTA ES LA LÍNEA MODIFICADA PARA DEPURAR!
    check(res, {
        'Reserva exitosa (status 201)': (r) => r.status === 201,
    }) || console.log(`FALLO LA PETICIÓN: Status=${res.status} Body=${res.body}`);


    // 3. Esperar un momento antes de volver a intentarlo
    // Simula un usuario "pensando"
    sleep(Math.random() * 3 + 1); // Espera entre 1 y 4 segundos
}