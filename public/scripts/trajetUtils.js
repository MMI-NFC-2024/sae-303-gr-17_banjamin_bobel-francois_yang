// Utilities for trajet calculations
export function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export const prixParKm = {
  Train: 0.11,
  'Voiture thermique': 0.12,
  'Voiture électrique': 0.06,
  Autocar: 0.07,
  Avion: 0.15
};

// emissions units (g CO2 per km) as in your notebook; will convert to kg later
export const emissionsParKm = {
  Train: 2.5,
  'Voiture thermique': 193,
  'Voiture électrique': 42,
  Avion: 285,
  Autocar: 35
};

export const vitessesMoyennes = {
  Train: 120,
  'Voiture thermique': 90,
  'Voiture électrique': 90,
  Avion: 500,
  Autocar: 80
};

export function computeComparaisonPrix(distanceKm) {
  if (!distanceKm || distanceKm === 0) return [];
  return Object.entries(prixParKm).map(([mode, prixKm]) => ({
    mode,
    prix: +(distanceKm * prixKm).toFixed(2),
    prixNum: distanceKm * prixKm
  }));
}

export function computeComparaisonComplete(distanceKm) {
  if (!distanceKm || distanceKm === 0) return [];
  return Object.keys(emissionsParKm).map((mode) => ({
    mode,
    co2: +(distanceKm * emissionsParKm[mode] / 1000).toFixed(2), // kg
    prix: +(distanceKm * prixParKm[mode]).toFixed(2),
    temps: +(distanceKm / (vitessesMoyennes[mode] || 90)).toFixed(1)
  }));
}
