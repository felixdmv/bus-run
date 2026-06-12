# MetroMile 🚇🏃‍♂️

Red social deportiva global para corredores urbanos. Vincula tus actividades y compite por completar las líneas de transporte urbano (metro, tranvía, autobús, tren ligero) de ciudades de todo el mundo.

## Características Principales
- **Global y Escalable:** Base de datos preparada para soportar miles de ciudades y rutas en todo el mundo.
- **Retos de Transporte:** Elige tu ciudad, selecciona una línea de metro, tranvía o bus y complétala recorriendo su trazado de parada a parada.
- **Sincronización:** Conéctate con Strava o Google para validar tus actividades automáticamente mediante GPS.
- **Comunidad y Feed Social:** Sigue a otros atletas, comenta sus entrenamientos, comparte fotos y sube de rango desde *Transeúnte* a *Leyenda del Tránsito*.
- **PWA Listada:** Instala la aplicación en tu móvil para correr a pantalla completa con geolocalización nativa optimizada.

## Tecnologías
- **Frontend:** React + Vite + TypeScript.
- **Mapas:** Leaflet + OpenStreetMap.
- **Backend & Auth:** Supabase (PostgreSQL para almacenamiento y autenticación OAuth de Google).
- **Integraciones:** API de Strava para sincronización en segundo plano.

## Cómo ejecutar en local

```bash
# Instalar dependencias
npm install

# Iniciar servidor de desarrollo
npm run dev

# Compilar para producción
npm run build
```

## Licencia
Distribuido bajo la Licencia MIT. Ver Ajustes en la app para más detalles.
