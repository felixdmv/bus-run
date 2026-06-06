# BusRun

Aplicación web inicial para descargar rutas GPX de líneas de transporte urbano y hacer retos deportivos.

## Objetivo
- Empezar con las líneas de bus urbano de Burgos.
- Mostrar rutas en mapa OpenStreetMap.
- Descargar rutas seleccionadas en formato GPX.
- Llevar un perfil con las líneas completadas.

## Tecnologías propuestas
- Frontend: `React` + `Vite` + `TypeScript`
- Mapa: `Leaflet` + `OpenStreetMap`
- Descarga GPX: generación desde coordenadas en el navegador
- Almacenamiento inicial: `localStorage`

## Cómo instalar

```bash
cd "c:/Users/felix/Documents/Proyectos Personales/BusRun"
npm install
npm run dev
```

## Qué sigue
1. Añadir datos reales de las líneas de Burgos.
2. Extraer trazados desde OpenStreetMap, GTFS o la fuente del ayuntamiento.
3. Convertir el proyecto en PWA y/o empaquetarlo con Capacitor para móvil.
4. Añadir usuario / login y seguimiento de retos.
