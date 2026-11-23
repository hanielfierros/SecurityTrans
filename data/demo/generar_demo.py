# -*- coding: utf-8 -*-
"""
SECURITYTRANS — Generador de datos DEMO (simulados)
====================================================
Genera un conjunto de datos operativos de transporte terrestre en México,
internamente consistente y reproducible, para alimentar el módulo
"Data Management" (6 paneles, 58 análisis).

Principios:
  - Semilla fija para reproducibilidad.
  - Datos 100 % ficticios (nombres, vehículos, rutas y montos).
  - Marcado explícito "DATOS DEMO — INFORMACIÓN SIMULADA".
  - Métricas derivables (km/L, L/100km, MXN/km, ingresos, costos, margen,
    puntualidad, utilización) en lugar de valores arbitrarios.
  - El ingreso se deriva de un margen objetivo realista que depende de la
    demanda de la ruta y de la eficiencia del conductor/vehículo.
  - Totales consistentes con las tablas de detalle (combustible,
    mantenimientos, casetas, incidentes).

Uso:
  python generar_demo.py
"""

import json
import random
from datetime import date, timedelta
from pathlib import Path

# ---------------------------------------------------------------------------
# Configuración reproducible
# ---------------------------------------------------------------------------
SEMILLA = 20260615
random.seed(SEMILLA)

DIR_SALIDA = Path(__file__).resolve().parent

FECHA_FIN = date(2026, 11, 21)          # fin del historial (ancla fija)
FECHA_INICIO = FECHA_FIN - timedelta(days=364)   # 12 meses

N_CONDUCTORES = 35
N_VEHICULOS = 25
N_RUTAS = 18
N_SERVICIOS = 1200
N_COMBUSTIBLE = 2500
N_MANTENIMIENTOS = 180
N_CASETAS = 900
N_INCIDENTES = 45

MARCA_DEMO = "DATOS DEMO — INFORMACIÓN SIMULADA"

# Margen objetivo base y límites (fracción de ingreso)
MARGEN_BASE = 0.10
MARGEN_MIN = -0.25
MARGEN_MAX = 0.40
OTROS_GASTOS_KM = (2.2, 3.4)   # gastos generales por km (sueldos, admin, seguros)

# ---------------------------------------------------------------------------
# Catálogos de nombres ficticios
# ---------------------------------------------------------------------------
NOMBRES = ["Carlos", "Miguel", "José", "Luis", "Roberto", "Alejandro", "Fernando",
           "Javier", "Ricardo", "Sergio", "Andrés", "Eduardo", "Héctor", "Raúl",
           "Óscar", "Manuel", "Arturo", "Gustavo", "Iván", "Jorge", "Mario",
           "Pedro", "Rubén", "Salvador", "Víctor", "Adrián", "Alberto", "Armando",
           "César", "Daniel", "Emilio", "Felipe", "Gerardo", "Hugo", "Ignacio"]
APELLIDOS = ["Ramírez", "Hernández", "García", "Martínez", "López", "González",
             "Pérez", "Rodríguez", "Sánchez", "Torres", "Flores", "Morales",
             "Díaz", "Castillo", "Mendoza", "Ruiz", "Jiménez", "Vargas", "Castro",
             "Reyes", "Ortiz", "Guerrero", "Aguilar", "Romero", "Silva"]

# (perfil, factor_consumo, ralenti_base_h, margen_ajuste)
PERFILES_CONDUCTOR = [
    ("Altamente eficiente", 0.88, 0.3, 0.07),
    ("Eficiente", 0.95, 0.4, 0.04),
    ("Convencional", 1.02, 0.6, 0.00),
    ("Velocidades elevadas", 1.08, 0.6, -0.06),
    ("Conducción irregular", 1.15, 0.9, -0.12),
    ("Ralentí prolongado", 1.02, 2.2, -0.02),
]

MARCAS_MODELOS = [
    ("Freightliner", "M2 106"), ("Freightliner", "Cascadia"), ("Kenworth", "T680"),
    ("Kenworth", "T880"), ("International", "LT625"), ("International", "HV513"),
    ("Volvo", "VNL 760"), ("Scania", "R450"), ("Mercedes-Benz", "Actros 2645"),
    ("Dina", "HTQ 25"), ("Freightliner", "M2 112"), ("Kenworth", "T800"),
    ("International", "HV607"), ("Volvo", "VNL 860"), ("Scania", "R500"),
    ("Mercedes-Benz", "Atego 1725"), ("Dina", "HTQ 30"), ("Freightliner", "114SD"),
    ("Kenworth", "W900"), ("Volvo", "VNL 300"), ("International", "LT625 SBA"),
    ("Scania", "G450"), ("Mercedes-Benz", "Actros 3342"), ("Dina", "HTQ 33"),
    ("Kenworth", "T370"),
]

# categoria: (rend base km/L, capacidad_kg, caseta_rate MXN/km, manten_rate MXN/km)
CATEGORIAS = {
    "Rabón": (4.4, 12000, 0.9, 1.6),
    "Torton": (3.8, 18000, 1.2, 2.0),
    "Tráiler": (3.1, 30000, 1.7, 2.5),
    "Full (Doble remolque)": (2.7, 40000, 2.2, 3.0),
}
DISTRIBUCION_CATEGORIAS = ["Rabón"] * 8 + ["Torton"] * 7 + ["Tráiler"] * 7 + ["Full (Doble remolque)"] * 3

# rutas: (origen, destino, distancia_km, caseta_rate, margen_factor)
RUTAS_DEF = [
    ("Ciudad de México", "Monterrey", 925, 2.2, 0.15),
    ("Ciudad de México", "Guadalajara", 540, 1.8, 0.10),
    ("Ciudad de México", "Querétaro", 215, 0.9, 0.02),
    ("Ciudad de México", "Veracruz", 400, 1.5, 0.05),
    ("Ciudad de México", "Puebla", 130, 0.6, -0.02),
    ("Guadalajara", "Monterrey", 780, 2.0, 0.08),
    ("Monterrey", "Nuevo Laredo", 220, 0.8, -0.04),
    ("Ciudad de México", "Mérida", 1300, 2.5, 0.18),
    ("Guadalajara", "Tijuana", 2000, 2.6, 0.20),
    ("Ciudad de México", "Acapulco", 380, 1.3, 0.03),
    ("Querétaro", "San Luis Potosí", 210, 0.9, -0.06),
    ("Ciudad de México", "Toluca", 65, 0.4, -0.08),
    ("Veracruz", "Puebla", 280, 1.1, 0.00),
    ("Monterrey", "Tampico", 520, 1.4, 0.05),
    ("Guadalajara", "León", 220, 0.8, -0.03),
    ("Ciudad de México", "Oaxaca", 460, 1.4, 0.06),
    ("Mérida", "Cancún", 300, 1.0, 0.02),
    ("Ciudad de México", "Chihuahua", 1450, 2.4, 0.14),
]

PRECIO_DIESEL_MIN = 22.5
PRECIO_DIESEL_MAX = 25.8


def round2(v):
    return round(v, 2)


# ---------------------------------------------------------------------------
# Generación de entidades
# ---------------------------------------------------------------------------
def generar_conductores():
    usados = set()
    conductores = []
    for i in range(N_CONDUCTORES):
        while True:
            nombre = f"{random.choice(NOMBRES)} {random.choice(APELLIDOS)} {random.choice(APELLIDOS)}"
            if nombre not in usados:
                usados.add(nombre)
                break
        perfil, factor, ralenti, margen_ajuste = random.choices(
            PERFILES_CONDUCTOR, weights=[6, 8, 8, 5, 5, 3], k=1)[0]
        conductores.append({
            "ID_OPERADOR": f"OPR-{i + 1:04d}",
            "nombre": nombre,
            "perfil": perfil,
            "factor_consumo": factor,
            "ralenti_base_h": ralenti,
            "margen_ajuste": margen_ajuste,
            "naturaleza": "DEMO",
        })
    return conductores


def generar_vehiculos():
    vehiculos = []
    marcas = MARCAS_MODELOS[:]
    random.shuffle(marcas)
    for i in range(N_VEHICULOS):
        categoria = DISTRIBUCION_CATEGORIAS[i]
        base_kmL, capacidad, caseta_rate, manten_rate = CATEGORIAS[categoria]
        marca, modelo = marcas[i]
        rend = base_kmL * random.uniform(0.92, 1.08)
        año = random.randint(2015, 2024)
        margen_ajuste = 0.03 if año >= 2022 else (-0.04 if año <= 2018 else 0.0)
        vehiculos.append({
            "ID_VEHICULO": f"VEH-{i + 1:04d}",
            "unidad_referencia": f"D-{random.randint(100, 999)}",
            "marca": marca,
            "modelo_operativo": f"{marca} {modelo}",
            "modelo_cientifico": modelo,
            "placa_ficticia": f"{random.randint(10, 99)}-{random.choice('ABCDEFGH')}{random.choice('ABCDEFGH')}-{random.randint(10, 99)}",
            "categoria": categoria,
            "carroceria": categoria,
            "combustible": "Diésel",
            "capacidad_tanque_L": random.choice([250, 300, 350, 400, 450]),
            "capacidad_carga_kg": capacidad,
            "masa_vacio_kg": capacidad * random.uniform(0.35, 0.5),
            "rend_admin_ref_kmL": round2(rend),
            "caseta_rate_MXN_km": caseta_rate,
            "manten_rate_MXN_km": manten_rate,
            "margen_ajuste": margen_ajuste,
            "año": año,
            "blindaje": random.choice(["II", "III", "IV"]),
            "motor": f"{random.choice(['Cummins', 'Detroit', 'Volvo', 'Scania'])} {random.choice(['B6.7', 'X15', 'DD13', 'D13', 'R450'])}",
            "potencia_kW": random.randint(160, 420),
            "transmision": random.choice(["Allison 2500", "Eaton 10 vel.", "Eaton 13 vel.", "Automática 12 vel."]),
            "naturaleza": "DEMO",
        })
    return vehiculos


def generar_rutas():
    rutas = []
    for i, (origen, destino, dist, caseta_rate, margen_factor) in enumerate(RUTAS_DEF):
        rutas.append({
            "ID_RUTA": f"RUT-{i + 1:04d}",
            "origen": origen,
            "destino": destino,
            "sentido": f"{origen} → {destino}",
            "distancia_administrativa_km": dist,
            "caseta_rate_MXN_km": caseta_rate,
            "margen_factor": margen_factor,
            "naturaleza": "DEMO",
        })
    return rutas


def gen_fecha():
    return FECHA_INICIO + timedelta(days=random.randint(0, (FECHA_FIN - FECHA_INICIO).days))


# ---------------------------------------------------------------------------
# Generación de servicios
# ---------------------------------------------------------------------------
def generar_servicios(conductores, vehiculos, rutas):
    map_c = {c["ID_OPERADOR"]: c for c in conductores}
    map_v = {v["ID_VEHICULO"]: v for v in vehiculos}
    map_r = {r["ID_RUTA"]: r for r in rutas}
    servicios = []
    idx_c = 0
    for i in range(N_SERVICIOS):
        conductor = conductores[(idx_c + random.randint(0, 2)) % N_CONDUCTORES]
        idx_c += 1
        vehiculo = random.choice(vehiculos)
        ruta = random.choice(rutas)

        fecha = gen_fecha()
        while fecha.weekday() >= 5:
            fecha = gen_fecha()

        categoria = vehiculo["categoria"]
        base_kmL, capacidad, caseta_rate, manten_rate = CATEGORIAS[categoria]

        dist_admin = ruta["distancia_administrativa_km"]
        distancia = dist_admin * random.uniform(0.98, 1.07)
        carga_kg = capacidad * random.uniform(0.4, 1.0)

        # eficiencia real (km/L)
        factor_carga = 1.0 - 0.15 * (carga_kg / capacidad)
        km_por_l = max(vehiculo["rend_admin_ref_kmL"] * conductor["factor_consumo"] * factor_carga, 1.6)
        litros_consumidos = distancia / km_por_l

        precio_L = random.uniform(PRECIO_DIESEL_MIN, PRECIO_DIESEL_MAX)

        # diferencia no explicada (anomalías poco frecuentes)
        diferencia = 0.0
        if random.random() < 0.04:
            diferencia = litros_consumidos * random.uniform(0.03, 0.12)
        consumo_motor = litros_consumidos - diferencia
        consumo_ralenti = conductor["ralenti_base_h"] * random.uniform(0.8, 1.6) * 2.0

        litros_presupuestados = litros_consumidos * 1.05
        costo_combustible = litros_consumidos * precio_L
        presupuesto = litros_presupuestados * precio_L

        # costos
        costo_casetas = distancia * caseta_rate * random.uniform(0.85, 1.15)
        costo_mantenimiento = distancia * manten_rate * random.uniform(0.9, 1.1)
        otros_gastos = distancia * random.uniform(*OTROS_GASTOS_KM)
        costo_operativo = costo_combustible + costo_casetas + costo_mantenimiento + otros_gastos

        # margen objetivo => ingreso derivado (matemáticamente consistente)
        margen = MARGEN_BASE + ruta["margen_factor"] + conductor["margen_ajuste"] + vehiculo["margen_ajuste"] + random.uniform(-0.03, 0.03)
        margen = max(MARGEN_MIN, min(MARGEN_MAX, margen))
        ingresos = costo_operativo / (1.0 - margen)
        utilidad = ingresos - costo_operativo
        margen_pct = utilidad / ingresos * 100.0

        # tiempos
        velocidad = random.uniform(58, 88) * random.uniform(0.92, 1.08)
        tiempo_movimiento = distancia / velocidad
        tiempo_ralenti = conductor["ralenti_base_h"] * random.uniform(0.7, 1.8)
        n_paradas = random.randint(1, 8)
        tiempo_paradas = n_paradas * random.uniform(0.2, 0.5)
        tiempo_total = tiempo_movimiento + tiempo_ralenti + tiempo_paradas
        velocidad_plan = random.uniform(66, 74)
        tiempo_planificado = dist_admin / velocidad_plan * 1.08
        retraso = max(0.0, tiempo_total - tiempo_planificado)

        dias_atras = (FECHA_FIN - fecha).days
        estado = "ACTIVO" if dias_atras <= 7 else "CERRADO"

        fallas = random.randint(1, 3) if random.random() < 0.10 else 0
        incidencias = 0
        if diferencia > 0 or retraso > 2 or fallas > 0:
            incidencias = random.randint(1, 2)

        litros_cargados = litros_consumidos * random.uniform(0.75, 1.15)

        servicios.append({
            "folio": f"SRV-{i + 1:06d}",
            "id_operador": conductor["ID_OPERADOR"],
            "operador": conductor["nombre"],
            "perfil": conductor["perfil"],
            "id_vehiculo": vehiculo["ID_VEHICULO"],
            "id_ruta": ruta["ID_RUTA"],
            "fecha": fecha.isoformat(),
            "origen": ruta["origen"],
            "destino": ruta["destino"],
            "naturaleza": "DEMO",
            "distancia_km": round2(distancia),
            "distancia_planificada_km": round2(dist_admin),
            "tiempo_planificado_h": round2(tiempo_planificado),
            "tiempo_total_h": round2(tiempo_total),
            "tiempo_movimiento_h": round2(tiempo_movimiento),
            "tiempo_ralenti_h": round2(tiempo_ralenti),
            "n_paradas": n_paradas,
            "velocidad_promedio_kmh": round2(distancia / tiempo_movimiento) if tiempo_movimiento else 0.0,
            "velocidad_maxima_kmh": round2(velocidad * 1.25),
            "carga_kg": round2(carga_kg),
            "litros_presupuestados_L": round2(litros_presupuestados),
            "consumo_motor_L": round2(consumo_motor),
            "consumo_total_L": round2(litros_consumidos),
            "consumo_ralenti_L": round2(consumo_ralenti),
            "litros_cargados_L": round2(litros_cargados),
            "diferencia_no_explicada_L": round2(diferencia),
            "rendimiento_balance_tanque_kmL": round2(distancia / litros_consumidos),
            "rendimiento_motor_kmL": round2(distancia / consumo_motor) if consumo_motor else 0.0,
            "consumo_L_100km": round2(litros_consumidos / distancia * 100),
            "precio_promedio_L_MXN": round2(precio_L),
            "presupuesto_MXN": round2(presupuesto),
            "costo_consumo_MXN": round2(costo_combustible),
            "costo_casetas_MXN": round2(costo_casetas),
            "costo_mantenimiento_MXN": round2(costo_mantenimiento),
            "otros_gastos_MXN": round2(otros_gastos),
            "costo_operativo_total_MXN": round2(costo_operativo),
            "costo_por_km_MXN": round2(costo_combustible / distancia),
            "ahorro_sobrecosto_MXN": round2(presupuesto - costo_combustible),
            "ingresos_MXN": round2(ingresos),
            "utilidad_MXN": round2(utilidad),
            "margen_pct": round2(margen_pct),
            "estado_servicio": estado,
            "retraso_h": round2(retraso),
            "puntualidad_pct": round2(max(0.0, 100.0 - retraso / tiempo_planificado * 100)),
            "fallas": fallas,
            "incidencias": incidencias,
        })
    return servicios


# ---------------------------------------------------------------------------
# Tablas de detalle consistentes con los servicios
# ---------------------------------------------------------------------------
def generar_combustible(servicios):
    por_vehiculo = {}
    for s in servicios:
        por_vehiculo.setdefault(s["id_vehiculo"], []).append(s)
    registros = []
    for vid, lista in por_vehiculo.items():
        n = N_COMBUSTIBLE // N_VEHICULOS
        for _ in range(n):
            s = random.choice(lista)
            litros = random.uniform(150, 350)
            precio = random.uniform(PRECIO_DIESEL_MIN, PRECIO_DIESEL_MAX)
            registros.append({
                "id": f"CARGA-{len(registros) + 1:06d}",
                "id_vehiculo": vid,
                "id_servicio": s["folio"],
                "fecha": s["fecha"],
                "litros": round2(litros),
                "precio_por_L_MXN": round2(precio),
                "importe_MXN": round2(litros * precio),
                "estacion": random.choice(["PEMEX 8442", "G500 2011", "BP 310", "Shell 5520", "Mobil 708"]),
                "naturaleza": "DEMO",
            })
    return registros


def generar_mantenimientos(servicios, vehiculos):
    por_vehiculo = {}
    for s in servicios:
        por_vehiculo.setdefault(s["id_vehiculo"], []).append(s)
    registros = []
    TIPOS = ["Preventivo", "Correctivo", "Frenos", "Neumáticos", "Aceite y filtros", "Suspensión", "Sistema eléctrico"]
    for vid in [v["ID_VEHICULO"] for v in vehiculos]:
        lista = por_vehiculo.get(vid, [])
        total_mant = sum(s["costo_mantenimiento_MXN"] for s in lista)
        n = max(1, N_MANTENIMIENTOS // N_VEHICULOS)
        pesos = [random.uniform(0.4, 1.6) for _ in range(n)]
        suma = sum(pesos)
        for k in range(n):
            costo = total_mant * pesos[k] / suma
            s = random.choice(lista)
            registros.append({
                "id": f"MANT-{len(registros) + 1:06d}",
                "id_vehiculo": vid,
                "id_servicio": s["folio"],
                "fecha": s["fecha"],
                "tipo": random.choice(TIPOS),
                "costo_MXN": round2(costo),
                "kilometraje_km": random.randint(50000, 700000),
                "naturaleza": "DEMO",
            })
    return registros


def generar_casetas(servicios):
    registros = []
    CASETAS = ["Tepotzotlán", "San Martín", "Palmillas", "Esperanza", "Perote", "Fortín",
               "Zapotlanejo", "La Joya", "Ciudad Valles", "Mata", "Córdoba", "Acatzingo"]
    for s in servicios:
        if s["costo_casetas_MXN"] <= 0:
            continue
        n = 1 if random.random() < 0.6 else 2
        pesos = [random.uniform(0.4, 1.0) for _ in range(n)]
        suma = sum(pesos)
        for k in range(n):
            importe = s["costo_casetas_MXN"] * pesos[k] / suma
            registros.append({
                "id": f"CASETA-{len(registros) + 1:06d}",
                "id_servicio": s["folio"],
                "id_ruta": s["id_ruta"],
                "fecha": s["fecha"],
                "caseta": random.choice(CASETAS),
                "importe_MXN": round2(importe),
                "naturaleza": "DEMO",
            })
        if len(registros) >= N_CASETAS:
            break
    return registros


def generar_incidentes(servicios):
    registros = []
    TIPOS = ["Retraso", "Desvío de combustible", "Falla mecánica", "Accidente menor", "Documentación incompleta"]
    candidatos = [s for s in servicios if s["incidencias"] > 0]
    random.shuffle(candidatos)
    for i in range(min(N_INCIDENTES, len(candidatos))):
        s = candidatos[i]
        registros.append({
            "id": f"INCI-{i + 1:05d}",
            "id_servicio": s["folio"],
            "id_operador": s["id_operador"],
            "id_vehiculo": s["id_vehiculo"],
            "fecha": s["fecha"],
            "tipo": random.choice(TIPOS),
            "severidad": random.choice(["BAJA", "MEDIA", "ALTA"]),
            "descripcion": "Incidente simulado para demostración.",
            "naturaleza": "DEMO",
        })
    return registros


# ---------------------------------------------------------------------------
# Escritura
# ---------------------------------------------------------------------------
def escribir(nombre, datos):
    ruta = DIR_SALIDA / nombre
    with open(ruta, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=1)
    return ruta


def main():
    print("Generando datos DEMO...")
    conductores = generar_conductores()
    vehiculos = generar_vehiculos()
    rutas = generar_rutas()
    servicios = generar_servicios(conductores, vehiculos, rutas)
    combustible = generar_combustible(servicios)
    mantenimientos = generar_mantenimientos(servicios, vehiculos)
    casetas = generar_casetas(servicios)
    incidentes = generar_incidentes(servicios)

    manifest = {
        "nombre": "SECURITYTRANS — DATA MANAGEMENT · DATOS DEMO",
        "marca": MARCA_DEMO,
        "descripcion": "Conjunto de datos operativos de transporte terrestre simulados para demostración del módulo Data Management. Todos los registros son ficticios.",
        "semilla": SEMILLA,
        "fecha_generacion": date.today().isoformat(),
        "periodo": [FECHA_INICIO.isoformat(), FECHA_FIN.isoformat()],
        "conteos": {
            "conductores": len(conductores),
            "vehiculos": len(vehiculos),
            "rutas": len(rutas),
            "servicios": len(servicios),
            "combustible": len(combustible),
            "mantenimientos": len(mantenimientos),
            "casetas": len(casetas),
            "incidentes": len(incidentes),
        },
        "advertencia": "INFORMACIÓN SIMULADA. No corresponde a personas, vehículos ni operaciones reales. No es un registro operativo ni financiero válido.",
    }

    escribir("conductores.json", conductores)
    escribir("vehiculos.json", vehiculos)
    escribir("rutas.json", rutas)
    escribir("servicios.json", servicios)
    escribir("combustible.json", combustible)
    escribir("mantenimientos.json", mantenimientos)
    escribir("casetas.json", casetas)
    escribir("incidentes.json", incidentes)
    escribir("manifest.json", manifest)

    margenes = [s["margen_pct"] for s in servicios]
    neg = sum(1 for m in margenes if m < 0)
    print(f"  conductores: {len(conductores)}  vehiculos: {len(vehiculos)}  rutas: {len(rutas)}")
    print(f"  servicios: {len(servicios)}  combustible: {len(combustible)}  mantenimientos: {len(mantenimientos)}  casetas: {len(casetas)}  incidentes: {len(incidentes)}")
    print(f"  Margen: min={min(margenes):.2f}%  máx={max(margenes):.2f}%  promedio={sum(margenes)/len(margenes):.2f}%  negativos={neg} ({neg*100//len(margenes)}%)")
    print(f"  Salida: {DIR_SALIDA}")


if __name__ == "__main__":
    main()
