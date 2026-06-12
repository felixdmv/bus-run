import time
import os
import sys

# Add root folder to sys.path so python can find scripts/extract_routes.py
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

try:
    from scripts.extract_routes import extract_city_routes
except ImportError:
    # If run from root folder
    from scripts.extract_routes import extract_city_routes

# List of Spanish cities ordered by population
# Focus on Metro and Tram systems (clean, high-quality routes ideal for sports challenges)
CITIES_TO_EXTRACT = [
    {"name": "Madrid", "transports": [("metro", 20), ("tram", 5)]},
    {"name": "Barcelona", "transports": [("metro", 20), ("tram", 8)]},
    {"name": "Valencia", "transports": [("metro", 15), ("tram", 5)]},
    {"name": "Sevilla", "transports": [("metro", 5), ("tram", 5)]},
    {"name": "Zaragoza", "transports": [("tram", 5)]},
    {"name": "Málaga", "transports": [("metro", 5)]},
    {"name": "Murcia", "transports": [("tram", 5)]},
    {"name": "Palma de Mallorca", "transports": [("metro", 5)]},
    {"name": "Bilbao", "transports": [("metro", 10), ("tram", 5)]},
    {"name": "Alicante", "transports": [("tram", 8)]}
]

def main():
    print("=" * 60)
    # Configure terminal encoding to support UTF-8 on Windows
    if sys.platform.startswith('win'):
        sys.stdout.reconfigure(encoding='utf-8')

    print("INICIANDO INGESTA MASIVA DE RUTAS EN ESPAÑA")
    print("Ordenadas por población. Enfoque: Metro y Tranvías.")
    print("=" * 60)

    for i, city in enumerate(CITIES_TO_EXTRACT):
        city_name = city["name"]
        print(f"\n>>>> [{i+1}/{len(CITIES_TO_EXTRACT)}] Iniciando extracción en {city_name.upper()}...")
        
        for transport_type, limit in city["transports"]:
            print(f"  -> Extrayendo '{transport_type}' (Límite: {limit} líneas)...")
            try:
                extract_city_routes(city_name, transport_type, limit)
            except Exception as e:
                print(f"  [ERROR] Ocurrió un fallo al procesar {city_name} ({transport_type}): {e}")
            
            # Pause between different transports of the same city to be gentle on Overpass
            time.sleep(3)
            
        # 10 seconds pause between different cities
        print(f"Finalizado {city_name}. Pausa de cortesía para evitar rate limit de Overpass API...")
        time.sleep(10)

    print("\n" + "=" * 60)
    print("¡PROCESAMIENTO DE BATCH FINALIZADO!")
    print("Se ha generado la estructura completa para todas las ciudades configuradas.")
    print("=" * 60)

if __name__ == "__main__":
    main()
