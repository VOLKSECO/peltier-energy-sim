const CP_WATER = 1.163; // Wh/kg·K - Capacité thermique massique de l'eau
const CP_AIR = 0.34; // Wh/m³·K - Capacité thermique volumique de l'air

let tempChart, efficiencyChart;

// Données initiales des modules (facilement modifiables)
const modules = {
    peltier: {
        numModules: 1,
        voltage: 12,
        current: 6,
        time: 1,
        image: "sources/peltier.svg" // Chemin vers l'image SVG
    },
    caisse: {
        volInt: 0.011,
        lambda: 0.033,
        thickness: 0.04,
        surface: 0.56,
        tempExt: 23.2,
        image: "sources/caisse.svg"
    },
    "reservoir-dissipation": {
        volWaterHot: 4,
        tempWaterHotInit: 17,
        image: "sources/reservoir-dissipation.svg"
    },
    "reservoir-frigo": {
        volWaterCold: 1,
        tempWaterColdInit: 17,
        volAirCold: 10.41,
        tempAirColdInit: 15,
        image: "sources/reservoir-frigo.svg"
    }
};

// Mettre à jour les V-Cards avec les données initiales
function updateVCards() {
    for (const module in modules) {
        for (const param in modules[module]) {
            if (param !== 'image') {
                const element = document.getElementById(`vcard-${param}`);
                if (element) element.textContent = modules[module][param];
            }
        }
    }
}

// Charger le schéma SVG correspondant à la variante
window.updateSchema = function() {
    const variant = document.getElementById('variant').value;
    const schemaDiv = document.getElementById('schema');
    schemaDiv.innerHTML = `<object type="image/svg+xml" data="peltier-variante-${variant}.svg" style="width: 100%; height: 400px;"></object>`;
}

// Ouvrir la modale pour éditer un module
window.openModal = function(module) {
    const modal = document.getElementById('modal');
    const modalTitle = document.getElementById('modal-title');
    const modalImage = document.getElementById('modal-image');
    const modalForm = document.getElementById('modal-form');

    modalTitle.textContent = `Éditer ${module.replace('-', ' ').toUpperCase()}`;
    modalImage.src = modules[module].image;

    let formHTML = '';
    for (const param in modules[module]) {
        if (param !== 'image') {
            formHTML += `
                <label>${param} :</label>
                <input type="number" id="modal-${param}" value="${modules[module][param]}" step="any">
            `;
        }
    }
    formHTML += `<button onclick="saveModule('${module}')">Enregistrer</button>`;
    modalForm.innerHTML = formHTML;

    modal.style.display = 'block';
}

// Fermer la modale
window.closeModal = function() {
    document.getElementById('modal').style.display = 'none';
}

// Enregistrer les modifications d’un module
window.saveModule = function(module) {
    for (const param in modules[module]) {
        if (param !== 'image') {
            const input = document.getElementById(`modal-${param}`);
            if (input) {
                modules[module][param] = parseFloat(input.value);
            }
        }
    }
    updateVCards();
    closeModal();
}

// Simulation des transferts énergétiques
window.simulate = function() {
    // Récupérer les paramètres
    const { numModules, voltage, current, time } = modules.peltier;
    const { volInt, lambda, thickness, surface, tempExt } = modules.caisse;
    const { volWaterHot, tempWaterHotInit } = modules["reservoir-dissipation"];
    const { volWaterCold, tempWaterColdInit, volAirCold, tempAirColdInit } = modules["reservoir-frigo"];
    const variant = document.getElementById('variant').value;

    // Calcul de la consommation du Peltier
    // Équation : Puissance (W) = Tension (V) × Courant (A) × Nombre de modules
    const power = voltage * current * numModules;
    // Équation : Énergie consommée (Wh) = Puissance (W) × Temps (h)
    const energyConsumed = power * time;

    // Calcul des pertes thermiques
    // Équation : Résistance thermique R (m²·K/W) = Épaisseur (m) / Conductivité thermique (W/m·K)
    const R = thickness / lambda;
    // Équation : Coefficient de transfert thermique U (W/m²·K) = 1 / R
    const U = 1 / R;
    // Approximation de la température intérieure moyenne pour les pertes
    const avgTempInt = variant === 'A' ? (tempAirColdInit + tempWaterColdInit) / 2 : tempWaterColdInit;
    // Équation : Différence de température (K) = Temp extérieure - Temp intérieure moyenne
    const deltaT = tempExt - avgTempInt;
    // Équation : Taux de perte thermique (W) = U × Surface (m²) × ΔT
    const heatLossRate = U * surface * deltaT;
    // Équation : Énergie perdue (Wh) = Taux de perte (W) × Temps (h)
    const energyLoss = heatLossRate * time;

    // Calcul côté chaud (réservoir de dissipation)
    // Hypothèse : 1 litre d’eau = 1 kg
    const massWaterHot = volWaterHot;
    // Équation : Énergie totale à dissiper (Wh) = Énergie consommée + Pertes
    const energyHot = energyConsumed + energyLoss;
    // Équation : ΔT (°C) = Énergie (Wh) / (Masse (kg) × Cp eau (Wh/kg·K))
    const deltaTHot = energyHot / (massWaterHot * CP_WATER);
    // Équation : Température finale (°C) = Temp initiale + ΔT
    const tempWaterHotFinal = tempWaterHotInit + deltaTHot;

    // Calcul côté froid (réservoir frigo)
    let energyColdWater = 0, energyColdAir = 0;
    let tempWaterColdFinal = tempWaterColdInit, tempAirColdFinal = tempAirColdInit;

    // Approximation : 20% de l’énergie consommée est convertie en froid (basée sur les données expérimentales)
    // Équation : Énergie froide totale (Wh) = Énergie consommée × 0.2 - Pertes
    const energyColdTotal = energyConsumed * 0.2 - energyLoss;

    if (variant === 'A') {
        // Variante A : Refroidir l'air en priorité
        const volAirColdM3 = volAirCold / 1000; // Conversion en m³
        // Équation : Énergie max pour l’air (Wh) = Volume (m³) × Cp air (Wh/m³·K) × (Temp initiale - 0°C)
        const maxEnergyAir = volAirColdM3 * CP_AIR * (tempAirColdInit - 0);
        energyColdAir = Math.min(energyColdTotal, maxEnergyAir);
        // Équation : Temp finale air (°C) = Temp initiale - Énergie / (Volume × Cp air)
        tempAirColdFinal = tempAirColdInit - (energyColdAir / (volAirColdM3 * CP_AIR));

        // Énergie restante pour l’eau
        const energyRemaining = energyColdTotal - energyColdAir;
        if (energyRemaining > 0) {
            const massWaterCold = volWaterCold;
            // Équation : Énergie max pour l’eau (Wh) = Masse (kg) × Cp eau × Temp initiale
            energyColdWater = Math.min(energyRemaining, massWaterCold * CP_WATER * tempWaterColdInit);
            // Équation : Temp finale eau (°C) = Temp initiale - Énergie / (Masse × Cp eau)
            tempWaterColdFinal = tempWaterColdInit - (energyColdWater / (massWaterCold * CP_WATER));
        }
    } else {
        // Variante B : Refroidir l'eau directement
        const massWaterCold = volWaterCold;
        // Équation : Énergie max pour l’eau (Wh) = Masse (kg) × Cp eau × Temp initiale
        energyColdWater = Math.min(energyColdTotal, massWaterCold * CP_WATER * tempWaterColdInit);
        // Équation : Temp finale eau (°C) = Temp initiale - Énergie / (Masse × Cp eau)
        tempWaterColdFinal = tempWaterColdInit - (energyColdWater / (massWaterCold * CP_WATER));

        // L'air est refroidi indirectement
        const volAirColdM3 = volAirCold / 1000;
        const energyRemaining = energyColdTotal - energyColdWater;
        if (energyRemaining > 0) {
            // Équation : Énergie max pour l’air (Wh) = Volume (m³) × Cp air × Temp initiale
            energyColdAir = Math.min(energyRemaining, volAirColdM3 * CP_AIR * tempAirColdInit);
            // Équation : Temp finale air (°C) = Temp initiale - Énergie / (Volume × Cp air)
            tempAirColdFinal = tempAirColdInit - (energyColdAir / (volAirColdM3 * CP_AIR));
        }
    }

    // Calcul du rendement
    // Équation : Énergie froide totale (Wh) = Énergie extraite eau + Énergie extraite air
    const totalColdEnergy = energyColdWater + energyColdAir;
    // Équation : Rendement (%) = (Énergie froide / Énergie consommée) × 100
    const efficiency = (totalColdEnergy / energyConsumed) * 100;

    // Afficher les résultats sous forme de rapport
    const resultsDiv = document.getElementById('results');
    resultsDiv.innerHTML = `
        <h3>Consommation Énergétique</h3>
        <p><strong>Énergie consommée par le Peltier :</strong> ${energyConsumed.toFixed(2)} Wh</p>
        <p class="comment">Commentaire : Cette valeur représente l'énergie totale fournie au module Peltier pendant ${time} heure(s).</p>
        <p><strong>Pertes thermiques :</strong> ${energyLoss.toFixed(2)} Wh</p>
        <p class="comment">Commentaire : Les pertes thermiques sont dues à l’isolation imparfaite de la caisse en XPS. Une isolation plus épaisse pourrait réduire ces pertes.</p>

        <h3>Réservoir de Dissipation (Côté Chaud)</h3>
        <p>Température finale de l'eau : ${tempWaterHotFinal.toFixed(2)} °C</p>
        <p>Énergie accumulée : ${energyHot.toFixed(2)} Wh</p>
        <p class="comment">Commentaire : La température de l’eau dans le réservoir de dissipation a augmenté, indiquant une dissipation efficace de la chaleur générée par le Peltier.</p>

        <h3>Réservoir Frigo (Côté Froid)</h3>
        <p>Température finale de l'eau : ${tempWaterColdFinal.toFixed(2)} °C</p>
        <p>Énergie extraite (eau) : ${energyColdWater.toFixed(2)} Wh</p>
        <p>Température finale de l'air : ${tempAirColdFinal.toFixed(2)} °C</p>
        <p>Énergie extraite (air) : ${energyColdAir.toFixed(2)} Wh</p>
        <p class="comment">Commentaire : La baisse de température montre que le système refroidit efficacement, mais l’impact sur l’air est plus faible dans la variante ${variant === 'A' ? 'A (circulation d’air)' : 'B (circulation d’eau)'}, ce qui suggère une différence dans la distribution du froid.</p>

        <h3>Rendement</h3>
        <p>Rendement total : ${efficiency.toFixed(2)} %</p>
        <p class="comment">Commentaire : Un rendement de ${efficiency.toFixed(2)} % est typique pour un module Peltier non optimisé. Une valeur théorique maximale est autour de 15 %. L’utilisation d’une meilleure isolation ou d’un fluide plus efficace (eau vs air) pourrait améliorer ce rendement.</p>
    `;

    // Faire défiler jusqu’à la section des résultats
    document.getElementById('results-section').scrollIntoView({ behavior: 'smooth' });

    // Mettre à jour les graphiques
    updateCharts(tempWaterHotInit, tempWaterHotFinal, tempWaterColdInit, tempWaterColdFinal, tempAirColdInit, tempAirColdFinal, efficiency, variant);
}

// Mettre à jour les graphiques
function updateCharts(tempWaterHotInit, tempWaterHotFinal, tempWaterColdInit, tempWaterColdFinal, tempAirColdInit, tempAirColdFinal, efficiency, variant) {
    // Graphique 1 : Variations de température
    if (tempChart) tempChart.destroy();
    tempChart = new Chart(document.getElementById('tempChart'), {
        type: 'bar',
        data: {
            labels: ['Eau Chaude', 'Eau Froide', 'Air Froid'],
            datasets: [
                {
                    label: 'Température Initiale (°C)',
                    data: [tempWaterHotInit, tempWaterColdInit, tempAirColdInit],
                    backgroundColor: 'rgba(74, 144, 226, 0.5)', // Bleu doux
                    borderColor: 'rgba(74, 144, 226, 1)',
                    borderWidth: 1
                },
                {
                    label: 'Température Finale (°C)',
                    data: [tempWaterHotFinal, tempWaterColdFinal, tempAirColdFinal],
                    backgroundColor: 'rgba(255, 159, 64, 0.5)', // Orange doux
                    borderColor: 'rgba(255, 159, 64, 1)',
                    borderWidth: 1
                }
            ]
        },
        options: {
            scales: {
                y: {
                    beginAtZero: true,
                    title: { display: true, text: 'Température (°C)' }
                }
            },
            plugins: {
                title: { display: true, text: 'Variations de Température' }
            }
        }
    });

    // Graphique 2 : Rendement
    if (efficiencyChart) efficiencyChart.destroy();
    efficiencyChart = new Chart(document.getElementById('efficiencyChart'), {
        type: 'bar',
        data: {
            labels: ['Rendement Simulé', 'Rendement Théorique Max'],
            datasets: [
                {
                    label: 'Rendement (%)',
                    data: [efficiency, 15],
                    backgroundColor: ['rgba(74, 144, 226, 0.5)', 'rgba(153, 102, 255, 0.5)'],
                    borderColor: ['rgba(74, 144, 226, 1)', 'rgba(153, 102, 255, 1)'],
                    borderWidth: 1
                }
            ]
        },
        options: {
            scales: {
                y: {
                    beginAtZero: true,
                    max: 20,
                    title: { display: true, text: 'Rendement (%)' }
                }
            },
            plugins: {
                title: { display: true, text: `Rendement - Variante ${variant}` }
            }
        }
    });
}

// Initialiser la page
window.onload = function() {
    updateSchema();
    updateVCards();
};