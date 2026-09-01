// Inicialização do Mapa com ArcGIS Satélite para evitar bloqueio local do OSM
const map = L.map('map').setView([-7.62, -38.75], 14);

L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri'
}).addTo(map);

let geojsonLayer = null;
let dadosPoligono = null;

proj4.defs("EPSG:31984", "+proj=utm +zone=24 +south +datum=SIRGAS2000 +units=m +no_defs");

document.getElementById('fileInput').addEventListener('change', function(e) {
    if (e.target.files.length > 0) {
        document.getElementById('btnGerar').disabled = false;
        processarKML();
    }
});

function processarKML() {
    const fileInput = document.getElementById('fileInput');
    if (fileInput.files.length === 0) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const parser = new DOMParser();
        const kmlDom = parser.parseFromString(e.target.result, 'text/xml');
        const converted = toGeoJSON.kml(kmlDom);

        dadosPoligono = converted.features.find(f => f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon');
        if (!dadosPoligono) {
            alert("Polígono não encontrado no KML.");
            return;
        }

        if (geojsonLayer) map.removeLayer(geojsonLayer);

        geojsonLayer = L.geoJSON(dadosPoligono, {
            style: { color: "#ff0000", weight: 3, fillOpacity: 0.2 }
        }).addTo(map);

        map.fitBounds(geojsonLayer.getBounds());
        
        setTimeout(() => {
            map.invalidateSize();
        }, 150);

        executarCalculos(dadosPoligono);
    };
    reader.readAsText(fileInput.files[0]);
}

function calcularAzimute(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    let angulo = Math.atan2(dx, dy) * (180 / Math.PI);
    if (angulo < 0) angulo += 360;
    const g = Math.floor(angulo);
    const m = Math.floor((angulo - g) * 60);
    const s = Math.round(((angulo - g) * 60 - m) * 60);
    return `${g}°${m}'${s}"`;
}

function executarCalculos(feature) {
    const coordsLonLat = feature.geometry.coordinates[0];
    const areaM2 = turf.area(feature);
    const areaHectares = areaM2 / 10000;
    const perimetroM = turf.length(feature, {units: 'meters'});

    let verticesUTM = [];
    for (let i = 0; i < coordsLonLat.length - 1; i++) {
        const utm = proj4("EPSG:31984", [coordsLonLat[i][0], coordsLonLat[i][1]]);
        verticesUTM.push({ id: `P${i + 1}`, e: utm[0], n: utm[1] });
    }

    const prop = document.getElementById('propriedade').value || "[PROPRIEDADE]";
    const proprietario = document.getElementById('proprietario').value || "[PROPRIETÁRIO]";
    const matricula = document.getElementById('matricula').value || "[MATRÍCULA]";
    const comarca = document.getElementById('comarca').value || "[COMARCA]";
    const prof = document.getElementById('profissional').value || "[PROFISSIONAL]";
    const crea = document.getElementById('crea').value || "[CREA]";

    let memorial = `MEMORIAL DESCRITIVO\n\nIMÓVEL: ${prop}\nPROPRIETÁRIO: ${proprietario}\nMATRÍCULA: ${matricula}\nÁREA: ${areaHectares.toFixed(4)} ha (${areaM2.toFixed(2)} m²)\nPERÍMETRO: ${perimetroM.toFixed(2)} m\n\nDESCRIÇÃO:\n`;
    
    for (let i = 0; i < verticesUTM.length; i++) {
        const atual = verticesUTM[i];
        const proximo = verticesUTM[(i + 1) % verticesUTM.length];
        const dist = Math.hypot(proximo.e - atual.e, proximo.n - atual.n);
        const azim = calcularAzimute(atual.e, atual.n, proximo.e, proximo.n);
        memorial += `Do vértice ${atual.id}, de coordenadas E = ${atual.e.toFixed(3)} m e N = ${atual.n.toFixed(3)} m; seguindo com azimute de ${azim} e distância de ${dist.toFixed(2)} m, chega-se ao vértice ${proximo.id}.\n`;
    }

    memorial += `\nLocal e Data: ${comarca}, ${new Date().toLocaleDateString('pt-BR')}\n\n__________________________________\n${prof}\n${crea}`;

    document.getElementById('memorialOutput').textContent = memorial;
    
    const btnImprMem = document.getElementById('btnImprMemorial');
    if (btnImprMem) btnImprMem.disabled = false;
}

function imprimirMemorial() {
    window.print();
}

function imprimirCroqui() {
    if (!geojsonLayer || !dadosPoligono) {
        alert("Por favor, carregue um arquivo KML antes de imprimir o croqui.");
        return;
    }

    const janelaImpressao = window.open('', '_blank', 'width=900,height=700');
    
    const propriedade = document.getElementById('propriedade').value || "Propriedade Sem Nome";
    const proprietario = document.getElementById('proprietario').value || "Não informado";
    const geoJsonString = JSON.stringify(dadosPoligono);

    janelaImpressao.document.write(`
        <html>
            <head>
                <title>Croqui de Localização - ${propriedade}</title>
                <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
                <style>
                    @page {
                        size: A4 portrait;
                        margin: 15mm;
                    }
                    body { 
                        font-family: Arial, sans-serif; 
                        margin: 0; 
                        padding: 0; 
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        text-align: center;
                        background: #fff;
                    }
                    .croqui-container {
                        width: 100%;
                        max-width: 180mm;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                    }
                    h2 { 
                        color: #0056b3; 
                        margin: 0 0 5px 0; 
                        font-size: 18pt;
                    }
                    p { 
                        margin: 0 0 15mm 0; 
                        font-size: 11pt; 
                        color: #555; 
                    }
                    #mapaImpressao { 
                        width: 100%; 
                        height: 135mm; 
                        border: 1px solid #ccc; 
                        border-radius: 4px; 
                    }
                    .vertice-label {
                        background: rgba(255, 255, 255, 0.9);
                        border: 1px solid #ff0000;
                        color: #d32f2f;
                        font-weight: bold;
                        font-size: 10px;
                        padding: 2px 4px;
                        border-radius: 3px;
                        white-space: nowrap;
                        box-shadow: 0 1px 3px rgba(0,0,0,0.3);
                    }
                    .btn-print { 
                        margin-top: 15px; 
                        padding: 10px 20px; 
                        background: #0056b3; 
                        color: white; 
                        border: none; 
                        border-radius: 4px; 
                        cursor: pointer; 
                        font-weight: bold; 
                    }
                    @media print {
                        .btn-print { display: none; }
                    }
                </style>
            </head>
            <body>
                <div class="croqui-container">
                    <h2>CROQUI DE LOCALIZAÇÃO E PERÍMETRO</h2>
                    <p><strong>Propriedade:</strong> ${propriedade} &nbsp;|&nbsp; <strong>Proprietário:</strong> ${proprietario}</p>
                    <div id="mapaImpressao"></div>
                    <button class="btn-print" onclick="window.print()">Imprimir Página</button>
                </div>
                
                <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
                <script>
                    const mapPrint = L.map('mapaImpressao', { zoomControl: false });
                    
                    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                        maxZoom: 19,
                        attribution: 'Tiles &copy; Esri'
                    }).addTo(mapPrint);

                    const poligonoData = ${geoJsonString};
                    const layerPrint = L.geoJSON(poligonoData, {
                        style: { color: "#ff0000", weight: 3, fillOpacity: 0.2 }
                    }).addTo(mapPrint);

                    const coords = poligonoData.geometry.coordinates[0];
                    for (let i = 0; i < coords.length - 1; i++) {
                        const lon = coords[i][0];
                        const lat = coords[i][1];
                        const nomeVertice = "P" + (i + 1);

                        const myIcon = L.divIcon({
                            className: 'vertice-label',
                            html: nomeVertice,
                            iconSize: [30, 16],
                            iconAnchor: [15, 8]
                        });

                        L.marker([lat, lon], { icon: myIcon }).addTo(mapPrint);
                    }

                    mapPrint.fitBounds(layerPrint.getBounds());

                    setTimeout(() => {
                        mapPrint.invalidateSize();
                        window.print();
                    }, 1200);
                </script>
            </body>
        </html>
    `);
    janelaImpressao.document.close();
}