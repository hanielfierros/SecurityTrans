# SECURITYTRANS — Plataforma Web (iData · Data Management)

Plataforma estática de análisis de datos operativos y gestión energética para el
vehículo Freightliner M2 (unidad de referencia D-179). Preparada para desplegarse
directamente en **GitHub Pages**.

## Contenido

- `index.html` — Portada de iData (Departamento de Ingeniería Aeronáutica Aplicada).
- `data-management.html` — Centro de Inteligencia Operativa con 6 módulos de análisis (58 análisis predefinidos), KPIs ejecutivos y funcionalidad de gestión energética.
- `fuel-management.html` — Redirige a `data-management.html` (compatibilidad hacia atrás).
- Datos: 7 servicios simulados (los datos reales de referencia NO se publican).

## Requisitos

- **No** se requiere servidor backend.
- **No** se requiere Python en GitHub Pages.
- **No** se requiere ejecutar `npm`.
- Solo un navegador moderno.

## Despliegue en GitHub Pages

1. Crear un repositorio en GitHub.
2. Subir todos los archivos de `SECURITYTRANS_WEB` **directamente a la raíz** de la rama `main`.
3. **No** subir la carpeta contenedora como subdirectorio.
4. Abrir **Settings**.
5. Abrir **Pages**.
6. Seleccionar **Deploy from a branch**.
7. Seleccionar la rama `main`.
8. Seleccionar la carpeta **/(root)**.
9. Guardar.
10. Esperar a que GitHub publique el sitio.
11. Acceder a la URL generada.
12. Verificar portada, navegación, temas y Dashboard.

## Notas importantes

- La información publicada es accesible según las condiciones de GitHub Pages.
- **No publicar los archivos Excel originales** (contienen datos operativos reales).
- Los datos del Dashboard son **simulados** y están marcados como tal.
- El mapa interactivo usa OpenStreetMap y **requiere conexión a Internet**.
- Sin ground truth de anomalías publicado.

## Licencias de terceros

- **Apache ECharts** — Apache License 2.0 (https://echarts.apache.org)
- **Leaflet** — BSD 2-Clause License (https://leafletjs.com)
- **OpenStreetMap** — ODbL (atribución requerida en el mapa)

© iData · Departamento de Ingeniería Aeronáutica Aplicada.
