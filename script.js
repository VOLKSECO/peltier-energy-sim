// Constantes physiques
const CP_WATER = 1.163; // Wh/kg·K - Capacité thermique massique de l'eau
const CP_AIR = 0.34; // Wh/m³·K - Capacité thermique volumique de l'air
const RHO_WATER = 1000; // kg/m³ - Densité de l'eau
const H_CONV = 10; // W/m²·K - Coefficient de convection (air-eau ou eau-air)

let consumptionChart, temperatureChart, energyChart;

// Données initiales des modules (facilement modifiables)
const modules = {
    battery: {
        batteryCapacity: 100, // Ah
        batteryVoltage: 12,   // V
        batteryCurrentMax: 10, // A
        image: "sources/battery.svg"
    },
    peltier: {
        numModules: 1,
        voltage: 12,
        current: 6,
        peltierPower: 0, // Calculé
        peltierConsumptionPerMin: 0, // Calculé
        image: "sources/peltier.svg"
    },
    caisse: {
        heightExt: 0.2,    // m
        widthExt: 0.3,     // m
        depthExt: 0.1833,  // m
        volInt: 0,         // Calculé
        surface: 0,        // Calculé
        thickness: 40,     // mm (converti en m pour calculs)
        lambda: 0.033,     // W/m·K
        U: 0,              // Calculé
        tempExt: 23.2,     // °C (synchronisé avec tempExtMax)
        heatLossPerMin: 0, // Calculé
        image: "sources/caisse.svg"
    },
    "reservoir-dissipation": {
        volWaterHot: 4,
        tempWaterHotInit: 17,
        image: "sources/reservoir-dissipation.svg"
    },
    "reservoir-frigo": {
        volFrigo: 0,       // Calculé
        tempFrigoInit: 17,
        volWaterCold: 1,
        volAirCold: 0,     // Calculé
        image: "sources/reservoir-frigo.svg"
    },
    "pump-hot": {
        pumpHotPower: 5,   // W
        pumpHotFlow: 1.0,  // m³/h
        pumpHotConsumptionPerMin: 0, // Calculé
        image: "sources/pump_outside.svg"
    },
    "pump-cold": {
        pumpColdPower: 5,  // W
        pumpColdFlow: 1.0, // m³/h
        pumpColdConsumptionPerMin: 0, // Calculé
        image: "sources/pump_inside.svg"
    },
    fan: {
        fanPower: 3,       // W
        fanFlow: 0.5,      // m³/h
        fanConsumptionPerMin: 0, // Calculé
        image: "sources/air_dissipator.svg"
    }
};

// Fonction pour calculer les paramètres dérivés avant la simulation
function calculateDerivedParameters() {
    const thicknessM = modules.caisse.thickness / 1000; // Conversion mm en m
    modules.caisse.volInt = ((modules.caisse.heightExt - 2 * thicknessM) * 
                             (modules.caisse.widthExt - 2 * thicknessM) * 
                             (modules.caisse.depthExt - 2 * thicknessM)).toFixed(4);
    modules.caisse.surface = (2 * (modules.caisse.heightExt * modules.caisse.widthExt + 
                                   modules.caisse.heightExt * modules.caisse.depthExt + 
                                   modules.caisse.widthExt * modules.caisse.depthExt)).toFixed(4);
    modules.caisse.U = (1 / (thicknessM / modules.caisse.lambda)).toFixed(4);

    modules["reservoir-frigo"].volFrigo = (modules.caisse.volInt * 1000).toFixed(2); // Conversion m³ en litres
    modules["reservoir-frigo"].volAirCold = (modules["reservoir-frigo"].volFrigo - modules["reservoir-frigo"].volWaterCold).toFixed(2);

    modules.peltier.peltierPower = (modules.peltier.voltage * modules.peltier.current * modules.peltier.numModules).toFixed(2);
    modules.peltier.peltierConsumptionPerMin = (modules.peltier.peltierPower / 60).toFixed(4);

    modules["pump-hot"].pumpHotConsumptionPerMin = (modules["pump-hot"].pumpHotPower / 60).toFixed(4);
    modules["pump-cold"].pumpColdConsumptionPerMin = (modules["pump-cold"].pumpColdPower / 60).toFixed(4);
    modules.fan.fanConsumptionPerMin = (modules.fan.fanPower / 60).toFixed(4);

    window.updateVCards();
}

// Fonction pour mettre à jour les V-Cards avec les données des modules
window.updateVCards = function() {
    for (const module in modules) {
        for (const param in modules[module]) {
            if (param !== 'image') {
                const element = document.getElementById(`vcard-${param}`);
                if (element) element.textContent = modules[module][param];
            }
        }
    }
    const tempExtMax = parseFloat(document.getElementById('tempExtMax').value);
    if (!isNaN(tempExtMax)) {
        modules.caisse.tempExt = tempExtMax;
        modules["reservoir-frigo"].tempFrigoInit = tempExtMax;
        document.getElementById('vcard-tempExt').textContent = tempExtMax;
        document.getElementById('vcard-tempFrigoInit').textContent = tempExtMax;
    }
};

// Fonction pour mettre à jour le schéma en fonction de la variante sélectionnée
window.updateSchema = function() {
    const variant = document.getElementById('variant').value;
    const schemaDiv = document.getElementById('schema');
    schemaDiv.innerHTML = `
        <div class="image-container">
            <object type="image/svg+xml" data="sources/peltier-variante-${variant}.svg" style="width: 100%; height: 350px;"></object>
        </div>
    `;
};

// Fonction pour ouvrir la modale d'édition d'un module
window.openModal = function(module) {
    const modal = document.getElementById('modal');
    const modalTitle = document.getElementById('modal-title');
    const modalImage = document.getElementById('modal-image');
    const modalForm = document.getElementById('modal-form');

    if (!modules[module]) {
        console.error(`Module ${module} non trouvé dans modules.`);
        return;
    }

    modalTitle.textContent = `Éditer ${module}`;
    modalImage.src = modules[module].image;

    let formHTML = '';
    for (const param in modules[module]) {
        if (param !== 'image' && !['peltierPower', 'peltierConsumptionPerMin', 'volInt', 'surface', 'U', 'heatLossPerMin', 'volFrigo', 'volAirCold', 'pumpHotConsumptionPerMin', 'pumpColdConsumptionPerMin', 'fanConsumptionPerMin'].includes(param)) {
            let unit = '';
            let minValue = 0;
            let step = 'any';
            if (['heightExt', 'widthExt', 'depthExt'].includes(param)) {
                unit = 'm';
                minValue = 0.01;
                step = '0.01';
            } else if (['voltage', 'current', 'pumpHotPower', 'pumpColdPower', 'fanPower'].includes(param)) {
                unit = param.includes('Power') ? 'W' : (param === 'voltage' ? 'V' : 'A');
                minValue = 0;
            } else if (['tempExt', 'tempWaterHotInit', 'tempFrigoInit', 'tempIntTarget'].includes(param)) {
                unit = '°C';
                minValue = -50;
            } else if (['pumpHotFlow', 'pumpColdFlow', 'fanFlow'].includes(param)) {
                unit = 'm³/h';
                minValue = 0.01;
                step = '0.01';
            } else if (['volWaterHot', 'volWaterCold'].includes(param)) {
                unit = 'litres';
                minValue = 0.1;
                step = '0.1';
            } else if (param === 'thickness') {
                unit = 'mm';
                minValue = 1;
                step = '1';
            } else if (param === 'lambda') {
                unit = 'W/m·K';
                minValue = 0.001;
                step = '0.001';
            } else if (param === 'numModules') {
                minValue = 1;
                step = '1';
            }

            formHTML += `
                <label for="modal-${param}">${param} (${unit}) :</label>
                <input type="number" id="modal-${param}" value="${modules[module][param]}" step="${step}" min="${minValue}">
            `;
        }
    }
    formHTML += `<button onclick="saveModule('${module}')">Enregistrer</button>`;
    modalForm.innerHTML = formHTML;

    modal.style.display = 'block';
};

// Fonction pour fermer la modale
window.closeModal = function() {
    document.getElementById('modal').style.display = 'none';
};

// Fonction pour enregistrer les modifications d’un module
window.saveModule = function(module) {
    for (const param in modules[module]) {
        if (param !== 'image' && !['peltierPower', 'peltierConsumptionPerMin', 'volInt', 'surface', 'U', 'heatLossPerMin', 'volFrigo', 'volAirCold', 'pumpHotConsumptionPerMin', 'pumpColdConsumptionPerMin', 'fanConsumptionPerMin'].includes(param)) {
            const input = document.getElementById(`modal-${param}`);
            if (input) {
                const value = parseFloat(input.value);
                if (isNaN(value) || value < input.min) {
                    alert(`La valeur de ${param} doit être supérieure ou égale à ${input.min}.`);
                    return;
                }
                modules[module][param] = value;
            }
        }
    }
    calculateDerivedParameters();
    closeModal();
};

// Fonction principale de simulation
window.simulate = function() {
    // Récupérer les paramètres généraux
    const variant = document.getElementById('variant').value;
    const tempExtMax = parseFloat(document.getElementById('tempExtMax').value);
    const tempIntTarget = parseFloat(document.getElementById('tempIntTarget').value);
    const simTimeMinutes = parseInt(document.getElementById('simTime').value);
    const deltaTHot = parseFloat(document.getElementById('deltaTHot').value);
    const deltaTCold = parseFloat(document.getElementById('deltaTCold').value);

    // Validation des paramètres généraux
    if (isNaN(tempExtMax) || tempExtMax < -50 || tempExtMax > 50) {
        alert("La température extérieure doit être comprise entre -50°C et 50°C.");
        return;
    }
    if (isNaN(tempIntTarget) || tempIntTarget < -20 || tempIntTarget > 30) {
        alert("La température cible doit être comprise entre -20°C et 30°C.");
        return;
    }
    if (isNaN(simTimeMinutes) || simTimeMinutes < 1 || simTimeMinutes > 10080) {
        alert("Le temps de simulation doit être compris entre 1 minute et 10080 minutes (7 jours).");
        return;
    }
    if (isNaN(deltaTHot) || deltaTHot <= 0) {
        alert("La différence de température du réservoir de dissipation doit être positive.");
        return;
    }
    if (variant === 'B' && (isNaN(deltaTCold) || deltaTCold <= 0)) {
        alert("La différence de température côté froid (Version B) doit être positive.");
        return;
    }

    // Synchroniser les températures
    modules.caisse.tempExt = tempExtMax;
    modules["reservoir-frigo"].tempFrigoInit = tempExtMax;

    // 1. Énergie disponible dans la batterie
    let batteryEnergy = modules.battery.batteryCapacity * modules.battery.batteryVoltage;

    // Initialiser les variables dynamiques
    let tempWaterHot = modules["reservoir-dissipation"].tempWaterHotInit;
    let tempFrigo = modules["reservoir-frigo"].tempFrigoInit;
    let tempWaterCold = tempFrigo;
    let tempHotPeltier = tempWaterHot;
    let tempColdPeltier = tempFrigo;
    let energyAccumHot = 0;

    // Tableaux pour les graphiques
    const peltierConsumptionData = [];
    const pumpHotConsumptionData = [];
    const pumpColdConsumptionData = [];
    const fanConsumptionData = [];
    const totalConsumptionData = [];
    const tempWaterHotData = [];
    const tempFrigoData = [];
    const tempHotPeltierData = [];
    const tempColdPeltierData = [];
    const energyHotData = [];
    const energyColdAirData = [];
    const energyColdWaterData = [];
    const energyLossData = [];
    const batteryEnergyData = [];

    // Calculer les constantes pour les échanges thermiques
    const massWaterHot = modules["reservoir-dissipation"].volWaterHot; // kg
    const massWaterCold = modules["reservoir-frigo"].volWaterCold; // kg
    const volAirColdM3 = modules["reservoir-frigo"].volAirCold / 1000; // m³
    const flowHot = modules["pump-hot"].pumpHotFlow / 60; // m³/min
    const flowCold = variant === 'B' ? modules["pump-cold"].pumpColdFlow / 60 : modules.fan.fanFlow / 60; // m³/min
    const massFlowHot = flowHot * RHO_WATER; // kg/min
    const massFlowCold = flowCold * RHO_WATER; // kg/min
    const thicknessM = modules.caisse.thickness / 1000; // m
    const surfaceExchange = (modules.caisse.widthExt - 2 * thicknessM) * (modules.caisse.depthExt - 2 * thicknessM); // m²

    // Consommations cumulées
    let totalPeltierConsumption = 0;
    let totalPumpHotConsumption = 0;
    let totalPumpColdConsumption = 0;
    let totalFanConsumption = 0;
    let totalConsumption = 0;
    let totalHeatLoss = 0;
    let totalEnergyColdAir = 0;
    let totalEnergyColdWater = 0;

    // Simulation minute par minute
    for (let minute = 0; minute < simTimeMinutes; minute++) {
        // 2-5. Consommations électriques par minute
        const peltierConsumptionPerMin = parseFloat(modules.peltier.peltierConsumptionPerMin);
        const pumpHotConsumptionPerMin = parseFloat(modules["pump-hot"].pumpHotConsumptionPerMin);
        const pumpColdConsumptionPerMin = variant === 'B' ? parseFloat(modules["pump-cold"].pumpColdConsumptionPerMin) : 0;
        const fanConsumptionPerMin = variant === 'A' ? parseFloat(modules.fan.fanConsumptionPerMin) : 0;
        const minuteConsumption = peltierConsumptionPerMin + pumpHotConsumptionPerMin + pumpColdConsumptionPerMin + fanConsumptionPerMin;

        totalPeltierConsumption += peltierConsumptionPerMin;
        totalPumpHotConsumption += pumpHotConsumptionPerMin;
        totalPumpColdConsumption += pumpColdConsumptionPerMin;
        totalFanConsumption += fanConsumptionPerMin;
        totalConsumption += minuteConsumption;

        // Énergie restante dans la batterie
        batteryEnergy -= minuteConsumption;

        // 6-7. Températures du Peltier
        tempHotPeltier = tempWaterHot + deltaTHot / 2;
        tempColdPeltier = variant === 'B' ? (tempWaterCold - deltaTCold / 2) : tempFrigo;

        // Calcul du COP du Peltier
        const deltaT = Math.max(tempHotPeltier - tempColdPeltier, 0.1); // Éviter division par 0
        const tempHotAbs = tempHotPeltier + 273.15;
        const copIdeal = (tempColdPeltier + 273.15) / deltaT;
        const efficiency = 0.3;
        const cop = Math.max(0.5, copIdeal * efficiency);

        // 11. Énergie froide générée par minute
        const energyColdPerMin = peltierConsumptionPerMin * cop;

        // 16. Pertes thermiques de la caisse
        const deltaTEnv = tempExtMax - tempFrigo;
        const heatLossRate = parseFloat(modules.caisse.U) * parseFloat(modules.caisse.surface) * deltaTEnv; // W
        const heatLossPerMin = heatLossRate / 60; // Wh/min
        totalHeatLoss += heatLossPerMin;

        // 8-9. Énergie thermique échangée côté chaud et énergie accumulée
        const energyHotPerMin = massFlowHot * CP_WATER * deltaTHot;
        energyAccumHot += energyHotPerMin;

        // 10. Température du réservoir de dissipation
        const deltaTHotReservoir = energyHotPerMin / (massWaterHot * CP_WATER);
        tempWaterHot += deltaTHotReservoir;

        // 17-18. Répartition des pertes thermiques entre l'eau et l'air
        const thermalMassWater = massWaterCold * CP_WATER;
        const thermalMassAir = volAirColdM3 * CP_AIR;
        const totalThermalMass = thermalMassWater + thermalMassAir;
        const lossWaterFraction = thermalMassWater / totalThermalMass;
        const lossAirFraction = thermalMassAir / totalThermalMass;
        const heatLossWaterPerMin = heatLossPerMin * lossWaterFraction;
        const heatLossAirPerMin = heatLossPerMin * lossAirFraction;

        // Échanges thermiques côté froid
        let energyColdWaterPerMin = 0;
        let energyColdAirPerMin = 0;
        if (variant === 'A') {
            // 12. Version A : Énergie transmise à l'air
            const maxEnergyAir = volAirColdM3 * CP_AIR * (tempFrigo - tempIntTarget);
            energyColdAirPerMin = Math.min(energyColdPerMin, maxEnergyAir);
            totalEnergyColdAir += energyColdAirPerMin;

            // 13. Version A : Énergie transmise à l'eau par convection
            const energyRemaining = energyColdPerMin - energyColdAirPerMin;
            if (energyRemaining > 0 && massWaterCold > 0) {
                const energyColdWaterConv = H_CONV * surfaceExchange * (tempFrigo - tempWaterCold) / 60;
                energyColdWaterPerMin = Math.min(energyRemaining, energyColdWaterConv);
                totalEnergyColdWater += energyColdWaterPerMin;
            }
        } else {
            // 14. Version B : Énergie transmise à l'eau
            energyColdWaterPerMin = massFlowCold * CP_WATER * deltaTCold;
            totalEnergyColdWater += energyColdWaterPerMin;

            // 15. Version B : Énergie transmise à l'air par convection
            const energyRemaining = energyColdPerMin - energyColdWaterPerMin;
            if (energyRemaining > 0 && volAirColdM3 > 0) {
                const energyColdAirConv = H_CONV * surfaceExchange * (tempWaterCold - tempFrigo) / 60;
                energyColdAirPerMin = Math.min(energyRemaining, energyColdAirConv);
                totalEnergyColdAir += energyColdAirPerMin;
            }
        }

        // 19. Température de l'air
        const deltaTAir = (energyColdAirPerMin - heatLossAirPerMin) / (volAirColdM3 * CP_AIR);
        tempFrigo += deltaTAir;

        // 20. Température de l'eau
        const deltaTWater = (energyColdWaterPerMin - heatLossWaterPerMin) / (massWaterCold * CP_WATER);
        tempWaterCold += deltaTWater;

        // Stocker les données pour les graphiques
        peltierConsumptionData.push(totalPeltierConsumption);
        pumpHotConsumptionData.push(totalPumpHotConsumption);
        pumpColdConsumptionData.push(totalPumpColdConsumption);
        fanConsumptionData.push(totalFanConsumption);
        totalConsumptionData.push(totalConsumption);
        tempWaterHotData.push(tempWaterHot);
        tempFrigoData.push(tempFrigo);
        tempHotPeltierData.push(tempHotPeltier);
        tempColdPeltierData.push(tempColdPeltier);
        energyHotData.push(energyAccumHot);
        energyColdAirData.push(totalEnergyColdAir);
        energyColdWaterData.push(totalEnergyColdWater);
        energyLossData.push(totalHeatLoss);
        batteryEnergyData.push(batteryEnergy);
    }

    // Afficher le schéma de la variante choisie
    const schemaResultDiv = document.getElementById('schema-result');
    schemaResultDiv.innerHTML = `
        <div class="image-container">
            <object type="image/svg+xml" data="sources/peltier-variante-${variant}.svg" style="width: 100%; height: 350px;"></object>
        </div>
    `;

    // Afficher le graphique des consommations électriques
    if (consumptionChart) consumptionChart.destroy();
    consumptionChart = new Chart(document.getElementById('consumptionChart'), {
        type: 'line',
        data: {
            labels: Array.from({ length: simTimeMinutes }, (_, i) => i + 1),
            datasets: [
                {
                    label: 'Peltier (Wh)',
                    data: peltierConsumptionData,
                    borderColor: 'rgba(255, 99, 132, 1)',
                    backgroundColor: 'rgba(255, 99, 132, 0.2)',
                    fill: false
                },
                {
                    label: 'Pompe Extérieure (Wh)',
                    data: pumpHotConsumptionData,
                    borderColor: 'rgba(54, 162, 235, 1)',
                    backgroundColor: 'rgba(54, 162, 235, 0.2)',
                    fill: false
                },
                {
                    label: 'Pompe Intérieure (Wh)',
                    data: pumpColdConsumptionData,
                    borderColor: 'rgba(75, 192, 192, 1)',
                    backgroundColor: 'rgba(75, 192, 192, 0.2)',
                    fill: false
                },
                {
                    label: 'Ventilateur (Wh)',
                    data: fanConsumptionData,
                    borderColor: 'rgba(255, 206, 86, 1)',
                    backgroundColor: 'rgba(255, 206, 86, 0.2)',
                    fill: false
                },
                {
                    label: 'Totale (Wh)',
                    data: totalConsumptionData,
                    borderColor: 'rgba(153, 102, 255, 1)',
                    backgroundColor: 'rgba(153, 102, 255, 0.2)',
                    fill: false
                }
            ]
        },
        options: {
            scales: {
                x: { title: { display: true, text: 'Temps (minutes)' } },
                y: { title: { display: true, text: 'Consommation (Wh)' }, beginAtZero: true }
            },
            plugins: { title: { display: true, text: 'Consommations Électriques' } }
        }
    });

    // Afficher le graphique des températures
    if (temperatureChart) temperatureChart.destroy();
    temperatureChart = new Chart(document.getElementById('temperatureChart'), {
        type: 'line',
        data: {
            labels: Array.from({ length: simTimeMinutes }, (_, i) => i + 1),
            datasets: [
                {
                    label: 'Réservoir Dissipation (°C)',
                    data: tempWaterHotData,
                    borderColor: 'rgba(255, 99, 132, 1)',
                    backgroundColor: 'rgba(255, 99, 132, 0.2)',
                    fill: false
                },
                {
                    label: 'Intérieur Frigo (°C)',
                    data: tempFrigoData,
                    borderColor: 'rgba(54, 162, 235, 1)',
                    backgroundColor: 'rgba(54, 162, 235, 0.2)',
                    fill: false
                },
                {
                    label: 'Côté Chaud Peltier (°C)',
                    data: tempHotPeltierData,
                    borderColor: 'rgba(255, 159, 64, 1)',
                    backgroundColor: 'rgba(255, 159, 64, 0.2)',
                    fill: false
                },
                {
                    label: 'Côté Froid Peltier (°C)',
                    data: tempColdPeltierData,
                    borderColor: 'rgba(75, 192, 192, 1)',
                    backgroundColor: 'rgba(75, 192, 192, 0.2)',
                    fill: false
                }
            ]
        },
        options: {
            scales: {
                x: { title: { display: true, text: 'Temps (minutes)' } },
                y: { title: { display: true, text: 'Température (°C)' } }
            },
            plugins: { title: { display: true, text: 'Évolution des Températures' } }
        }
    });

    // Afficher le graphique des énergies échangées
    if (energyChart) energyChart.destroy();
    energyChart = new Chart(document.getElementById('energyChart'), {
        type: 'line',
        data: {
            labels: Array.from({ length: simTimeMinutes }, (_, i) => i + 1),
            datasets: [
                {
                    label: 'Énergie Dissipateur (Wh)',
                    data: energyHotData,
                    borderColor: 'rgba(255, 99, 132, 1)',
                    backgroundColor: 'rgba(255, 99, 132, 0.2)',
                    fill: false
                },
                {
                    label: 'Énergie Froid Air (Wh)',
                    data: energyColdAirData,
                    borderColor: 'rgba(54, 162, 235, 1)',
                    backgroundColor: 'rgba(54, 162, 235, 0.2)',
                    fill: false
                },
                {
                    label: 'Énergie Froid Eau (Wh)',
                    data: energyColdWaterData,
                    borderColor: 'rgba(75, 192, 192, 1)',
                    backgroundColor: 'rgba(75, 192, 192, 0.2)',
                    fill: false
                },
                {
                    label: 'Pertes Caisse (Wh)',
                    data: energyLossData,
                    borderColor: 'rgba(255, 206, 86, 1)',
                    backgroundColor: 'rgba(255, 206, 86, 0.2)',
                    fill: false
                }
            ]
        },
        options: {
            scales: {
                x: { title: { display: true, text: 'Temps (minutes)' } },
                y: { title: { display: true, text: 'Énergie (Wh)' }, beginAtZero: true }
            },
            plugins: { title: { display: true, text: 'Énergies Échangées' } }
        }
    });

    // Afficher le récapitulatif
    const resultsTextDiv = document.getElementById('results-text');
    let recapHTML = `
        <h3>Récapitulatif Général</h3>
        <p>Énergie initiale dans la batterie : ${(modules.battery.batteryCapacity * modules.battery.batteryVoltage).toFixed(2)} Wh</p>
        <p>Énergie restante dans la batterie : ${batteryEnergy.toFixed(2)} Wh</p>
        <p>Énergie consommée par le Peltier : ${totalPeltierConsumption.toFixed(2)} Wh</p>
        <p>Énergie consommée par la pompe extérieure : ${totalPumpHotConsumption.toFixed(2)} Wh</p>
        <p>Énergie consommée par la pompe intérieure (Version B) : ${totalPumpColdConsumption.toFixed(2)} Wh</p>
        <p>Énergie consommée par le ventilateur (Version A) : ${totalFanConsumption.toFixed(2)} Wh</p>
        <p>Température finale côté chaud du Peltier : ${tempHotPeltier.toFixed(2)} °C</p>
        <p>Température finale côté froid du Peltier : ${tempColdPeltier.toFixed(2)} °C</p>
        <p>Énergie thermique échangée côté chaud : ${energyAccumHot.toFixed(2)} Wh</p>
        <p>Température finale du réservoir de dissipation : ${tempWaterHot.toFixed(2)} °C</p>
        <p>Énergie froide transmise à l'air : ${totalEnergyColdAir.toFixed(2)} Wh</p>
        <p>Énergie froide transmise à l'eau : ${totalEnergyColdWater.toFixed(2)} Wh</p>
        <p>Pertes thermiques totales de la caisse : ${totalHeatLoss.toFixed(2)} Wh</p>
        <p>Consommation totale sur ${simTimeMinutes} minutes : ${totalConsumption.toFixed(2)} Wh</p>
        <p class="comment">Commentaire : La température intérieure a évolué de ${modules["reservoir-frigo"].tempFrigoInit.toFixed(2)}°C à ${tempFrigo.toFixed(2)}°C, se rapprochant de la cible de ${tempIntTarget}°C.</p>
    `;
    resultsTextDiv.innerHTML = recapHTML;

    // Afficher les V-Cards avec les consommations
    const resultsVCardsDiv = document.getElementById('results-vcards');
    let vcardsHTML = '';
    for (const module in modules) {
        let moduleHTML = `
            <div class="vcard">
                <div class="image-container">
                    <img src="${modules[module].image}" alt="${module}" class="vcard-image">
                </div>
                <h3>${module}</h3>
        `;
        if (module === 'peltier') {
            moduleHTML += `<p>Conso. Totale : ${totalPeltierConsumption.toFixed(2)} Wh</p>`;
        } else if (module === 'pump-hot') {
            moduleHTML += `<p>Conso. Totale : ${totalPumpHotConsumption.toFixed(2)} Wh</p>`;
        } else if (module === 'pump-cold') {
            moduleHTML += `<p>Conso. Totale : ${totalPumpColdConsumption.toFixed(2)} Wh</p>`;
        } else if (module === 'fan') {
            moduleHTML += `<p>Conso. Totale : ${totalFanConsumption.toFixed(2)} Wh</p>`;
        } else if (module === 'caisse') {
            moduleHTML += `<p>Pertes Totales : ${totalHeatLoss.toFixed(2)} Wh</p>`;
        }
        moduleHTML += `</div>`;
        if (['peltier', 'pump-hot', 'pump-cold', 'fan', 'caisse'].includes(module)) {
            vcardsHTML += moduleHTML;
        }
    }
    resultsVCardsDiv.innerHTML = vcardsHTML;

    // Faire défiler jusqu’à la section des résultats
    document.getElementById('results-section').scrollIntoView({ behavior: 'smooth' });
};

// Initialiser la page
window.onload = function() {
    calculateDerivedParameters();
    updateSchema();

    const vcardButtons = document.querySelectorAll('.vcard button');
    vcardButtons.forEach(button => {
        const module = button.parentElement.querySelector('h3').getAttribute('data-module');
        button.addEventListener('click', () => window.openModal(module));
    });

    document.getElementById('tempExtMax').addEventListener('input', () => {
        window.updateVCards();
    });
};