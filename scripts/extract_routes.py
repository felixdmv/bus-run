import requests
import json
import math
import os
import sys
import time

# Configure terminal to output UTF-8
if sys.platform.startswith('win'):
    sys.stdout.reconfigure(encoding='utf-8')

OVERPASS_URL = "https://lz4.overpass-api.de/api/interpreter"
ELEVATION_URL = "https://elevation-api.open-meteo.com/v1/elevation"

# Haversine formula to calculate distance in km between two coordinates
def haversine(lat1, lon1, lat2, lon2):
    R = 6371.0  # Earth radius in kilometers
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

# Stitch way geometries into a single continuous path
def stitch_ways(ways, member_refs):
    way_dict = {w["id"]: w for w in ways}
    ordered_ways = [way_dict[ref] for ref in member_refs if ref in way_dict]
    
    if not ordered_ways:
        return []
        
    path = []
    # Initialize with the first way
    first_way = ordered_ways[0]
    coords = [(pt["lat"], pt["lon"]) for pt in first_way.get("geometry", [])]
    path.extend(coords)
    
    for i in range(1, len(ordered_ways)):
        next_way = ordered_ways[i]
        next_coords = [(pt["lat"], pt["lon"]) for pt in next_way.get("geometry", [])]
        
        if not next_coords:
            continue
            
        # Determine orientation
        end_current = path[-1]
        start_next = next_coords[0]
        end_next = next_coords[-1]
        
        # Calculate distances to decide if we need to flip the next way
        dist_normal = haversine(end_current[0], end_current[1], start_next[0], start_next[1])
        dist_flipped = haversine(end_current[0], end_current[1], end_next[0], end_next[1])
        
        if dist_flipped < dist_normal:
            next_coords.reverse()
            
        # Avoid duplicate points
        if path and next_coords:
            gap = haversine(path[-1][0], path[-1][1], next_coords[0][0], next_coords[0][1])
            if gap < 0.005:  # Less than 5 meters
                path.extend(next_coords[1:])
            else:
                path.extend(next_coords)
        else:
            path.extend(next_coords)
            
    return path

# Fetch elevations from Open-Meteo elevation API in batches
def fetch_elevations(coords):
    if not coords:
        return []
    
    elevations = []
    # Open-Meteo allows big batches, but let's send in batches of 150 coordinates to avoid too long URLs
    batch_size = 150
    for i in range(0, len(coords), batch_size):
        batch = coords[i:i+batch_size]
        lats = ",".join(str(pt[0]) for pt in batch)
        lons = ",".join(str(pt[1]) for pt in batch)
        
        try:
            response = requests.get(f"{ELEVATION_URL}?latitude={lats}&longitude={lons}", timeout=15)
            if response.status_code == 200:
                data = response.json()
                elevations.extend(data.get("elevation", [0.0] * len(batch)))
            else:
                print(f"  [Warning] Elevation API returned code {response.status_code}. Using fallback elevations.")
                elevations.extend([800.0] * len(batch))
        except Exception as e:
            print(f"  [Warning] Failed to fetch elevations: {e}. Using fallback.")
            elevations.extend([800.0] * len(batch))
        time.sleep(0.1) # Tiny rate limiting friendly gap
        
    return elevations

# Calculate metrics and add elevations
def calculate_metrics(coords, elevations):
    if len(coords) < 2:
        return 0.0, 0.0, 0.0, 0, 0, []
        
    total_dist = 0.0
    elevation_gain = 0.0
    elevation_loss = 0.0
    
    # Calculate distance and cumulative elevation changes
    for i in range(len(coords) - 1):
        d = haversine(coords[i][0], coords[i][1], coords[i+1][0], coords[i+1][1])
        total_dist += d
        
        if elevations and i + 1 < len(elevations):
            el_diff = elevations[i+1] - elevations[i]
            if el_diff > 0:
                elevation_gain += el_diff
            else:
                elevation_loss += abs(el_diff)
            
    # Walking/Running times estimation
    walk_speed = 4.5  # km/h
    walk_hours = total_dist / walk_speed
    walk_hours += (elevation_gain / 100.0) * (5.0 / 60.0)  # +5 min per 100m gain
    walk_seconds = int(walk_hours * 3600)
    
    run_speed = 11.0  # km/h
    run_hours = total_dist / run_speed
    run_hours += (elevation_gain / 100.0) * (2.0 / 60.0)  # +2 min per 100m gain
    run_seconds = int(run_hours * 3600)
    
    # Combine coordinates with elevation
    coords_with_ele = []
    for i in range(len(coords)):
        ele = elevations[i] if (elevations and i < len(elevations)) else 0.0
        coords_with_ele.append([coords[i][0], coords[i][1], round(ele, 1)])
        
    return round(total_dist, 2), round(elevation_gain, 1), round(elevation_loss, 1), walk_seconds, run_seconds, coords_with_ele

def clean_str(s):
    if not s:
        return s
    s = s.strip()
    # Normalize typical Unicode character representation glitches
    s = s.replace('\u00e2\u0086\u0092', ' → ')
    s = s.replace('\u00e2\u0086\u0090', ' ← ')
    s = s.replace('â†’', ' → ')
    s = s.replace('â† ', ' ← ')
    return s

def query_city_details(city_name):
    # Retrieve center coordinates of city from Nominatim or Overpass
    print(f"Obteniendo coordenadas centrales para '{city_name}'...")
    url = f"https://nominatim.openstreetmap.org/search?q={city_name}&format=json&limit=1"
    headers = {"User-Agent": "MetroMilePipelineAgent/1.0"}
    try:
        res = requests.get(url, headers=headers, timeout=10)
        if res.status_code == 200 and len(res.json()) > 0:
            data = res.json()[0]
            lat = float(data["lat"])
            lon = float(data["lon"])
            display_name = data.get("display_name", city_name)
            country = display_name.split(",")[-1].strip()
            print(f"Encontrada: {display_name} ({lat}, {lon})")
            return lat, lon, country
        else:
            # Overpass fallback
            print("No se encontró en Nominatim. Usando coordenadas por defecto de Burgos.")
            return 42.3439, -3.6969, "España"
    except Exception as e:
        print(f"Error al obtener detalles de ciudad: {e}. Usando Burgos como fallback.")
        return 42.3439, -3.6969, "España"

def extract_city_routes(city_name, transport_type="bus", max_routes=40):
    city_id = city_name.lower().replace(" ", "_").replace(",", "").replace(".", "")
    lat, lon, country = query_city_details(city_name)
    
    # Overpass Query
    # transport_type map to OSM route tags
    osm_route_value = "bus"
    if transport_type == "metro":
        osm_route_value = "subway"
    elif transport_type == "tram":
        osm_route_value = "tram"
    elif transport_type == "light_rail":
        osm_route_value = "light_rail"
        
    print(f"\nBuscando rutas '{osm_route_value}' en '{city_name}' desde Overpass API...")
    
    query = f"""
    [out:json][timeout:180];
    area[name="{city_name}"]->.searchArea;
    (
      relation["route"="{osm_route_value}"](area.searchArea);
    );
    (._; >>;);
    out geom;
    """
    
    headers = {
        "User-Agent": "MetroMilePipelineAgent/1.0",
    }
    
    try:
        response = requests.post(OVERPASS_URL, data={'data': query}, headers=headers, timeout=120)
        response.raise_for_status()
        data = response.json()
    except Exception as e:
        print(f"Error al conectar con Overpass API: {e}")
        return
        
    elements = data.get("elements", [])
    print(f"Recibidos {len(elements)} elementos geográficos desde OSM.")
    
    # Dictionaries for matching nodes and ways
    nodes_dict = {}
    ways_dict = {}
    relations = []
    
    for elem in elements:
        e_type = elem.get("type")
        if e_type == "node":
            nodes_dict[elem["id"]] = elem
        elif e_type == "way":
            ways_dict[elem["id"]] = elem
        elif e_type == "relation":
            relations.append(elem)
            
    print(f"Relaciones de ruta encontradas: {len(relations)}")
    
    # Limit number of processed routes to avoid extreme files or API timeouts
    if len(relations) > max_routes:
        print(f"Limitando el procesamiento a las primeras {max_routes} rutas por rendimiento...")
        relations = relations[:max_routes]
        
    lines_metadata = []
    lines_full = []
    
    # Process each route relation
    for idx, rel in enumerate(relations):
        rel_id = str(rel["id"])
        tags = rel.get("tags", {})
        ref = tags.get("ref", tags.get("name", f"L{idx+1}"))
        name = clean_str(tags.get("name", f"Línea {ref}"))
        operator = clean_str(tags.get("operator", "Operador local"))
        
        print(f"\n[{idx+1}/{len(relations)}] Procesando Relación {rel_id}: {name} (Ref: {ref})")
        
        members = rel.get("members", [])
        way_refs = []
        stop_refs = []
        
        for m in members:
            m_type = m.get("type")
            m_ref = m.get("ref")
            m_role = m.get("role", "")
            
            if m_type == "way":
                way_refs.append(m_ref)
            elif m_type == "node" and m_role in ["stop", "platform", "stop_entry_only", "stop_exit_only"]:
                stop_refs.append(m)
                
        ways = [ways_dict[w_ref] for w_ref in way_refs if w_ref in ways_dict]
        
        stitched_path = stitch_ways(ways, way_refs)
        print(f"  Geometría cosida: {len(stitched_path)} coordenadas.")
        
        if not stitched_path:
            print("  [Warning] Geometría vacía. Omitiendo ruta.")
            continue
            
        # Limit geometry points to max 1500 to keep files small and Leaflet fast
        if len(stitched_path) > 1500:
            step = len(stitched_path) // 1000
            stitched_path = stitched_path[::step]
            print(f"  [Info] Geometría simplificada a {len(stitched_path)} coordenadas para optimización.")
            
        # Fetch elevations from Open-Meteo API
        print("  Obteniendo alturas reales de Open-Meteo...")
        elevations = fetch_elevations(stitched_path)
        
        # Calculate metrics
        distance_km, gain, loss, walk_time, run_time, path_with_ele = calculate_metrics(stitched_path, elevations)
        
        # Resolve stops
        stops = []
        for s_member in stop_refs:
            s_id = s_member.get("ref")
            role = s_member.get("role", "")
            node_detail = nodes_dict.get(s_id)
            if node_detail:
                s_tags = node_detail.get("tags", {})
                s_name = clean_str(s_tags.get("name"))
                if not s_name:
                    s_name = f"Parada #{s_id}"
                
                stops.append({
                    "id": str(s_id),
                    "name": s_name,
                    "lat": float(node_detail["lat"]),
                    "lon": float(node_detail["lon"]),
                    "role": role
                })
                
        print(f"  Paradas resueltas: {len(stops)} paradas.")
        
        route_data = {
            "id": rel_id,
            "name": name,
            "ref": ref,
            "description": f"Ruta real de {transport_type} urbano gestionada por {operator}.",
            "distanceKm": distance_km,
            "elevationGain": gain,
            "elevationLoss": loss,
            "estWalkingSeconds": walk_time,
            "estRunningSeconds": run_time,
            "stopsCount": len(stops),
            "coords": path_with_ele,
            "stops": stops
        }
        
        # For metadata index
        meta_data = {
            "id": rel_id,
            "name": name,
            "ref": ref,
            "description": route_data["description"],
            "distanceKm": distance_km,
            "elevationGain": gain,
            "elevationLoss": loss,
            "estWalkingSeconds": walk_time,
            "estRunningSeconds": run_time,
            "stopsCount": len(stops),
            "transport_type": transport_type
        }
        
        lines_metadata.append(meta_data)
        lines_full.append(route_data)
        
    if not lines_full:
        print("No se pudieron importar rutas de la ciudad.")
        return

    # Write Output Files
    script_dir = os.path.dirname(os.path.abspath(__file__))
    output_dir = os.path.abspath(os.path.join(script_dir, "..", "public", "data"))
    
    # 1. Backwards Compatible format (single json file)
    compat_path = os.path.join(output_dir, f"{city_id}.json")
    with open(compat_path, "w", encoding="utf-8") as f:
        json.dump(lines_full, f, ensure_ascii=False, indent=2)
    print(f"\n[OK] Guardado archivo compatible: {compat_path} ({os.path.getsize(compat_path) / 1024:.1f} KB)")
    
    # 2. Optimized split files
    split_city_dir = os.path.join(output_dir, "cities", city_id)
    os.makedirs(split_city_dir, exist_ok=True)
    
    # Index file: metadata.json
    metadata_path = os.path.join(split_city_dir, "metadata.json")
    with open(metadata_path, "w", encoding="utf-8") as f:
        json.dump(lines_metadata, f, ensure_ascii=False, indent=2)
    print(f"[OK] Guardado índice de metadatos: {metadata_path} ({os.path.getsize(metadata_path) / 1024:.1f} KB)")
    
    # Individual routes in routes/
    routes_dir = os.path.join(split_city_dir, "routes")
    os.makedirs(routes_dir, exist_ok=True)
    for route in lines_full:
        route_path = os.path.join(routes_dir, f"{route['id']}.json")
        with open(route_path, "w", encoding="utf-8") as f:
            json.dump(route, f, ensure_ascii=False, indent=2)
            
    print(f"[OK] Guardadas {len(lines_full)} rutas individuales en: {routes_dir}")
    
    # Update global cities list
    cities_file = os.path.join(output_dir, "cities.json")
    cities_list = []
    if os.path.exists(cities_file):
        try:
            with open(cities_file, "r", encoding="utf-8") as f:
                cities_list = json.load(f)
        except Exception:
            pass
            
    # Check if city already exists in list, update or add
    existing = [c for c in cities_list if c["id"] == city_id]
    if existing:
        city_entry = existing[0]
        # Append transport if not already in list
        if transport_type not in city_entry.get("transports", []):
            city_entry.setdefault("transports", []).append(transport_type)
        city_entry["center"] = [lat, lon]
        city_entry["country"] = country
    else:
        cities_list.append({
            "id": city_id,
            "name": city_name,
            "country": country,
            "center": [lat, lon],
            "zoom": 13 if transport_type == "bus" else 12,
            "transports": [transport_type]
        })
        
    with open(cities_file, "w", encoding="utf-8") as f:
        json.dump(cities_list, f, ensure_ascii=False, indent=2)
    print(f"[OK] Actualizada lista de ciudades en: {cities_file}")
    
    print("\n¡PROCESAMIENTO GLOBAL COMPLETADO CON ÉXITO!")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python scripts/extract_routes.py \"Nombre Ciudad\" [tipo_transporte: bus/metro/tram] [max_rutas]")
        print("Ejemplo: python scripts/extract_routes.py \"Segovia\" bus 10")
    else:
        city = sys.argv[1]
        transport = sys.argv[2] if len(sys.argv) > 2 else "bus"
        limit = int(sys.argv[3]) if len(sys.argv) > 3 else 30
        extract_city_routes(city, transport, limit)
