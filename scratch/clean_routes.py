import os
import json
import math
import sys

if sys.platform.startswith('win'):
    sys.stdout.reconfigure(encoding='utf-8')


def haversine(lat1, lon1, lat2, lon2):
    R = 6371.0  # Earth radius in km
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

def clean_all_routes():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.abspath(os.path.join(script_dir, ".."))
    data_dir = os.path.join(project_root, "public", "data")
    
    cities_file = os.path.join(data_dir, "cities.json")
    if not os.path.exists(cities_file):
        print(f"No se encontró el archivo de ciudades: {cities_file}")
        return
        
    with open(cities_file, "r", encoding="utf-8") as f:
        cities = json.load(f)
        
    for city in cities:
        city_id = city["id"]
        city_dir = os.path.join(data_dir, "cities", city_id)
        metadata_file = os.path.join(city_dir, "metadata.json")
        
        if not os.path.exists(metadata_file):
            print(f"No hay metadatos para la ciudad: {city_id}")
            continue
            
        print(f"\nLimpiando rutas para la ciudad: {city['name']} ({city_id})...")
        
        with open(metadata_file, "r", encoding="utf-8") as f:
            metadata_list = json.load(f)
            
        updated_metadata = []
        updated_routes_full = []
        
        for route_meta in metadata_list:
            route_id = route_meta["id"]
            route_file = os.path.join(city_dir, "routes", f"{route_id}.json")
            
            if not os.path.exists(route_file):
                print(f"  [Error] No se encontró el archivo de ruta: {route_file}")
                updated_metadata.append(route_meta)
                continue
                
            with open(route_file, "r", encoding="utf-8") as f:
                route = json.load(f)
                
            stops = route.get("stops", [])
            if len(stops) < 2:
                print(f"  Ruta {route['ref']} - {route['name']}: Insuficientes paradas ({len(stops)}). Se mantiene original.")
                updated_metadata.append(route_meta)
                updated_routes_full.append(route)
                continue
                
            # Build clean sequence of coordinates from the stops list
            new_coords = []
            for s in stops:
                new_coords.append([s["lat"], s["lon"], 800.0])
                
            # Check if this is a circular route to close the loop
            name_lower = route["name"].lower()
            ref_upper = route["ref"].upper()
            desc_lower = route.get("description", "").lower()
            
            is_circular = (
                "circular" in name_lower or 
                "circular" in desc_lower or 
                "anden" in name_lower or
                "andén" in name_lower or
                ref_upper in ["L6", "L12", "L12A", "L12B"]
            )
            
            # Check if start and end are already the same station
            start_stop = stops[0]
            end_stop = stops[-1]
            dist_ends = haversine(start_stop["lat"], start_stop["lon"], end_stop["lat"], end_stop["lon"])
            
            if is_circular and dist_ends > 0.05:
                # Close the loop by connecting back to the first stop
                new_coords.append([start_stop["lat"], start_stop["lon"], 800.0])
                print(f"  Ruta {route['ref']} - {route['name']}: Detectada circular. Cerrando bucle.")
                
            # Recalculate distance
            total_dist = 0.0
            for i in range(len(new_coords) - 1):
                total_dist += haversine(new_coords[i][0], new_coords[i][1], new_coords[i+1][0], new_coords[i+1][1])
                
            # Avoid 0km distance
            if total_dist == 0.0:
                total_dist = route["distanceKm"]
                
            # Estimated walking and running times
            walk_time = int((total_dist / 4.5) * 3600)
            run_time = int((total_dist / 11.0) * 3600)
            
            # Update route object
            route["coords"] = new_coords
            route["distanceKm"] = round(total_dist, 2)
            route["estWalkingSeconds"] = walk_time
            route["estRunningSeconds"] = run_time
            
            # Save the clean route JSON
            with open(route_file, "w", encoding="utf-8") as f:
                json.dump(route, f, ensure_ascii=False, indent=2)
                
            # Update metadata entry
            route_meta["distanceKm"] = route["distanceKm"]
            route_meta["estWalkingSeconds"] = walk_time
            route_meta["estRunningSeconds"] = run_time
            
            updated_metadata.append(route_meta)
            updated_routes_full.append(route)
            
            print(f"  [OK] {route['ref']} - {route['name']}: {len(stops)} paradas -> Distancia corregida: {route['distanceKm']} km")
            
        # Write updated metadata.json
        with open(metadata_file, "w", encoding="utf-8") as f:
            json.dump(updated_metadata, f, ensure_ascii=False, indent=2)
        print(f"  [OK] Guardado índice de metadatos limpio: {metadata_file}")
        
        # Write compatibility single-file JSON (e.g. public/data/madrid.json)
        compat_file = os.path.join(data_dir, f"{city_id}.json")
        with open(compat_file, "w", encoding="utf-8") as f:
            json.dump(updated_routes_full, f, ensure_ascii=False, indent=2)
        print(f"  [OK] Guardado archivo compatible limpio: {compat_file}")

if __name__ == "__main__":
    clean_all_routes()
