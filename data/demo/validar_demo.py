# -*- coding: utf-8 -*-
"""
SECURITYTRANS — Validador de calidad de datos DEMO
===================================================
Verificaciones reproducibles sobre los JSON generados en data/demo/.
Uso: python validar_demo.py
"""

import json
import math
import sys
from pathlib import Path

DIR = Path(__file__).resolve().parent

RESULTADOS = []


def check(nombre, ok, detalle=""):
    RESULTADOS.append((nombre, bool(ok), detalle))


def cargar(nombre):
    with open(DIR / nombre, encoding="utf-8") as f:
        return json.load(f)


def es_finito(v):
    return isinstance(v, (int, float)) and math.isfinite(v)


# 1. JSON válido
try:
    manifest = cargar("manifest.json")
    conductores = cargar("conductores.json")
    vehiculos = cargar("vehiculos.json")
    rutas = cargar("rutas.json")
    servicios = cargar("servicios.json")
    combustible = cargar("combustible.json")
    mantenimientos = cargar("mantenimientos.json")
    casetas = cargar("casetas.json")
    incidentes = cargar("incidentes.json")
    check("JSON válido", True)
except Exception as e:
    check("JSON válido", False, str(e))
    print("RESULTADO: FALLAS")
    sys.exit(1)

# 12. Marca de datos simulados
check("Marca DEMO en manifest", manifest.get("marca") == "DATOS DEMO — INFORMACIÓN SIMULADA")
check("naturaleza DEMO en servicios", all(s.get("naturaleza") == "DEMO" for s in servicios))

# 2. IDs únicos
def ids_unicos(nombre, lista, clave):
    vals = [x[clave] for x in lista]
    check(f"IDs únicos en {nombre}", len(vals) == len(set(vals)))

ids_unicos("conductores", conductores, "ID_OPERADOR")
ids_unicos("vehiculos", vehiculos, "ID_VEHICULO")
ids_unicos("rutas", rutas, "ID_RUTA")
ids_unicos("servicios", servicios, "folio")
ids_unicos("combustible", combustible, "id")
ids_unicos("mantenimientos", mantenimientos, "id")
ids_unicos("casetas", casetas, "id")
ids_unicos("incidentes", incidentes, "id")

# 3. FKs completas
set_c = {c["ID_OPERADOR"] for c in conductores}
set_v = {v["ID_VEHICULO"] for v in vehiculos}
set_r = {r["ID_RUTA"] for r in rutas}
set_s = {s["folio"] for s in servicios}

check("FK servicios->conductores", all(s["id_operador"] in set_c for s in servicios))
check("FK servicios->vehiculos", all(s["id_vehiculo"] in set_v for s in servicios))
check("FK servicios->rutas", all(s["id_ruta"] in set_r for s in servicios))
check("FK incidentes->servicios", all(i["id_servicio"] in set_s for i in incidentes))
check("FK casetas->servicios", all(c["id_servicio"] in set_s for c in casetas))
check("FK mantenimientos->vehiculos", all(m["id_vehiculo"] in set_v for m in mantenimientos))
check("FK combustible->vehiculos", all(c["id_vehiculo"] in set_v for c in combustible))

# 4. Fechas dentro del periodo
f_inicio = manifest["periodo"][0]
f_fin = manifest["periodo"][1]
check("Fechas de servicios en periodo", all(f_inicio <= s["fecha"] <= f_fin for s in servicios))

# 5. Rangos y finitud
campos_numericos = [
    "distancia_km", "tiempo_total_h", "litros_presupuestados_L", "consumo_total_L",
    "consumo_L_100km", "presupuesto_MXN", "costo_consumo_MXN", "costo_casetas_MXN",
    "costo_mantenimiento_MXN", "costo_operativo_total_MXN", "ingresos_MXN",
    "utilidad_MXN", "margen_pct", "costo_por_km_MXN", "ahorro_sobrecosto_MXN",
    "rendimiento_balance_tanque_kmL", "tiempo_planificado_h", "retraso_h",
    "carga_kg", "fallas", "incidencias",
]
mal = []
for s in servicios:
    for c in campos_numericos:
        if c in s and s[c] is not None and not es_finito(s[c]):
            mal.append((s["folio"], c))
check("Sin NaN/Inf en servicios", not mal, f"{len(mal)} valores inválidos")
check("Montos no negativos", all(
    s["costo_consumo_MXN"] >= 0 and s["ingresos_MXN"] >= 0 and s["costo_operativo_total_MXN"] >= 0
    for s in servicios))

# 6. Combustible vs km consistente
def rango_ok(s):
    if s["consumo_total_L"] <= 0 or s["distancia_km"] <= 0:
        return False
    kml = s["distancia_km"] / s["consumo_total_L"]
    return 1.5 <= kml <= 7.0

check("km/L en rango razonable (1.5–7)", all(rango_ok(s) for s in servicios))
check("rendimiento coherente con km/L",
      all(abs(s["rendimiento_balance_tanque_kmL"] - s["distancia_km"] / s["consumo_total_L"]) < 0.05
          for s in servicios))

# 7. Ingresos/costo/utilidad consistentes
tol = 0.5  # tolerancia de redondeo (MXN)
check("utilidad = ingresos - costo_operativo",
      all(abs(s["utilidad_MXN"] - (s["ingresos_MXN"] - s["costo_operativo_total_MXN"])) < tol for s in servicios))
check("margen coherente",
      all(abs(s["margen_pct"] - (s["utilidad_MXN"] / s["ingresos_MXN"] * 100)) < 0.5 for s in servicios))
check("costo_operativo = combustible + casetas + mantenimiento + otros",
      all(abs(s["costo_operativo_total_MXN"] - (s["costo_consumo_MXN"] + s["costo_casetas_MXN"] + s["costo_mantenimiento_MXN"] + s["otros_gastos_MXN"])) < tol for s in servicios))
check("margen en rango razonable (-30%..50%)",
      all(-30.0 <= s["margen_pct"] <= 50.0 for s in servicios))

# 8. Sin duplicados de folio (ya cubierto en IDs únicos)
check("Sin folios duplicados", len(set(s["folio"] for s in servicios)) == len(servicios))

# 9. Mantenimiento sin conflicto (fecha dentro del periodo)
check("Mantenimientos en periodo", all(f_inicio <= m["fecha"] <= f_fin for m in mantenimientos))

# 10. Suficientes datos comparables por módulo
check(">=2 vehículos para comparar", len(vehiculos) >= 2)
check(">=2 rutas para comparar", len(rutas) >= 2)
check(">=2 conductores para comparar", len(conductores) >= 2)
check("Hay servicios con ingresos", any(s["ingresos_MXN"] > 0 for s in servicios))
check("Hay casetas", len(casetas) >= 100)
check("Hay mantenimientos", len(mantenimientos) >= 50)
check("Hay incidentes", len(incidentes) >= 10)
check("Hay fallas", any(s["fallas"] > 0 for s in servicios))
check("Hay estados ACTIVO y CERRADO", {s["estado_servicio"] for s in servicios} >= {"ACTIVO", "CERRADO"})

# 11. Campos requeridos por los 58 análisis
requeridos = [
    "folio", "operador", "id_operador", "id_vehiculo", "id_ruta", "fecha", "origen", "destino",
    "distancia_km", "distancia_planificada_km", "tiempo_total_h", "tiempo_movimiento_h",
    "tiempo_ralenti_h", "n_paradas", "velocidad_promedio_kmh", "velocidad_maxima_kmh",
    "carga_kg", "litros_presupuestados_L", "consumo_motor_L", "consumo_total_L",
    "consumo_ralenti_L", "litros_cargados_L", "diferencia_no_explicada_L",
    "rendimiento_balance_tanque_kmL", "rendimiento_motor_kmL", "consumo_L_100km",
    "presupuesto_MXN", "costo_consumo_MXN", "costo_casetas_MXN", "costo_mantenimiento_MXN",
    "costo_operativo_total_MXN", "costo_por_km_MXN", "ahorro_sobrecosto_MXN",
    "otros_gastos_MXN",
    "ingresos_MXN", "utilidad_MXN", "margen_pct", "estado_servicio", "retraso_h",
    "puntualidad_pct", "fallas", "incidencias",
]
faltantes = [c for c in requeridos if not all(c in s for s in servicios)]
check("Campos requeridos completos", not faltantes, f"faltantes={faltantes}")

# Reporte
print("=" * 60)
print("REPORTE DE CALIDAD DE DATOS DEMO")
print("=" * 60)
todo_ok = True
for nombre, ok, detalle in RESULTADOS:
    todo_ok = todo_ok and ok
    print(("PASS" if ok else "FAIL") + "  " + nombre + ("  [" + detalle + "]" if detalle else ""))

# Resumen de márgenes (solo informativo)
margenes = [s["margen_pct"] for s in servicios]
negativos = sum(1 for m in margenes if m < 0)
print("-" * 60)
print(f"Margen: min={min(margenes):.2f}%  máx={max(margenes):.2f}%  promedio={sum(margenes)/len(margenes):.2f}%  negativos={negativos}")
print(f"Estados: { {e: sum(1 for s in servicios if s['estado_servicio']==e) for e in ('ACTIVO','CERRADO')} }")
print("=" * 60)
print("RESULTADO:", "OK" if todo_ok else "FALLAS")
sys.exit(0 if todo_ok else 1)
