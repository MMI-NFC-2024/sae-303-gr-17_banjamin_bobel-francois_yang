import { getDistance, computeComparaisonComplete, computeComparaisonPrix } from './trajetUtils.js';

export class ComparateurTrajet {
  constructor(communesUrl, garesUrl) {
    this.communesUrl = communesUrl;
    this.garesUrl = garesUrl;
    this.map = null;
    this.data = {};
  }

  async init() {
    if (!window.L) {
      await this._loadScript('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js');
    }

    const [communes, gares] = await Promise.all([
      fetch(this.communesUrl).then(r => { if (!r.ok) throw new Error('communes fetch ' + r.status); return r.json(); }),
      fetch(this.garesUrl).then(r => { if (!r.ok) throw new Error('gares fetch ' + r.status); return r.json(); })
    ]);

    this.data.communes = communes;
    this.data.gares = gares;

    this.map = L.map('map').setView([46.8, 2.5], 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(this.map);

    // Display quick gares markers (sample)
    const garesCount = gares.features?.length || 0;
    (gares.features || []).slice(0, 200).forEach(f => {
      const coords = f.geometry && f.geometry.coordinates;
      if (coords && coords.length >= 2) {
        L.circleMarker([coords[1], coords[0]], { radius: 3, fillColor: '#3b82f6', color: '#fff', weight: 0.8 }).addTo(this.map);
      }
    });

    // Update info box
    const info = document.getElementById('info');
    if (info) info.textContent = `Chargé : ${garesCount} gares, ${communes.length || 0} communes`;

    // Wire inputs
    this._wireInputs();
  }

  _wireInputs() {
    const dep = document.getElementById('communeDepart');
    const dest = document.getElementById('communeDest');
    const mode = document.getElementById('modeTransport');

    const renderAll = () => this.renderAll();

    // listen to both input and change so typing updates immediately
    if (dep) {
      dep.addEventListener('input', renderAll);
      dep.addEventListener('change', renderAll);
    }
    if (dest) {
      dest.addEventListener('input', renderAll);
      dest.addEventListener('change', renderAll);
    }
    if (mode) mode.addEventListener('change', renderAll);
  }

  findPointByName(name) {
    if (!name) return null;
    const list = this.data.communes || [];
    // normalize and strip diacritics (unicode combining marks range)
    const normalized = str => str && str.normalize ? str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() : str;
    const target = normalized(name.trim());
    let found = list.find(d => d.libelle_geographique && normalized(d.libelle_geographique).includes(target));
    if (!found) {
      // try matching on 'Nom' as fallback
      found = list.find(d => d.Nom && normalized(d.Nom).includes(target));
    }
    return found || null;
  }

  renderAll() {
    const depVal = document.getElementById('communeDepart').value;
    const destVal = document.getElementById('communeDest').value;
    const modeVal = document.getElementById('modeTransport').value;

    const pointDepart = this.findPointByName(depVal);
    const pointDest = this.findPointByName(destVal);

    const info = document.getElementById('info');
    if (!pointDepart || !pointDest) {
      if (info) info.textContent = 'Merci de saisir deux communes valides (une commune introuvable).';
      console.warn('Point not found', { depVal, destVal, pointDepart, pointDest });
      return;
    }

    const distanceTrajet = getDistance(pointDepart.Latitude, pointDepart.Longitude, pointDest.Latitude, pointDest.Longitude);

    // draw route
    if (this._routeLayer) this.map.removeLayer(this._routeLayer);
    this._routeLayer = L.polyline([[pointDepart.Latitude, pointDepart.Longitude], [pointDest.Latitude, pointDest.Longitude]], { color: '#9b59b6', weight: 5 }).addTo(this.map);
    this.map.fitBounds([[pointDepart.Latitude, pointDepart.Longitude], [pointDest.Latitude, pointDest.Longitude]]);

    // compute comparisons
    const comparaisonComplete = computeComparaisonComplete(distanceTrajet);
    const comparaisonPrix = computeComparaisonPrix(distanceTrajet);

  // diagnostics: log computed values and surface short summary
  console.debug('Comparateur:', { distanceTrajet, comparaisonComplete, comparaisonPrix });
  if (info) info.textContent = `Distance: ${distanceTrajet.toFixed(1)} km — Calculs prêts pour ${comparaisonComplete.length} modes.`;

  // render plots
  this._renderPlots(comparaisonComplete, comparaisonPrix, distanceTrajet);
  }

  async _renderPlots(comparaisonComplete, comparaisonPrix, distanceTrajet) {
    // Import Plot from a reliable ESM CDN
    let Plot;
    try {
      // Try esm.sh first (more reliable for ESM)
      const PlotModule = await import('https://esm.sh/@observablehq/plot@0.6');
      Plot = PlotModule;
    } catch (err) {
      console.error('Failed to load Observable Plot', err);
      const info = document.getElementById('info');
      if (info) info.textContent = 'Erreur: Impossible de charger la bibliothèque de graphiques.';
      return;
    }

    // ensure a consistent mode order for display
    const modeOrder = ['Train', 'Voiture thermique', 'Voiture électrique', 'Avion', 'Autocar'];
    const sortByOrder = arr => (arr || []).slice().sort((a, b) => modeOrder.indexOf(a.mode) - modeOrder.indexOf(b.mode));
    const cc = sortByOrder(comparaisonComplete);
    const cp = sortByOrder(comparaisonPrix);

    // helper to compute width based on container - ensure it fits within parent
    const computeWidth = (container) => {
      try {
        const parentWidth = container?.parentElement?.clientWidth || container?.clientWidth || 400;
        // Subtract padding/margins to ensure chart fits
        return Math.max(300, Math.round(parentWidth - 32));
      } catch (e) { return 400; }
    };

    // render a single plot safely
    const safePlot = (container, options) => {
      try {
        container.innerHTML = '';
        const node = Plot.plot(options);
        container.appendChild(node);
      } catch (err) {
        console.error('Failed to render plot', err, { container, options });
      }
    };

    // CO2
    const co2Container = document.getElementById('chart-co2');
    if (co2Container) {
      const width = computeWidth(co2Container);
      safePlot(co2Container, {
        width, height: 320, marginLeft: 60, marginBottom: 100, marginRight: 20,
        marks: [Plot.barY(cc, { x: 'mode', y: 'co2', fill: 'mode', tip: true }), Plot.ruleY([0])],
        color: { domain: modeOrder, range: ['#9b59b6','#e74c3c','#3498db','#f39c12','#2ecc71'], legend: true },
        x: { tickRotate: -45, label: 'Mode de transport' }, y: { grid: true, label: 'Émissions CO₂ (kg)' },
        title: `Émissions de CO₂ pour ${distanceTrajet.toFixed(0)} km`
      });
    }

    // Prix
    const prixContainer = document.getElementById('chart-prix');
    if (prixContainer) {
      const width = computeWidth(prixContainer);
      safePlot(prixContainer, {
        width, height: 320, marginLeft: 60, marginBottom: 100, marginRight: 20,
        marks: [Plot.barY(cp, { x: 'mode', y: 'prix', fill: 'mode', tip: true }), Plot.ruleY([0])],
        color: { domain: modeOrder, range: ['#9b59b6','#e74c3c','#3498db','#f39c12','#2ecc71'], legend: true },
        x: { tickRotate: -45, label: 'Mode de transport' }, y: { grid: true, label: 'Prix (€)' },
        title: `Coût du trajet pour ${distanceTrajet.toFixed(0)} km`
      });
    }

    // Temps
    const tempsContainer = document.getElementById('chart-temps');
    if (tempsContainer) {
      const width = computeWidth(tempsContainer);
      safePlot(tempsContainer, {
        width, height: 320, marginLeft: 60, marginBottom: 100, marginRight: 20,
        marks: [Plot.barY(cc, { x: 'mode', y: 'temps', fill: 'mode', tip: true }), Plot.ruleY([0])],
        color: { domain: modeOrder, range: ['#9b59b6','#e74c3c','#3498db','#f39c12','#2ecc71'], legend: true },
        x: { tickRotate: -45, label: 'Mode de transport' }, y: { grid: true, label: 'Durée (heures)' },
        title: `Temps de trajet pour ${distanceTrajet.toFixed(0)} km`
      });
    }
  }

  _loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) return resolve();
      const s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = reject; document.head.appendChild(s);
    });
  }
}
